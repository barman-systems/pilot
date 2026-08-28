-- BAR-13 v2: real WhatsApp inbound persistence + reserve/send/finalize outbound semantics.
-- This migration is intentionally later than the 04:29 active-membership root fix
-- and 04:37 recovery hardening migrations. No raw webhook payload or access token
-- is stored in the evidence tables.

create unique index if not exists dabbir_customers_business_channel_handle_uq
  on public.dabbir_customers(business_id, channel_handle)
  where channel_handle is not null;

create unique index if not exists dabbir_messages_business_id_id_uq
  on public.dabbir_messages(business_id, id);

create table if not exists public.dabbir_whatsapp_event_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  connection_id uuid not null references public.dabbir_whatsapp_connections(id) on delete cascade,
  event_key text not null,
  direction text not null check (direction in ('inbound','outbound','status')),
  event_type text not null check (event_type in ('message','status')),
  provider_message_id text,
  conversation_id uuid,
  message_id uuid,
  provider_status text,
  provider_verified boolean not null default false,
  occurred_at timestamptz not null default now(),
  verified_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_whatsapp_event_key_nonempty check (length(trim(event_key)) between 3 and 320),
  constraint dabbir_whatsapp_provider_message_id_bounded check (provider_message_id is null or length(provider_message_id) between 3 and 320),
  constraint dabbir_whatsapp_event_business_key_uq unique (business_id, event_key),
  constraint dabbir_whatsapp_event_business_conversation_fk foreign key (business_id, conversation_id)
    references public.dabbir_conversations(business_id, id) on delete cascade,
  constraint dabbir_whatsapp_event_business_message_fk foreign key (business_id, message_id)
    references public.dabbir_messages(business_id, id) on delete cascade
);

create index if not exists dabbir_whatsapp_event_business_time_idx
  on public.dabbir_whatsapp_event_ledger(business_id, occurred_at desc);
create index if not exists dabbir_whatsapp_event_provider_message_idx
  on public.dabbir_whatsapp_event_ledger(business_id, provider_message_id)
  where provider_message_id is not null;

create table if not exists public.dabbir_whatsapp_outbound_reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  connection_id uuid not null references public.dabbir_whatsapp_connections(id) on delete cascade,
  conversation_id uuid not null,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  payload_hash text not null,
  recipient_handle text not null,
  body text not null,
  state text not null default 'SENDING' check (state in ('SENDING','PROVIDER_ACCEPTED','SENT','DELIVERED','READ','FAILED','AMBIGUOUS')),
  provider_message_id text,
  message_id uuid,
  provider_status text,
  provider_verified boolean not null default false,
  external_attempt_started_at timestamptz not null default now(),
  finalized_at timestamptz,
  verified_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_whatsapp_outbound_idempotency_key_check check (length(trim(idempotency_key)) between 16 and 160),
  constraint dabbir_whatsapp_outbound_payload_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint dabbir_whatsapp_outbound_recipient_check check (length(trim(recipient_handle)) between 5 and 160),
  constraint dabbir_whatsapp_outbound_body_check check (length(trim(body)) between 1 and 4000),
  constraint dabbir_whatsapp_outbound_provider_message_check check (provider_message_id is null or length(provider_message_id) between 3 and 320),
  constraint dabbir_whatsapp_outbound_business_idempotency_uq unique (business_id, idempotency_key),
  constraint dabbir_whatsapp_outbound_business_conversation_fk foreign key (business_id, conversation_id)
    references public.dabbir_conversations(business_id, id) on delete cascade,
  constraint dabbir_whatsapp_outbound_business_message_fk foreign key (business_id, message_id)
    references public.dabbir_messages(business_id, id) on delete cascade
);

create unique index if not exists dabbir_whatsapp_outbound_provider_message_uq
  on public.dabbir_whatsapp_outbound_reservations(business_id, provider_message_id)
  where provider_message_id is not null;
create index if not exists dabbir_whatsapp_outbound_conversation_idx
  on public.dabbir_whatsapp_outbound_reservations(business_id, conversation_id, created_at desc);

