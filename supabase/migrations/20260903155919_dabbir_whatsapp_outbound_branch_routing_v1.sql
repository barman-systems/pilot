create or replace function public.dabbir_whatsapp_reserve_outbound(
  p_business_id uuid,
  p_conversation_id uuid,
  p_sender_user_id uuid,
  p_idempotency_key text,
  p_payload_hash text,
  p_body text
)
returns table(
  reservation_id uuid,
  should_send boolean,
  reservation_state text,
  connection_id uuid,
  phone_number_id text,
  recipient_handle text,
  provider_message_id text,
  message_id uuid
)
language plpgsql
security invoker
set search_path = pg_catalog, public, dabbir_private, auth
as $$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_existing public.dabbir_whatsapp_outbound_reservations%rowtype;
  v_recipient text;
  v_key text:=trim(coalesce(p_idempotency_key,''));
  v_hash text:=lower(trim(coalesce(p_payload_hash,'')));
begin
  if p_business_id is null or p_conversation_id is null or p_sender_user_id is null then raise exception 'WHATSAPP_OUTBOUND_CONTEXT_REQUIRED'; end if;
  if length(v_key) not between 16 and 160 then raise exception 'WHATSAPP_IDEMPOTENCY_KEY_REQUIRED'; end if;
  if v_hash !~ '^[0-9a-f]{64}$' then raise exception 'WHATSAPP_PAYLOAD_HASH_REQUIRED'; end if;
  if nullif(trim(p_body),'') is null or length(p_body)>4000 then raise exception 'WHATSAPP_MESSAGE_BODY_REQUIRED'; end if;

  if exists(select 1 from public.account_access_state s where s.user_id=p_sender_user_id and s.status='suspended') then
    raise exception 'WHATSAPP_REPLY_ACCOUNT_SUSPENDED';
  end if;
  if not exists(
    select 1 from auth.users u where u.id=p_sender_user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
  ) then raise exception 'WHATSAPP_REPLY_USER_INACTIVE'; end if;
  if not exists(
    select 1 from public.dabbir_memberships m
    where m.business_id=p_business_id and m.user_id=p_sender_user_id and m.status='active'
      and m.suspended_at is null and m.removed_at is null and m.role in ('owner','admin')
  ) then raise exception 'WHATSAPP_REPLY_APPROVER_REQUIRED'; end if;

  select * into v_conversation from public.dabbir_conversations c
  where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false
  limit 1;
  if not found or v_conversation.customer_id is null or v_conversation.branch_id is null then raise exception 'WHATSAPP_CONVERSATION_NOT_FOUND'; end if;

  select nullif(trim(c.channel_handle),'') into v_recipient
  from public.dabbir_customers c
  where c.business_id=p_business_id and c.id=v_conversation.customer_id
  limit 1;
  if v_recipient is null then raise exception 'WHATSAPP_CUSTOMER_HANDLE_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':wa-out:' || v_key,0));

  select * into v_existing from public.dabbir_whatsapp_outbound_reservations r
  where r.business_id=p_business_id and r.idempotency_key=v_key
  limit 1;
  if found then
    if v_existing.conversation_id<>p_conversation_id
      or v_existing.sender_user_id<>p_sender_user_id
      or v_existing.payload_hash<>v_hash then
      raise exception 'WHATSAPP_IDEMPOTENCY_KEY_REUSED_DIFFERENT_REQUEST';
    end if;
    select * into v_connection from public.dabbir_whatsapp_connections c
    where c.id=v_existing.connection_id and c.business_id=p_business_id limit 1;
    if not found then raise exception 'WHATSAPP_RESERVED_CONNECTION_NOT_FOUND'; end if;
    return query select v_existing.id,false,v_existing.state,v_existing.connection_id,
      v_connection.phone_number_id,v_existing.recipient_handle,v_existing.provider_message_id,v_existing.message_id;
    return;
  end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
  where c.business_id=p_business_id and c.branch_id=v_conversation.branch_id and c.status='connected'
  limit 1;
  if not found then raise exception 'WHATSAPP_BRANCH_CONNECTION_NOT_FOUND'; end if;

  insert into public.dabbir_whatsapp_outbound_reservations(
    business_id,connection_id,conversation_id,sender_user_id,idempotency_key,payload_hash,
    recipient_handle,body,state,external_attempt_started_at
  ) values (
    p_business_id,v_connection.id,p_conversation_id,p_sender_user_id,v_key,v_hash,
    v_recipient,left(trim(p_body),4000),'SENDING',now()
  ) returning * into v_existing;

  return query select v_existing.id,true,v_existing.state,v_existing.connection_id,
    v_connection.phone_number_id,v_existing.recipient_handle,null::text,null::uuid;
end;
$$;

revoke all on function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) to service_role;
