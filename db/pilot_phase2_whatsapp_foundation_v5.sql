-- PILOT Phase 2 WhatsApp foundation.
-- Source-first schema only. This does NOT connect Meta, send messages, or enable patient data.
-- Runtime writes are reserved for a server-only identity; authenticated users retain existing read/operational policies only.

-- A provider account/phone number must resolve to at most one tenant.
create unique index if not exists pilot_channels_provider_account_unique
  on public.pilot_channels(channel_type, external_account_id)
  where external_account_id is not null;

-- Extend the existing event inbox instead of creating a duplicate webhook ledger.
alter table public.pilot_event_inbox drop constraint if exists pilot_event_inbox_event_type_check;
alter table public.pilot_event_inbox add constraint pilot_event_inbox_event_type_check check (
  event_type in (
    'ABANDONED_CHECKOUT','PAYMENT_FAILED','ORDER_DELAYED','ORDER_SHIPPED',
    'APPOINTMENT_UNCONFIRMED','APPOINTMENT_NO_SHOW','PRODUCT_BACK_IN_STOCK',
    'LEAD_INACTIVE','NEW_INQUIRY_WITHOUT_REPLY',
    'CHANNEL_MESSAGE_RECEIVED','CHANNEL_MESSAGE_STATUS'
  )
);

-- Replace the legacy ID-only customer FK with a tenant-safe relationship.
alter table public.pilot_event_inbox drop constraint if exists pilot_event_inbox_customer_id_fkey;
alter table public.pilot_event_inbox drop constraint if exists pilot_event_inbox_business_customer_fk;
alter table public.pilot_event_inbox add constraint pilot_event_inbox_business_customer_fk
  foreign key (business_id,customer_id)
  references public.pilot_customers(business_id,id)
  on delete set null;
create index if not exists pilot_event_inbox_business_customer_idx
  on public.pilot_event_inbox(business_id,customer_id)
  where customer_id is not null;

-- Store only a one-way hash of provider message IDs. This is sufficient for dedup/status correlation
-- without persisting the raw Meta message identifier.
alter table public.pilot_messages add column if not exists external_source text;
alter table public.pilot_messages add column if not exists external_message_id_hash text;
alter table public.pilot_messages add column if not exists delivery_state text not null default 'UNKNOWN';
alter table public.pilot_messages add column if not exists external_status_updated_at timestamptz;

alter table public.pilot_messages drop constraint if exists pilot_messages_external_source_check;
alter table public.pilot_messages add constraint pilot_messages_external_source_check check (
  external_source is null or external_source in ('whatsapp','instagram','web')
);
alter table public.pilot_messages drop constraint if exists pilot_messages_external_message_hash_check;
alter table public.pilot_messages add constraint pilot_messages_external_message_hash_check check (
  external_message_id_hash is null or external_message_id_hash ~ '^[0-9a-f]{64}$'
);
alter table public.pilot_messages drop constraint if exists pilot_messages_external_pair_check;
alter table public.pilot_messages add constraint pilot_messages_external_pair_check check (
  (external_source is null and external_message_id_hash is null)
  or (external_source is not null and external_message_id_hash is not null)
);
alter table public.pilot_messages drop constraint if exists pilot_messages_delivery_state_check;
alter table public.pilot_messages add constraint pilot_messages_delivery_state_check check (
  delivery_state in ('UNKNOWN','RECEIVED','ACCEPTED','SENT','DELIVERED','READ','FAILED')
);
create unique index if not exists pilot_messages_external_message_unique
  on public.pilot_messages(business_id,external_source,external_message_id_hash)
  where external_message_id_hash is not null;
create index if not exists pilot_messages_external_status_idx
  on public.pilot_messages(business_id,external_source,external_message_id_hash,delivery_state)
  where external_message_id_hash is not null;

-- The event inbox remains server-write only. Explicitly retain least privilege.
revoke insert,update,delete,truncate,references,trigger on public.pilot_event_inbox from anon,authenticated;
revoke update,delete,truncate,references,trigger on public.pilot_messages from anon,authenticated;

-- Small index closure from the preceding privacy tranche.
create index if not exists pilot_privacy_audit_request_idx
  on public.pilot_privacy_audit(privacy_request_id)
  where privacy_request_id is not null;