alter table public.dabbir_whatsapp_event_ledger enable row level security;
alter table public.dabbir_whatsapp_event_ledger force row level security;
alter table public.dabbir_whatsapp_outbound_reservations enable row level security;
alter table public.dabbir_whatsapp_outbound_reservations force row level security;
revoke all on public.dabbir_whatsapp_event_ledger from public, anon, authenticated;
revoke all on public.dabbir_whatsapp_outbound_reservations from public, anon, authenticated;
grant select, insert, update on public.dabbir_whatsapp_event_ledger to service_role;
grant select, insert, update on public.dabbir_whatsapp_outbound_reservations to service_role;

create or replace function public.dabbir_whatsapp_persist_inbound(
  p_phone_number_id text,
  p_provider_message_id text,
  p_sender_handle text,
  p_display_name text,
  p_body text,
  p_intent text,
  p_occurred_at timestamptz default now()
)
returns table(
  business_id uuid,
  connection_id uuid,
  customer_id uuid,
  conversation_id uuid,
  message_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, auth
as $$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_existing public.dabbir_whatsapp_event_ledger%rowtype;
  v_event_key text;
  v_name text;
begin
  if nullif(trim(p_phone_number_id),'') is null then raise exception 'WHATSAPP_PHONE_NUMBER_ID_REQUIRED'; end if;
  if nullif(trim(p_provider_message_id),'') is null or length(p_provider_message_id) > 320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  if nullif(trim(p_sender_handle),'') is null or length(p_sender_handle) > 160 then raise exception 'WHATSAPP_SENDER_REQUIRED'; end if;
  if nullif(trim(p_body),'') is null or length(p_body) > 4000 then raise exception 'WHATSAPP_MESSAGE_BODY_REQUIRED'; end if;

  select * into v_connection
  from public.dabbir_whatsapp_connections c
  where c.phone_number_id=trim(p_phone_number_id)
    and c.status='connected'
  limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  v_event_key := 'inbound:' || trim(p_provider_message_id);
  perform pg_advisory_xact_lock(hashtextextended(v_connection.business_id::text || ':' || v_event_key, 0));

  select * into v_existing
  from public.dabbir_whatsapp_event_ledger e
  where e.business_id=v_connection.business_id and e.event_key=v_event_key
  limit 1;
  if found then
    return query select v_existing.business_id,v_existing.connection_id,
      (select c.customer_id from public.dabbir_conversations c where c.id=v_existing.conversation_id),
      v_existing.conversation_id,v_existing.message_id,true;
    return;
  end if;

  v_name := left(coalesce(nullif(trim(p_display_name),''),'WhatsApp Customer'),120);
  insert into public.dabbir_customers(business_id,display_name,channel_handle,lead_status,metadata)
  values(v_connection.business_id,v_name,trim(p_sender_handle),'new',jsonb_build_object('source','whatsapp','provider','meta'))
  on conflict (business_id,channel_handle) where channel_handle is not null
  do update set
    display_name=case when excluded.display_name<>'WhatsApp Customer' then excluded.display_name else public.dabbir_customers.display_name end,
    metadata=coalesce(public.dabbir_customers.metadata,'{}'::jsonb) || jsonb_build_object('source','whatsapp','provider','meta')
  returning id into v_customer_id;

  select c.id into v_conversation_id
  from public.dabbir_conversations c
  where c.business_id=v_connection.business_id
    and c.customer_id=v_customer_id
    and c.channel_type='whatsapp'
    and c.demo_mode=false
    and c.state<>'closed'
  order by c.updated_at desc
  limit 1
  for update;

  if v_conversation_id is null then
    insert into public.dabbir_conversations(business_id,customer_id,channel_type,state,demo_mode)
    values(v_connection.business_id,v_customer_id,'whatsapp','ai_active',false)
    returning id into v_conversation_id;
  else
    update public.dabbir_conversations
    set state=case when state='waiting_customer' then 'ai_active' else state end,
        updated_at=now()
    where id=v_conversation_id and business_id=v_connection.business_id;
  end if;

  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated)
  values(v_connection.business_id,v_conversation_id,'customer',left(trim(p_body),4000),nullif(left(trim(coalesce(p_intent,'')),120),''),false)
  returning id into v_message_id;

  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,
    conversation_id,message_id,provider_status,provider_verified,occurred_at,verified_at,evidence
  ) values (
    v_connection.business_id,v_connection.id,v_event_key,'inbound','message',trim(p_provider_message_id),
    v_conversation_id,v_message_id,'received',true,coalesce(p_occurred_at,now()),now(),
    jsonb_build_object('source','meta_signed_webhook','signature_verified',true)
  );

  update public.dabbir_whatsapp_connections
  set last_verified_at=now(),last_provider_status=200,last_error=null,updated_at=now()
  where id=v_connection.id;

  return query select v_connection.business_id,v_connection.id,v_customer_id,v_conversation_id,v_message_id,false;
