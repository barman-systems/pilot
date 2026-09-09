-- Reconcile the concurrent atomic-presentation migration with the validated
-- receipt helper, service-inquiry pending field, and object-shaped question.
-- Preserve atomic finalization and its message/finalization requirements.
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
     and dabbir_private.understanding_outbound_receipt_verified_v1(r.id)
     and r.idempotency_key like 'wa-understanding:'||b.id::text||':%'
 ) then raise exception 'COGNITIVE_PRESENTATION_UNVERIFIED'; end if;
 if p_next_field is not null and p_next_field not in ('service','vehicle','location','worker','date','time','delivery_mode','property_details','slot','appointment','intent_confirmation','vehicle_location_repeat','verified_history','multiple_options','offered_option','slot_confirmation','date_input','branch','voice_transcript','booking_confirmation','request','service_question_target') then raise exception 'COGNITIVE_PENDING_FIELD_INVALID'; end if;
 cognition:=s.semantic_state->'cognition';
 if cognition->>'version' is distinct from '1' then raise exception 'COGNITIVE_STATE_UNVERIFIED'; end if;
 if s.semantic_state->'last_verified_action'->>'at' is not null and (s.semantic_state->'last_verified_action'->>'at')::timestamptz>=(s.semantic_state->>'updated_at')::timestamptz then
  cognition:=cognition||jsonb_build_object('journey_stage','COMPLETED','active_journey',null,'pending_field',null,'pending_question',null,'last_tool_result',s.semantic_state->'last_verified_action');
 else
  cognition:=cognition||jsonb_build_object('pending_field',p_next_field,'pending_question',case when p_next_field is null then null else (case when jsonb_typeof(cognition->'pending_question')='object' then cognition->'pending_question' else '{}'::jsonb end)||jsonb_build_object('field',p_next_field,'presentation','PROVIDER_ACCEPTED','provider_message_id',p_provider_message_id) end,
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
