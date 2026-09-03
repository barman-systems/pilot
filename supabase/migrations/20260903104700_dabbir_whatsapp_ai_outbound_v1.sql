-- DABBIR WhatsApp AI receptionist P0: truthful AI outbound identity.
-- Human reply flow remains intact. AI replies use sender_type='ai' and no fake user id.

alter table public.dabbir_whatsapp_outbound_reservations
  alter column sender_user_id drop not null,
  add column if not exists sender_type text not null default 'human';

alter table public.dabbir_whatsapp_outbound_reservations
  drop constraint if exists dabbir_whatsapp_outbound_reservations_sender_type_check;
alter table public.dabbir_whatsapp_outbound_reservations
  add constraint dabbir_whatsapp_outbound_reservations_sender_type_check
    check (sender_type in ('human','ai'));

-- Existing human reservation function keeps its exact authorization model and relies
-- on the sender_type default='human'. AI gets a separate service-role-only function.
create or replace function public.dabbir_whatsapp_ai_reserve_outbound(
  p_business_id uuid,p_conversation_id uuid,p_idempotency_key text,p_payload_hash text,p_body text
) returns table(
  reservation_id uuid,should_send boolean,reservation_state text,connection_id uuid,
  phone_number_id text,recipient_handle text,provider_message_id text,message_id uuid
)
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_existing public.dabbir_whatsapp_outbound_reservations%rowtype;
  v_recipient text;
  v_key text:=trim(coalesce(p_idempotency_key,''));
  v_hash text:=lower(trim(coalesce(p_payload_hash,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_business_id is null or p_conversation_id is null then raise exception 'WHATSAPP_AI_OUTBOUND_CONTEXT_REQUIRED'; end if;
  if length(v_key) not between 16 and 160 then raise exception 'WHATSAPP_IDEMPOTENCY_KEY_REQUIRED'; end if;
  if v_hash !~ '^[0-9a-f]{64}$' then raise exception 'WHATSAPP_PAYLOAD_HASH_REQUIRED'; end if;
  if nullif(trim(p_body),'') is null or length(p_body)>4000 then raise exception 'WHATSAPP_MESSAGE_BODY_REQUIRED'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
   where c.business_id=p_business_id and c.status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  select * into v_conversation from public.dabbir_conversations c
   where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false limit 1;
  if not found or v_conversation.customer_id is null then raise exception 'WHATSAPP_CONVERSATION_NOT_FOUND'; end if;
  if v_conversation.state='human_active' then raise exception 'WHATSAPP_AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;

  select nullif(trim(c.channel_handle),'') into v_recipient from public.dabbir_customers c
   where c.business_id=p_business_id and c.id=v_conversation.customer_id limit 1;
  if v_recipient is null then raise exception 'WHATSAPP_CUSTOMER_HANDLE_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':wa-ai-out:'||v_key,0));
  select * into v_existing from public.dabbir_whatsapp_outbound_reservations r
   where r.business_id=p_business_id and r.idempotency_key=v_key limit 1;
  if found then
    if v_existing.conversation_id<>p_conversation_id or v_existing.sender_type<>'ai' or v_existing.payload_hash<>v_hash then
      raise exception 'WHATSAPP_IDEMPOTENCY_KEY_REUSED_DIFFERENT_REQUEST';
    end if;
    return query select v_existing.id,false,v_existing.state,v_existing.connection_id,
      v_connection.phone_number_id,v_existing.recipient_handle,v_existing.provider_message_id,v_existing.message_id;
    return;
  end if;

  insert into public.dabbir_whatsapp_outbound_reservations(
    business_id,connection_id,conversation_id,sender_user_id,sender_type,idempotency_key,payload_hash,
    recipient_handle,body,state,external_attempt_started_at
  ) values(
    p_business_id,v_connection.id,p_conversation_id,null,'ai',v_key,v_hash,
    v_recipient,left(trim(p_body),4000),'SENDING',now()
  ) returning * into v_existing;

  return query select v_existing.id,true,v_existing.state,v_existing.connection_id,
    v_connection.phone_number_id,v_existing.recipient_handle,null::text,null::uuid;
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_reserve_outbound(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_reserve_outbound(uuid,uuid,text,text,text) to service_role;

-- Generic finalizer now records the truthful reservation sender type. Human
-- reservations remain human; AI reservations are stored as AI with sender_user_id NULL.
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

  update public.dabbir_conversations set state='waiting_customer',updated_at=now()
   where business_id=v_res.business_id and id=v_res.conversation_id;

  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,
    conversation_id,message_id,provider_status,provider_verified,occurred_at,evidence
  ) values(
    v_res.business_id,v_res.connection_id,'outbound:'||v_provider_id,'outbound','message',v_provider_id,
    v_res.conversation_id,v_message_id,'accepted',false,now(),
    jsonb_build_object('source','meta_messages_api','provider_accepted',true,'reservation_id',v_res.id,'sender_type',v_res.sender_type)
  ) returning id into v_event_id;

  update public.dabbir_whatsapp_outbound_reservations
     set state='PROVIDER_ACCEPTED',provider_message_id=v_provider_id,message_id=v_message_id,
         provider_status='accepted',finalized_at=now(),error_code=null,updated_at=now()
   where id=v_res.id;

  return query select v_message_id,v_event_id,'PROVIDER_ACCEPTED'::text,false;
end;
$function$;
revoke all on function public.dabbir_whatsapp_finalize_outbound(uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_finalize_outbound(uuid,text) to service_role;
-- Human same-origin API reaches this RPC with authenticated owner context today;
-- preserve that existing path explicitly.
grant execute on function public.dabbir_whatsapp_finalize_outbound(uuid,text) to authenticated;

create or replace function public.dabbir_whatsapp_ai_connection(p_business_id uuid,p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare v_connection public.dabbir_whatsapp_connections%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_connection from public.dabbir_whatsapp_connections
   where id=p_connection_id and business_id=p_business_id and status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;
  return jsonb_build_object(
    'id',v_connection.id,'business_id',v_connection.business_id,'status',v_connection.status,
    'phone_number_id',v_connection.phone_number_id,'waba_id',v_connection.waba_id,
    'access_token_ciphertext',v_connection.access_token_ciphertext,
    'access_token_iv',v_connection.access_token_iv,'access_token_tag',v_connection.access_token_tag,
    'token_key_version',v_connection.token_key_version,'token_expires_at',v_connection.token_expires_at
  );
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_connection(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_connection(uuid,uuid) to service_role;
