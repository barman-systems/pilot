-- Preserve human handoff after the AI sends its final acknowledgement.
-- The generic outbound finalizer must not move an action_required conversation back
-- to waiting_customer while an active handoff exists.
create or replace function public.dabbir_whatsapp_finalize_outbound(
  p_reservation_id uuid,p_provider_message_id text
) returns table(message_id uuid,event_id uuid,reservation_state text,duplicate boolean)
language plpgsql
set search_path='pg_catalog','public','dabbir_private','auth'
as $function$
declare
  v_res public.dabbir_whatsapp_outbound_reservations%rowtype;
  v_message_id uuid;
  v_event_id uuid;
  v_provider_id text:=trim(coalesce(p_provider_message_id,''));
  v_handoff_active boolean:=false;
begin
  if p_reservation_id is null or length(v_provider_id) not between 3 and 320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  select * into v_res from public.dabbir_whatsapp_outbound_reservations where id=p_reservation_id for update;
  if not found then raise exception 'WHATSAPP_OUTBOUND_RESERVATION_NOT_FOUND'; end if;

  if v_res.state<>'SENDING' then
    if v_res.provider_message_id=v_provider_id and v_res.message_id is not null then
      return query select v_res.message_id,
        (select e.id from public.dabbir_whatsapp_event_ledger e where e.business_id=v_res.business_id and e.event_key='outbound:'||v_provider_id limit 1),
        v_res.state,true;
      return;
    end if;
    raise exception 'WHATSAPP_OUTBOUND_RESERVATION_NOT_FINALIZABLE';
  end if;

  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated,sender_user_id)
  values(
    v_res.business_id,v_res.conversation_id,v_res.sender_type,v_res.body,
    case when v_res.sender_type='ai' then 'AI_REPLY' else null end,false,
    case when v_res.sender_type='human' then v_res.sender_user_id else null end
  ) returning id into v_message_id;

  select exists(
    select 1 from public.dabbir_handoffs h
    where h.business_id=v_res.business_id and h.conversation_id=v_res.conversation_id
      and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  ) into v_handoff_active;

  update public.dabbir_conversations
     set state=case
       when v_res.sender_type='ai' and v_handoff_active then 'action_required'
       else 'waiting_customer'
     end,
     updated_at=now()
   where business_id=v_res.business_id and id=v_res.conversation_id;

  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,
    conversation_id,message_id,provider_status,provider_verified,occurred_at,evidence
  ) values(
    v_res.business_id,v_res.connection_id,'outbound:'||v_provider_id,'outbound','message',v_provider_id,
    v_res.conversation_id,v_message_id,'accepted',false,now(),
    jsonb_build_object('source','meta_messages_api','provider_accepted',true,'reservation_id',v_res.id,'sender_type',v_res.sender_type,'handoff_active',v_handoff_active)
  ) returning id into v_event_id;

  update public.dabbir_whatsapp_outbound_reservations
     set state='PROVIDER_ACCEPTED',provider_message_id=v_provider_id,message_id=v_message_id,
         provider_status='accepted',finalized_at=now(),error_code=null,updated_at=now()
   where id=v_res.id;

  return query select v_message_id,v_event_id,'PROVIDER_ACCEPTED'::text,false;
end;
$function$;
revoke all on function public.dabbir_whatsapp_finalize_outbound(uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_finalize_outbound(uuid,text) to service_role,authenticated;
