-- Close the live WhatsApp presentation race without weakening execution gates.
-- Provider acceptance is the moment a customer can first see an option list, so
-- the verified presentation flag must be committed in the same transaction as
-- the outbound reservation. Customer replies may supersede interpretation, but
-- they must never erase truthful evidence of what Meta already accepted.

create or replace function public.dabbir_whatsapp_finalize_outbound(
  p_reservation_id uuid,p_provider_message_id text
) returns table(message_id uuid,event_id uuid,reservation_state text,duplicate boolean)
language plpgsql
set search_path=pg_catalog,public,dabbir_private,auth
as $function$
declare
  v_res public.dabbir_whatsapp_outbound_reservations%rowtype;
  v_message_id uuid;
  v_event_id uuid;
  v_provider_id text:=trim(coalesce(p_provider_message_id,''));
  v_handoff_active boolean:=false;
  v_understanding_batch uuid;
  v_purpose text;
begin
  if p_reservation_id is null or length(v_provider_id) not between 3 and 320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  select * into v_res from public.dabbir_whatsapp_outbound_reservations where id=p_reservation_id for update;
  if not found then raise exception 'WHATSAPP_OUTBOUND_RESERVATION_NOT_FOUND'; end if;
  if v_res.state<>'SENDING' then
    if v_res.provider_message_id=v_provider_id and v_res.message_id is not null then
      return query select v_res.message_id,(select e.id from public.dabbir_whatsapp_event_ledger e where e.business_id=v_res.business_id and e.event_key='outbound:'||v_provider_id limit 1),v_res.state,true;
      return;
    end if;
    raise exception 'WHATSAPP_OUTBOUND_RESERVATION_NOT_FINALIZABLE';
  end if;
  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated,sender_user_id)
  values(v_res.business_id,v_res.conversation_id,v_res.sender_type,v_res.body,case when v_res.sender_type='ai' then 'AI_REPLY' else null end,false,case when v_res.sender_type='human' then v_res.sender_user_id else null end)
  returning id into v_message_id;
  select exists(select 1 from public.dabbir_handoffs h where h.business_id=v_res.business_id and h.conversation_id=v_res.conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) into v_handoff_active;
  update public.dabbir_conversations
     set state=case when v_res.sender_type='ai' and v_handoff_active then 'action_required' else 'waiting_customer' end,updated_at=now()
   where business_id=v_res.business_id and id=v_res.conversation_id;
  insert into public.dabbir_whatsapp_event_ledger(business_id,connection_id,event_key,direction,event_type,provider_message_id,conversation_id,message_id,provider_status,provider_verified,occurred_at,evidence)
  values(v_res.business_id,v_res.connection_id,'outbound:'||v_provider_id,'outbound','message',v_provider_id,v_res.conversation_id,v_message_id,'accepted',false,now(),jsonb_build_object('source','meta_messages_api','provider_accepted',true,'reservation_id',v_res.id,'sender_type',v_res.sender_type,'handoff_active',v_handoff_active)) returning id into v_event_id;
  update public.dabbir_whatsapp_outbound_reservations set state='PROVIDER_ACCEPTED',provider_message_id=v_provider_id,message_id=v_message_id,provider_status='accepted',finalized_at=now(),error_code=null,updated_at=now() where id=v_res.id;

  -- Normal AI text presentations use wa-understanding:<batch>:<purpose>. Only
  -- the exact current semantic batch may certify its own pending option set.
  if v_res.sender_type='ai' and v_res.idempotency_key ~ '^wa-understanding:[0-9a-f-]{36}:[a-z0-9_-]+$' then
    begin
      v_understanding_batch:=split_part(v_res.idempotency_key,':',2)::uuid;
      v_purpose:=split_part(v_res.idempotency_key,':',3);
    exception when invalid_text_representation then
      v_understanding_batch:=null;
    end;
    if v_understanding_batch is not null then
      update public.dabbir_ai_conversation_state s
         set payload=s.payload||jsonb_build_object('presented',true,'provider_message_id',v_provider_id),
             updated_at=now()
       where s.business_id=v_res.business_id
         and s.conversation_id=v_res.conversation_id
         and s.semantic_batch_id=v_understanding_batch
         and coalesce(s.payload->>'presented','false')='false'
         and (
           (s.pending_action='choose_service' and v_purpose='reply' and jsonb_array_length(coalesce(s.payload->'services','[]'::jsonb))>0)
           or (s.pending_action='choose_slot' and v_purpose='availability' and jsonb_array_length(coalesce(s.payload->'slots','[]'::jsonb))>0)
           or (s.pending_action='choose_appointment' and v_purpose='clarify' and jsonb_array_length(coalesce(s.payload->'appointments','[]'::jsonb))>0)
         );
    end if;
  end if;

  return query select v_message_id,v_event_id,'PROVIDER_ACCEPTED'::text,false;