end;
$$;

revoke all on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) to service_role;

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
security definer
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
    select 1 from auth.users u
    where u.id=p_sender_user_id
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now())
  ) then raise exception 'WHATSAPP_REPLY_USER_INACTIVE'; end if;
  if not exists(
    select 1 from public.dabbir_memberships m
    where m.business_id=p_business_id
      and m.user_id=p_sender_user_id
      and m.status='active'
      and m.suspended_at is null
      and m.removed_at is null
      and m.role in ('owner','admin')
  ) then raise exception 'WHATSAPP_REPLY_APPROVER_REQUIRED'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
  where c.business_id=p_business_id and c.status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  select * into v_conversation from public.dabbir_conversations c
  where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false
  limit 1;
  if not found or v_conversation.customer_id is null then raise exception 'WHATSAPP_CONVERSATION_NOT_FOUND'; end if;

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
    return query select v_existing.id,false,v_existing.state,v_existing.connection_id,
      v_connection.phone_number_id,v_existing.recipient_handle,v_existing.provider_message_id,v_existing.message_id;
    return;
  end if;

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

create or replace function public.dabbir_whatsapp_finalize_outbound(
  p_reservation_id uuid,
  p_provider_message_id text
)
returns table(message_id uuid,event_id uuid,reservation_state text,duplicate boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, auth
as $$
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
  values(v_res.business_id,v_res.conversation_id,'human',v_res.body,null,false,v_res.sender_user_id)
  returning id into v_message_id;

  update public.dabbir_conversations
  set state='waiting_customer',updated_at=now()
  where business_id=v_res.business_id and id=v_res.conversation_id;

  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,
    conversation_id,message_id,provider_status,provider_verified,occurred_at,evidence
  ) values (
    v_res.business_id,v_res.connection_id,'outbound:'||v_provider_id,'outbound','message',v_provider_id,
    v_res.conversation_id,v_message_id,'accepted',false,now(),
    jsonb_build_object('source','meta_messages_api','provider_accepted',true,'reservation_id',v_res.id)
  ) returning id into v_event_id;

  update public.dabbir_whatsapp_outbound_reservations
  set state='PROVIDER_ACCEPTED',provider_message_id=v_provider_id,message_id=v_message_id,
      provider_status='accepted',finalized_at=now(),error_code=null,updated_at=now()
  where id=v_res.id;

  return query select v_message_id,v_event_id,'PROVIDER_ACCEPTED'::text,false;
end;
$$;

