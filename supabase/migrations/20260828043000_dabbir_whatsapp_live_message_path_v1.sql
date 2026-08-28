-- BAR-13: real WhatsApp inbound persistence + approved outbound verification.
-- No raw webhook payloads or access tokens are stored in the event ledger.

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
create index if not exists dabbir_whatsapp_event_conversation_idx
  on public.dabbir_whatsapp_event_ledger(business_id, conversation_id, occurred_at desc)
  where conversation_id is not null;

alter table public.dabbir_whatsapp_event_ledger enable row level security;
alter table public.dabbir_whatsapp_event_ledger force row level security;
revoke all on public.dabbir_whatsapp_event_ledger from public, anon, authenticated;
grant select, insert, update on public.dabbir_whatsapp_event_ledger to service_role;

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
set search_path to 'public','pg_temp'
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

create or replace function public.dabbir_whatsapp_record_outbound(
  p_business_id uuid,
  p_conversation_id uuid,
  p_provider_message_id text,
  p_body text,
  p_sender_user_id uuid,
  p_occurred_at timestamptz default now()
)
returns table(message_id uuid, event_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_message_id uuid;
  v_event_id uuid;
  v_existing public.dabbir_whatsapp_event_ledger%rowtype;
  v_event_key text;
begin
  if p_business_id is null or p_conversation_id is null or p_sender_user_id is null then raise exception 'WHATSAPP_OUTBOUND_CONTEXT_REQUIRED'; end if;
  if nullif(trim(p_provider_message_id),'') is null or length(p_provider_message_id)>320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  if nullif(trim(p_body),'') is null or length(p_body)>4000 then raise exception 'WHATSAPP_MESSAGE_BODY_REQUIRED'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
  where c.business_id=p_business_id and c.status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  if not exists(
    select 1 from public.dabbir_memberships m
    where m.business_id=p_business_id and m.user_id=p_sender_user_id and m.status='active' and m.role in ('owner','admin')
  ) then raise exception 'WHATSAPP_REPLY_APPROVER_REQUIRED'; end if;

  select * into v_conversation from public.dabbir_conversations c
  where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false
  limit 1;
  if not found then raise exception 'WHATSAPP_CONVERSATION_NOT_FOUND'; end if;

  v_event_key := 'outbound:' || trim(p_provider_message_id);
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':' || v_event_key, 0));
  select * into v_existing from public.dabbir_whatsapp_event_ledger e
  where e.business_id=p_business_id and e.event_key=v_event_key limit 1;
  if found then return query select v_existing.message_id,v_existing.id,true; return; end if;

  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated,sender_user_id)
  values(p_business_id,p_conversation_id,'human',left(trim(p_body),4000),null,false,p_sender_user_id)
  returning id into v_message_id;

  update public.dabbir_conversations
  set state='waiting_customer',updated_at=now()
  where business_id=p_business_id and id=p_conversation_id;

  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,
    conversation_id,message_id,provider_status,provider_verified,occurred_at,evidence
  ) values (
    p_business_id,v_connection.id,v_event_key,'outbound','message',trim(p_provider_message_id),
    p_conversation_id,v_message_id,'accepted',false,coalesce(p_occurred_at,now()),
    jsonb_build_object('source','meta_messages_api','provider_accepted',true)
  ) returning id into v_event_id;

  return query select v_message_id,v_event_id,false;
end;
$$;

revoke all on function public.dabbir_whatsapp_record_outbound(uuid,uuid,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_record_outbound(uuid,uuid,text,text,uuid,timestamptz) to service_role;

create or replace function public.dabbir_whatsapp_apply_status(
  p_phone_number_id text,
  p_provider_message_id text,
  p_status text,
  p_occurred_at timestamptz default now()
)
returns table(matched boolean, provider_verified boolean, conversation_id uuid, message_id uuid)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_outbound public.dabbir_whatsapp_event_ledger%rowtype;
  v_status text;
  v_verified boolean;
  v_status_key text;
begin
  if nullif(trim(p_phone_number_id),'') is null or nullif(trim(p_provider_message_id),'') is null then
    raise exception 'WHATSAPP_STATUS_CONTEXT_REQUIRED';
  end if;
  v_status := lower(left(trim(coalesce(p_status,'')),40));
  if v_status not in ('sent','delivered','read','failed','deleted') then raise exception 'WHATSAPP_STATUS_INVALID'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
  where c.phone_number_id=trim(p_phone_number_id) and c.status='connected' limit 1;
  if not found then return query select false,false,null::uuid,null::uuid; return; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_connection.business_id::text || ':outbound:' || trim(p_provider_message_id),0));
  select * into v_outbound from public.dabbir_whatsapp_event_ledger e
  where e.business_id=v_connection.business_id
    and e.direction='outbound'
    and e.event_type='message'
    and e.provider_message_id=trim(p_provider_message_id)
  order by e.created_at desc limit 1;
  if not found then return query select false,false,null::uuid,null::uuid; return; end if;

  v_verified := v_status in ('sent','delivered','read');
  update public.dabbir_whatsapp_event_ledger
  set provider_status=v_status,
      provider_verified=v_verified,
      verified_at=case when v_verified then coalesce(verified_at,now()) else verified_at end,
      updated_at=now(),
      evidence=coalesce(evidence,'{}'::jsonb) || jsonb_build_object('status_source','meta_signed_webhook')
  where id=v_outbound.id;

  v_status_key := 'status:' || trim(p_provider_message_id) || ':' || v_status || ':' || extract(epoch from coalesce(p_occurred_at,now()))::bigint::text;
  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,
    conversation_id,message_id,provider_status,provider_verified,occurred_at,verified_at,evidence
  ) values (
    v_connection.business_id,v_connection.id,v_status_key,'status','status',trim(p_provider_message_id),
    v_outbound.conversation_id,v_outbound.message_id,v_status,v_verified,coalesce(p_occurred_at,now()),
    case when v_verified then now() else null end,jsonb_build_object('source','meta_signed_webhook')
  ) on conflict (business_id,event_key) do nothing;

  update public.dabbir_whatsapp_connections
  set last_verified_at=case when v_verified then now() else last_verified_at end,
      last_provider_status=200,
      last_error=case when v_status='failed' then 'META_OUTBOUND_FAILED' else null end,
      updated_at=now()
  where id=v_connection.id;

  return query select true,v_verified,v_outbound.conversation_id,v_outbound.message_id;
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
set search_path to 'public','pg_temp'
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'view_integrations') then raise exception 'INTEGRATION_VIEW_REQUIRED'; end if;

  return query
  select true,
    exists(select 1 from public.dabbir_conversations c where c.business_id=p_business_id and c.channel_type='whatsapp' and c.demo_mode=false),
    exists(select 1 from public.dabbir_whatsapp_event_ledger e where e.business_id=p_business_id and e.direction='inbound' and e.event_type='message' and e.message_id is not null),
    exists(select 1 from public.dabbir_whatsapp_event_ledger e where e.business_id=p_business_id and e.direction='outbound' and e.event_type='message' and e.message_id is not null and e.provider_status is not null),
    exists(select 1 from public.dabbir_whatsapp_event_ledger e where e.business_id=p_business_id and e.direction='outbound' and e.event_type='message' and e.provider_verified=true);
end;
$$;

revoke all on function public.dabbir_whatsapp_operational_evidence(uuid) from public,anon;
grant execute on function public.dabbir_whatsapp_operational_evidence(uuid) to authenticated;