-- Atomic inbound ingestion. This function is deliberately service-role only and cannot be invoked
-- by anonymous/authenticated clients. It prevents duplicate webhook delivery and customer-identity races.
create or replace function public.pilot_ingest_whatsapp_message(
  p_phone_number_id text,
  p_external_event_hash text,
  p_external_message_hash text,
  p_customer_identity_hash text,
  p_customer_handle text,
  p_body text,
  p_intent text,
  p_message_type text,
  p_occurred_at timestamptz,
  p_safe_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_channel public.pilot_channels%rowtype;
  v_business_type text;
  v_patient_allowed boolean := false;
  v_event_id uuid;
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
begin
  if p_phone_number_id is null or btrim(p_phone_number_id)='' then raise exception 'UNKNOWN_CONNECTION'; end if;
  if p_external_event_hash !~ '^[0-9a-f]{64}$' or p_external_message_hash !~ '^[0-9a-f]{64}$' or p_customer_identity_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_EXTERNAL_HASH';
  end if;
  if p_body is null or length(p_body)=0 or length(p_body)>4000 then raise exception 'INVALID_MESSAGE_BODY'; end if;
  if octet_length(coalesce(p_safe_metadata,'{}'::jsonb)::text)>8192 then raise exception 'METADATA_TOO_LARGE'; end if;

  select * into v_channel
  from public.pilot_channels
  where channel_type='whatsapp' and external_account_id=p_phone_number_id
  limit 1;
  if v_channel.id is null then raise exception 'UNKNOWN_CONNECTION'; end if;
  if v_channel.status<>'connected' then raise exception 'CHANNEL_NOT_CONNECTED'; end if;

  select business_type into v_business_type from public.pilot_businesses where id=v_channel.business_id;
  if v_business_type='clinic' then
    select production_patient_data_allowed into v_patient_allowed
    from public.pilot_patient_data_gate where business_id=v_channel.business_id;
    if coalesce(v_patient_allowed,false)=false then raise exception 'PATIENT_DATA_GATE_CLOSED'; end if;
  end if;

  insert into public.pilot_event_inbox(
    business_id,event_type,external_event_id_hash,source_system,processing_state,policy_state,
    outbound_allowed,occurred_at,safe_metadata
  ) values (
    v_channel.business_id,'CHANNEL_MESSAGE_RECEIVED',p_external_event_hash,'whatsapp','RECEIVED','NOT_CHECKED',
    false,coalesce(p_occurred_at,now()),coalesce(p_safe_metadata,'{}'::jsonb)
  ) on conflict (business_id,source_system,external_event_id_hash) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('duplicate',true,'persisted',false,'business_id',v_channel.business_id);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer_identity_hash,0));
  select customer_id into v_customer_id
  from public.pilot_customer_identities
  where business_id=v_channel.business_id
    and identity_type='channel_account'
    and channel_type='whatsapp'
    and identity_hash=p_customer_identity_hash
    and verification_state='verified'
  order by created_at asc limit 1;

  if v_customer_id is null then
    insert into public.pilot_customers(business_id,display_name,channel_handle,lead_status,metadata)
    values(v_channel.business_id,'WhatsApp customer',left(p_customer_handle,128),'new',jsonb_build_object('source','whatsapp'))
    returning id into v_customer_id;

    insert into public.pilot_customer_identities(
      business_id,customer_id,identity_type,channel_type,identity_hash,verification_state,
      verification_method,verified_at,source,metadata
    ) values (
      v_channel.business_id,v_customer_id,'channel_account','whatsapp',p_customer_identity_hash,'verified',
      'system_verified',now(),'system_verified',jsonb_build_object('provider','whatsapp')
    );
  end if;

  select id into v_conversation_id
  from public.pilot_conversations
  where business_id=v_channel.business_id
    and customer_id=v_customer_id
    and channel_type='whatsapp'
    and state<>'closed'
  order by updated_at desc limit 1;

  if v_conversation_id is null then
    insert into public.pilot_conversations(business_id,customer_id,channel_type,state,demo_mode)
    values(v_channel.business_id,v_customer_id,'whatsapp','ai_active',false)
    returning id into v_conversation_id;
  end if;

  insert into public.pilot_messages(
    business_id,conversation_id,sender_type,body,intent,simulated,
    external_source,external_message_id_hash,delivery_state,external_status_updated_at
  ) values (
    v_channel.business_id,v_conversation_id,'customer',p_body,nullif(p_intent,''),false,
    'whatsapp',p_external_message_hash,'RECEIVED',now()
  ) returning id into v_message_id;

  update public.pilot_event_inbox
  set customer_id=v_customer_id,
      processing_state='READY',
      safe_metadata=coalesce(safe_metadata,'{}'::jsonb) || jsonb_build_object('message_persisted',true,'message_type',left(coalesce(p_message_type,'unknown'),64)),
      updated_at=now()
  where id=v_event_id;

  return jsonb_build_object(
    'duplicate',false,'persisted',true,'business_id',v_channel.business_id,
    'customer_id',v_customer_id,'conversation_id',v_conversation_id,'message_id',v_message_id
  );