revoke all on function public.dabbir_whatsapp_finalize_outbound(uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_finalize_outbound(uuid,text) to service_role;

create or replace function public.dabbir_whatsapp_mark_outbound_result(
  p_reservation_id uuid,
  p_state text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, auth
as $$
declare v_state text:=upper(trim(coalesce(p_state,'')));
begin
  if v_state not in ('FAILED','AMBIGUOUS') then raise exception 'WHATSAPP_OUTBOUND_TERMINAL_STATE_INVALID'; end if;
  update public.dabbir_whatsapp_outbound_reservations
  set state=v_state,error_code=left(nullif(trim(coalesce(p_error_code,'')),''),160),updated_at=now()
  where id=p_reservation_id and state='SENDING';
  return found;
end;
$$;

revoke all on function public.dabbir_whatsapp_mark_outbound_result(uuid,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_mark_outbound_result(uuid,text,text) to service_role;

create or replace function public.dabbir_whatsapp_apply_status(
  p_phone_number_id text,
  p_provider_message_id text,
  p_status text,
  p_occurred_at timestamptz default now()
)
returns table(matched boolean,provider_verified boolean,conversation_id uuid,message_id uuid,reservation_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, auth
as $$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_res public.dabbir_whatsapp_outbound_reservations%rowtype;
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_verified boolean;
  v_next_state text;
  v_status_key text;
begin
  if nullif(trim(p_phone_number_id),'') is null or nullif(trim(p_provider_message_id),'') is null then raise exception 'WHATSAPP_STATUS_CONTEXT_REQUIRED'; end if;
  if v_status not in ('sent','delivered','read','failed','deleted') then raise exception 'WHATSAPP_STATUS_INVALID'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
  where c.phone_number_id=trim(p_phone_number_id) and c.status='connected' limit 1;
  if not found then return query select false,false,null::uuid,null::uuid,null::text; return; end if;

  select * into v_res from public.dabbir_whatsapp_outbound_reservations r
  where r.business_id=v_connection.business_id and r.provider_message_id=trim(p_provider_message_id)
  for update;
  if not found then return query select false,false,null::uuid,null::uuid,null::text; return; end if;

  v_verified:=v_status in ('delivered','read');
  v_next_state:=case v_status when 'sent' then 'SENT' when 'delivered' then 'DELIVERED' when 'read' then 'READ' else 'FAILED' end;

  update public.dabbir_whatsapp_outbound_reservations
  set state=case
        when state='READ' then 'READ'
        when state='DELIVERED' and v_next_state='SENT' then 'DELIVERED'
        when state in ('DELIVERED','READ') and v_next_state='FAILED' then state
        else v_next_state end,
      provider_status=v_status,
      provider_verified=provider_verified or v_verified,
      verified_at=case when v_verified then coalesce(verified_at,now()) else verified_at end,
      error_code=case when v_next_state='FAILED' then 'META_OUTBOUND_'||upper(v_status) else null end,
      updated_at=now()
  where id=v_res.id
  returning state into v_next_state;

  update public.dabbir_whatsapp_event_ledger
  set provider_status=v_status,
      provider_verified=provider_verified or v_verified,
      verified_at=case when v_verified then coalesce(verified_at,now()) else verified_at end,
      updated_at=now(),
      evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('status_source','meta_signed_webhook')
  where business_id=v_res.business_id and event_key='outbound:'||trim(p_provider_message_id);

  v_status_key:='status:'||trim(p_provider_message_id)||':'||v_status||':'||extract(epoch from coalesce(p_occurred_at,now()))::bigint::text;
  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,
    conversation_id,message_id,provider_status,provider_verified,occurred_at,verified_at,evidence
  ) values (
    v_res.business_id,v_res.connection_id,v_status_key,'status','status',trim(p_provider_message_id),
    v_res.conversation_id,v_res.message_id,v_status,v_verified,coalesce(p_occurred_at,now()),
    case when v_verified then now() else null end,jsonb_build_object('source','meta_signed_webhook','reservation_id',v_res.id)
  ) on conflict (business_id,event_key) do nothing;

  update public.dabbir_whatsapp_connections
  set last_verified_at=case when v_verified then now() else last_verified_at end,
      last_provider_status=200,
      last_error=case when v_next_state='FAILED' then 'META_OUTBOUND_'||upper(v_status) else null end,
      updated_at=now()
  where id=v_connection.id;

  return query select true,v_verified,v_res.conversation_id,v_res.message_id,v_next_state;
end;
$$;

revoke all on function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) to service_role;

create or replace function public.dabbir_whatsapp_operational_evidence(p_business_id uuid)
returns table(
  available boolean,
  real_whatsapp_conversation boolean,
  real_inbound_message boolean,
  real_outbound_reply boolean,
  verified_external_result boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dabbir_private, auth
as $$
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'view_integrations') then raise exception 'INTEGRATION_VIEW_REQUIRED'; end if;

  return query
  select true,
    exists(select 1 from public.dabbir_conversations c where c.business_id=p_business_id and c.channel_type='whatsapp' and c.demo_mode=false),
    exists(select 1 from public.dabbir_whatsapp_event_ledger e where e.business_id=p_business_id and e.direction='inbound' and e.event_type='message' and e.message_id is not null),
    exists(select 1 from public.dabbir_whatsapp_outbound_reservations r where r.business_id=p_business_id and r.message_id is not null and r.provider_message_id is not null and r.state in ('PROVIDER_ACCEPTED','SENT','DELIVERED','READ')),
    exists(select 1 from public.dabbir_whatsapp_outbound_reservations r where r.business_id=p_business_id and r.provider_verified=true and r.state in ('DELIVERED','READ'));
end;
$$;

revoke all on function public.dabbir_whatsapp_operational_evidence(uuid) from public,anon;
grant execute on function public.dabbir_whatsapp_operational_evidence(uuid) to authenticated;