end;
$function$;

-- A Meta Messages API provider id persisted as PROVIDER_ACCEPTED is already a
-- verified send acceptance. Later DELIVERED/READ callbacks remain accepted too.
create or replace function public.dabbir_cognitive_record_delivery_v1(p_batch_id uuid,p_lock_token uuid,p_version bigint,p_provider_message_id text,p_next_field text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $function$
declare b public.dabbir_message_batches%rowtype; s public.dabbir_ai_conversation_state%rowtype; cognition jsonb;
begin
 b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
 perform public.dabbir_semantic_assert_current_v2(p_batch_id,p_lock_token,p_version);
 select * into s from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id for update;
 if s.semantic_version<>p_version or s.semantic_batch_id<>b.id then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
 if p_provider_message_id is null or not exists(
   select 1 from public.dabbir_whatsapp_outbound_reservations r
   where r.business_id=b.business_id and r.conversation_id=b.conversation_id
     and r.provider_message_id=p_provider_message_id
     and r.message_id is not null and r.finalized_at is not null
     and (r.state='PROVIDER_ACCEPTED' or r.state='SENT' or (r.state in ('DELIVERED','READ') and r.provider_verified=true))
     and r.idempotency_key like 'wa-understanding:'||b.id::text||':%'
 ) then raise exception 'COGNITIVE_PRESENTATION_UNVERIFIED'; end if;
 if p_next_field is not null and p_next_field not in ('service','vehicle','location','worker','date','time','delivery_mode','property_details','slot','appointment','intent_confirmation','vehicle_location_repeat','verified_history','multiple_options','offered_option','slot_confirmation','date_input','branch','voice_transcript','booking_confirmation','request') then raise exception 'COGNITIVE_PENDING_FIELD_INVALID'; end if;
 cognition:=s.semantic_state->'cognition';
 if cognition->>'version' is distinct from '1' then raise exception 'COGNITIVE_STATE_UNVERIFIED'; end if;
 if s.semantic_state->'last_verified_action'->>'at' is not null and (s.semantic_state->'last_verified_action'->>'at')::timestamptz>=(s.semantic_state->>'updated_at')::timestamptz then
  cognition:=cognition||jsonb_build_object('journey_stage','COMPLETED','active_journey',null,'pending_field',null,'pending_question',null,'last_tool_result',s.semantic_state->'last_verified_action');
 else
  cognition:=cognition||jsonb_build_object('pending_field',p_next_field,'pending_question',case when p_next_field is null then null else coalesce(cognition->'pending_question','{}'::jsonb)||jsonb_build_object('field',p_next_field,'presentation','PROVIDER_ACCEPTED','provider_message_id',p_provider_message_id) end,
    'journey_stage',case when p_next_field='slot' then 'AWAITING_SLOT_SELECTION' else cognition->>'journey_stage' end);
 end if;
 update public.dabbir_ai_conversation_state set semantic_state=jsonb_set(semantic_state,'{cognition}',cognition) where business_id=b.business_id and conversation_id=b.conversation_id;
 insert into public.dabbir_ai_understanding_events(business_id,conversation_id,batch_id,event_type,version,metrics)
 values(b.business_id,b.conversation_id,b.id,'COGNITIVE_PRESENTED',p_version,jsonb_build_object('pending_field',p_next_field,'provider_accepted',true))
 on conflict do nothing;
 return jsonb_build_object('verified',true,'version',p_version);
end $function$;
revoke all on function public.dabbir_cognitive_record_delivery_v1(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_cognitive_record_delivery_v1(uuid,uuid,bigint,text,text) to service_role;