end;
$$;
revoke all on function public.pilot_ingest_whatsapp_message(text,text,text,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.pilot_ingest_whatsapp_message(text,text,text,text,text,text,text,text,timestamptz,jsonb) to service_role;

-- Delivery/status application. Each distinct status callback has its own event hash, so SENT→DELIVERED→READ
-- are not incorrectly deduplicated as one event. Delivery state never regresses.
create or replace function public.pilot_apply_whatsapp_status(
  p_phone_number_id text,
  p_external_event_hash text,
  p_external_message_hash text,
  p_status text,
  p_occurred_at timestamptz,
  p_safe_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_channel public.pilot_channels%rowtype;
  v_event_id uuid;
  v_message_id uuid;
  v_incoming text := upper(coalesce(p_status,''));
  v_current text;
begin
  if p_external_event_hash !~ '^[0-9a-f]{64}$' or p_external_message_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_EXTERNAL_HASH'; end if;
  if v_incoming not in ('SENT','DELIVERED','READ','FAILED') then raise exception 'UNSUPPORTED_DELIVERY_STATE'; end if;

  select * into v_channel from public.pilot_channels
  where channel_type='whatsapp' and external_account_id=p_phone_number_id limit 1;
  if v_channel.id is null then raise exception 'UNKNOWN_CONNECTION'; end if;

  insert into public.pilot_event_inbox(
    business_id,event_type,external_event_id_hash,source_system,processing_state,policy_state,
    outbound_allowed,occurred_at,safe_metadata
  ) values (
    v_channel.business_id,'CHANNEL_MESSAGE_STATUS',p_external_event_hash,'whatsapp','RECEIVED','NOT_CHECKED',
    false,coalesce(p_occurred_at,now()),coalesce(p_safe_metadata,'{}'::jsonb)
  ) on conflict (business_id,source_system,external_event_id_hash) do nothing
  returning id into v_event_id;

  if v_event_id is null then return jsonb_build_object('duplicate',true,'updated',false,'business_id',v_channel.business_id); end if;

  select id,delivery_state into v_message_id,v_current
  from public.pilot_messages
  where business_id=v_channel.business_id and external_source='whatsapp' and external_message_id_hash=p_external_message_hash
  order by created_at desc limit 1 for update;

  if v_message_id is null then
    update public.pilot_event_inbox set processing_state='WAITING_IDENTITY',updated_at=now() where id=v_event_id;
    return jsonb_build_object('duplicate',false,'updated',false,'waiting_for_message',true,'business_id',v_channel.business_id);
  end if;

  update public.pilot_messages
  set delivery_state = case
    when v_current='READ' then 'READ'
    when v_current='DELIVERED' and v_incoming in ('SENT','FAILED') then 'DELIVERED'
    when v_current='SENT' and v_incoming='FAILED' then 'FAILED'
    when v_incoming='READ' then 'READ'
    when v_incoming='DELIVERED' then 'DELIVERED'
    when v_incoming='SENT' and v_current in ('UNKNOWN','ACCEPTED','SENT') then 'SENT'
    when v_incoming='FAILED' and v_current in ('UNKNOWN','ACCEPTED','SENT') then 'FAILED'
    else v_current end,
      external_status_updated_at=now()
  where id=v_message_id;

  update public.pilot_event_inbox set processing_state='SUCCEEDED',updated_at=now() where id=v_event_id;
  return jsonb_build_object('duplicate',false,'updated',true,'business_id',v_channel.business_id,'message_id',v_message_id,'provider_status',v_incoming);
end;
$$;
revoke all on function public.pilot_apply_whatsapp_status(text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.pilot_apply_whatsapp_status(text,text,text,text,timestamptz,jsonb) to service_role;

comment on index public.pilot_channels_provider_account_unique is
  'A provider account such as a WhatsApp phone_number_id must never route to more than one PILOT business.';
comment on column public.pilot_messages.external_message_id_hash is
  'One-way SHA-256 hash of the external provider message ID; raw provider IDs are not required for status correlation.';
comment on column public.pilot_messages.delivery_state is
  'Provider delivery truth. ACCEPTED/SENT are not DELIVERED; only provider status callbacks may advance delivery state.';
comment on function public.pilot_ingest_whatsapp_message(text,text,text,text,text,text,text,text,timestamptz,jsonb) is
  'Service-role-only atomic WhatsApp inbound persistence. Requires connected channel and blocks clinic patient data until the hard gate is approved.';
comment on function public.pilot_apply_whatsapp_status(text,text,text,text,timestamptz,jsonb) is
  'Service-role-only delivery callback application with dedup and non-regressing delivery state.';
