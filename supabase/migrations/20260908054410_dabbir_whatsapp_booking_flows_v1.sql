-- DABBIR WhatsApp Booking Flows v1
-- Scope: booking convenience only. No payment, invoice, card, bank, payroll or accounting data.
-- Flow replies are accepted only from a signed Meta webhook by the server and are
-- correlated with a one-use hashed token tied to an existing tenant/branch/conversation.

create table if not exists public.dabbir_whatsapp_flows (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  branch_id uuid not null,
  connection_id uuid not null references public.dabbir_whatsapp_connections(id) on delete cascade,
  flow_kind text not null default 'booking' check (flow_kind in ('booking')),
  schema_hash text not null check (schema_hash ~ '^[0-9a-f]{64}$'),
  flow_name text not null check (char_length(flow_name) between 3 and 120),
  meta_flow_id text check (meta_flow_id is null or meta_flow_id ~ '^[0-9]{5,40}$'),
  status text not null default 'pending' check (status in ('pending','draft','validated','published','validation_failed','error','retired')),
  validation_errors jsonb not null default '[]'::jsonb,
  provider_status integer,
  provision_attempts integer not null default 0 check (provision_attempts between 0 and 20),
  next_retry_at timestamptz,
  last_error text,
  published_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_whatsapp_flows_branch_business_fk foreign key (branch_id,business_id)
    references public.dabbir_business_branches(id,business_id) on delete restrict,
  constraint dabbir_whatsapp_flows_connection_schema_uq unique (connection_id,flow_kind,schema_hash)
);

create index if not exists dabbir_whatsapp_flows_business_status_idx
  on public.dabbir_whatsapp_flows(business_id,branch_id,status,updated_at desc);
create unique index if not exists dabbir_whatsapp_flows_meta_id_uq
  on public.dabbir_whatsapp_flows(meta_flow_id) where meta_flow_id is not null;

create table if not exists public.dabbir_whatsapp_flow_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  branch_id uuid not null,
  connection_id uuid not null references public.dabbir_whatsapp_connections(id) on delete cascade,
  conversation_id uuid not null,
  flow_id uuid not null references public.dabbir_whatsapp_flows(id) on delete restrict,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'created' check (state in ('created','sent','completed','failed','ambiguous','expired')),
  provider_message_id text,
  completion_provider_message_id text,
  service_id uuid references public.dabbir_services(id) on delete restrict,
  location_text text,
  preferred_date text,
  preferred_time text,
  expires_at timestamptz not null,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_whatsapp_flow_sessions_branch_business_fk foreign key (branch_id,business_id)
    references public.dabbir_business_branches(id,business_id) on delete restrict,
  constraint dabbir_whatsapp_flow_sessions_business_conversation_fk foreign key (business_id,conversation_id)
    references public.dabbir_conversations(business_id,id) on delete cascade,
  constraint dabbir_whatsapp_flow_sessions_token_uq unique (token_hash),
  constraint dabbir_whatsapp_flow_sessions_provider_message_len check (provider_message_id is null or char_length(provider_message_id) between 3 and 320),
  constraint dabbir_whatsapp_flow_sessions_completion_message_len check (completion_provider_message_id is null or char_length(completion_provider_message_id) between 3 and 320),
  constraint dabbir_whatsapp_flow_sessions_location_len check (location_text is null or char_length(location_text) <= 500),
  constraint dabbir_whatsapp_flow_sessions_date_len check (preferred_date is null or char_length(preferred_date) <= 80),
  constraint dabbir_whatsapp_flow_sessions_time_len check (preferred_time is null or char_length(preferred_time) <= 80)
);

create index if not exists dabbir_whatsapp_flow_sessions_conversation_idx
  on public.dabbir_whatsapp_flow_sessions(business_id,conversation_id,created_at desc);
create index if not exists dabbir_whatsapp_flow_sessions_expiry_idx
  on public.dabbir_whatsapp_flow_sessions(state,expires_at)
  where state in ('created','sent');
create unique index if not exists dabbir_whatsapp_flow_sessions_completion_provider_uq
  on public.dabbir_whatsapp_flow_sessions(business_id,completion_provider_message_id)
  where completion_provider_message_id is not null;

alter table public.dabbir_whatsapp_flows enable row level security;
alter table public.dabbir_whatsapp_flows force row level security;
alter table public.dabbir_whatsapp_flow_sessions enable row level security;
alter table public.dabbir_whatsapp_flow_sessions force row level security;
revoke all on public.dabbir_whatsapp_flows from public,anon,authenticated;
revoke all on public.dabbir_whatsapp_flow_sessions from public,anon,authenticated;
grant select,insert,update on public.dabbir_whatsapp_flows to service_role;
grant select,insert,update on public.dabbir_whatsapp_flow_sessions to service_role;

create or replace function public.dabbir_whatsapp_upsert_flow_provision(
  p_connection_id uuid,
  p_schema_hash text,
  p_flow_name text,
  p_meta_flow_id text,
  p_status text,
  p_validation_errors jsonb default '[]'::jsonb,
  p_provider_status integer default null,
  p_error text default null,
  p_next_retry_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  c public.dabbir_whatsapp_connections%rowtype;
  r public.dabbir_whatsapp_flows%rowtype;
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_meta text:=nullif(trim(coalesce(p_meta_flow_id,'')),'');
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_connection_id is null or p_schema_hash !~ '^[0-9a-f]{64}$' then raise exception 'WHATSAPP_FLOW_PROVISION_CONTEXT_INVALID'; end if;
  if v_status not in ('pending','draft','validated','published','validation_failed','error','retired') then raise exception 'WHATSAPP_FLOW_STATUS_INVALID'; end if;
  if v_meta is not null and v_meta !~ '^[0-9]{5,40}$' then raise exception 'WHATSAPP_FLOW_META_ID_INVALID'; end if;
  select * into c from public.dabbir_whatsapp_connections where id=p_connection_id limit 1;
  if not found or c.branch_id is null then raise exception 'WHATSAPP_FLOW_CONNECTION_INVALID'; end if;

  insert into public.dabbir_whatsapp_flows(
    business_id,branch_id,connection_id,flow_kind,schema_hash,flow_name,meta_flow_id,status,
    validation_errors,provider_status,provision_attempts,next_retry_at,last_error,published_at,last_verified_at,updated_at
  ) values(
    c.business_id,c.branch_id,c.id,'booking',lower(p_schema_hash),left(trim(p_flow_name),120),v_meta,v_status,
    case when jsonb_typeof(coalesce(p_validation_errors,'[]'::jsonb))='array' then coalesce(p_validation_errors,'[]'::jsonb) else '[]'::jsonb end,
    p_provider_status,1,p_next_retry_at,left(p_error,300),case when v_status='published' then now() else null end,
    case when v_status='published' then now() else null end,now()
  )
  on conflict (connection_id,flow_kind,schema_hash) do update set
    flow_name=excluded.flow_name,
    meta_flow_id=coalesce(excluded.meta_flow_id,public.dabbir_whatsapp_flows.meta_flow_id),
    status=excluded.status,
    validation_errors=excluded.validation_errors,
    provider_status=excluded.provider_status,
    provision_attempts=least(20,public.dabbir_whatsapp_flows.provision_attempts+1),
    next_retry_at=excluded.next_retry_at,
    last_error=excluded.last_error,
    published_at=case when excluded.status='published' then coalesce(public.dabbir_whatsapp_flows.published_at,now()) else public.dabbir_whatsapp_flows.published_at end,
    last_verified_at=case when excluded.status='published' then now() else public.dabbir_whatsapp_flows.last_verified_at end,
    updated_at=now()
  returning * into r;
  return jsonb_build_object('id',r.id,'business_id',r.business_id,'branch_id',r.branch_id,'connection_id',r.connection_id,
    'meta_flow_id',r.meta_flow_id,'flow_name',r.flow_name,'status',r.status,'schema_hash',r.schema_hash,'attempts',r.provision_attempts);
end;
$function$;

create or replace function public.dabbir_whatsapp_get_published_booking_flow(
  p_business_id uuid,p_connection_id uuid,p_schema_hash text
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare r public.dabbir_whatsapp_flows%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select f.* into r
  from public.dabbir_whatsapp_flows f
  join public.dabbir_whatsapp_connections c on c.id=f.connection_id and c.business_id=f.business_id
  where f.business_id=p_business_id and f.connection_id=p_connection_id and f.flow_kind='booking'
    and f.schema_hash=lower(trim(p_schema_hash)) and f.status='published' and c.status='connected'
  order by f.published_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id',r.id,'meta_flow_id',r.meta_flow_id,'flow_name',r.flow_name,'schema_hash',r.schema_hash,'branch_id',r.branch_id);
end;
$function$;

create or replace function public.dabbir_whatsapp_create_booking_flow_session(
  p_business_id uuid,p_conversation_id uuid,p_connection_id uuid,p_flow_id uuid,p_token_hash text,p_ttl_seconds integer default 1800
)
returns table(session_id uuid,recipient_handle text,meta_flow_id text,flow_name text)
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private','auth'
as $function$
declare
  c public.dabbir_conversations%rowtype;
  w public.dabbir_whatsapp_connections%rowtype;
  f public.dabbir_whatsapp_flows%rowtype;
  v_customer public.dabbir_customers%rowtype;
  v_session uuid;
  v_ttl integer:=greatest(300,least(7200,coalesce(p_ttl_seconds,1800)));
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'WHATSAPP_FLOW_TOKEN_HASH_INVALID'; end if;
  select * into c from public.dabbir_conversations where id=p_conversation_id and business_id=p_business_id and channel_type='whatsapp' and demo_mode=false and state<>'closed' for update;
  if not found or c.customer_id is null or c.branch_id is null then raise exception 'WHATSAPP_FLOW_CONVERSATION_INVALID'; end if;
  if c.state in ('human_active','action_required') or exists(select 1 from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then
    raise exception 'WHATSAPP_FLOW_BLOCKED_BY_HUMAN_TAKEOVER';
  end if;
  select * into w from public.dabbir_whatsapp_connections where id=p_connection_id and business_id=p_business_id and branch_id=c.branch_id and status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_FLOW_CONNECTION_INVALID'; end if;
  select * into f from public.dabbir_whatsapp_flows where id=p_flow_id and business_id=p_business_id and branch_id=c.branch_id and connection_id=w.id and flow_kind='booking' and status='published' limit 1;
  if not found or f.meta_flow_id is null then raise exception 'WHATSAPP_FLOW_NOT_PUBLISHED'; end if;
  select * into v_customer from public.dabbir_customers where id=c.customer_id and business_id=p_business_id limit 1;
  if not found or nullif(regexp_replace(coalesce(v_customer.channel_handle,''),'[^0-9]','','g'),'') is null then raise exception 'WHATSAPP_FLOW_CUSTOMER_HANDLE_REQUIRED'; end if;

  update public.dabbir_whatsapp_flow_sessions set state='expired',updated_at=now()
   where business_id=p_business_id and conversation_id=p_conversation_id and state in ('created','sent') and expires_at<=now();

  insert into public.dabbir_whatsapp_flow_sessions(business_id,branch_id,connection_id,conversation_id,flow_id,token_hash,state,expires_at)
  values(p_business_id,c.branch_id,w.id,c.id,f.id,lower(p_token_hash),'created',now()+make_interval(secs=>v_ttl))
  returning id into v_session;
  return query select v_session,regexp_replace(v_customer.channel_handle,'[^0-9]','','g'),f.meta_flow_id,f.flow_name;
end;
$function$;

create or replace function public.dabbir_whatsapp_mark_booking_flow_delivery(
  p_session_id uuid,p_state text,p_provider_message_id text default null,p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare r public.dabbir_whatsapp_flow_sessions%rowtype; v_state text:=lower(trim(coalesce(p_state,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_state not in ('sent','failed','ambiguous') then raise exception 'WHATSAPP_FLOW_DELIVERY_STATE_INVALID'; end if;
  update public.dabbir_whatsapp_flow_sessions set
    state=case when state='completed' then state else v_state end,
    provider_message_id=coalesce(nullif(trim(p_provider_message_id),''),provider_message_id),
    last_error=case when v_state in ('failed','ambiguous') then left(p_error,300) else null end,
    updated_at=now()
  where id=p_session_id returning * into r;
  if not found then raise exception 'WHATSAPP_FLOW_SESSION_NOT_FOUND'; end if;
  return jsonb_build_object('id',r.id,'state',r.state,'provider_message_id',r.provider_message_id);
end;
$function$;

create or replace function public.dabbir_whatsapp_consume_booking_flow_reply(
  p_phone_number_id text,
  p_provider_message_id text,
  p_sender_handle text,
  p_token_hash text,
  p_service_id uuid,
  p_location text,
  p_preferred_date text,
  p_preferred_time text,
  p_occurred_at timestamptz default now()
)
returns table(message_id uuid,conversation_id uuid,duplicate boolean)
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private','auth'
as $function$
declare
  s public.dabbir_whatsapp_flow_sessions%rowtype;
  w public.dabbir_whatsapp_connections%rowtype;
  c public.dabbir_conversations%rowtype;
  customer public.dabbir_customers%rowtype;
  service public.dabbir_services%rowtype;
  existing public.dabbir_whatsapp_event_ledger%rowtype;
  persisted record;
  v_sender text:=regexp_replace(coalesce(p_sender_handle,''),'[^0-9]','','g');
  v_provider text:=trim(coalesce(p_provider_message_id,''));
  v_location text:=left(trim(regexp_replace(coalesce(p_location,''),'[\u0000-\u001f\u007f]','','g')),500);
  v_date text:=left(trim(regexp_replace(coalesce(p_preferred_date,''),'[\u0000-\u001f\u007f]','','g')),80);
  v_time text:=left(trim(regexp_replace(coalesce(p_preferred_time,''),'[\u0000-\u001f\u007f]','','g')),80);
  v_body text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'WHATSAPP_FLOW_TOKEN_HASH_INVALID'; end if;
  if length(v_provider) not between 3 and 320 then raise exception 'WHATSAPP_FLOW_PROVIDER_MESSAGE_REQUIRED'; end if;
  if length(v_sender) not between 7 and 20 then raise exception 'WHATSAPP_FLOW_SENDER_INVALID'; end if;
  if p_service_id is null or v_location='' or v_date='' or v_time='' then raise exception 'WHATSAPP_FLOW_REQUIRED_FIELD_MISSING'; end if;

  select * into s from public.dabbir_whatsapp_flow_sessions where token_hash=lower(p_token_hash) limit 1 for update;
  if not found then raise exception 'WHATSAPP_FLOW_SESSION_NOT_FOUND'; end if;
  if s.state='completed' then
    if s.completion_provider_message_id is distinct from v_provider then raise exception 'WHATSAPP_FLOW_TOKEN_ALREADY_USED'; end if;
    select * into existing from public.dabbir_whatsapp_event_ledger e where e.business_id=s.business_id and e.provider_message_id=v_provider and e.message_id is not null order by e.created_at asc limit 1;
    if not found then raise exception 'WHATSAPP_FLOW_COMPLETION_EVIDENCE_MISSING'; end if;
    return query select existing.message_id,existing.conversation_id,true;
    return;
  end if;
  if s.state not in ('created','sent') then raise exception 'WHATSAPP_FLOW_SESSION_NOT_ACTIVE'; end if;
  if s.expires_at<=now() then update public.dabbir_whatsapp_flow_sessions set state='expired',updated_at=now() where id=s.id; raise exception 'WHATSAPP_FLOW_SESSION_EXPIRED'; end if;

  select * into w from public.dabbir_whatsapp_connections where id=s.connection_id and business_id=s.business_id and phone_number_id=trim(p_phone_number_id) and status='connected' limit 1;
  if not found or w.branch_id is distinct from s.branch_id then raise exception 'WHATSAPP_FLOW_CONNECTION_SCOPE_INVALID'; end if;
  select * into c from public.dabbir_conversations where id=s.conversation_id and business_id=s.business_id and branch_id=s.branch_id and channel_type='whatsapp' and demo_mode=false and state<>'closed' limit 1;
  if not found or c.customer_id is null then raise exception 'WHATSAPP_FLOW_CONVERSATION_SCOPE_INVALID'; end if;
  select * into customer from public.dabbir_customers where id=c.customer_id and business_id=s.business_id limit 1;
  if not found or regexp_replace(coalesce(customer.channel_handle,''),'[^0-9]','','g')<>v_sender then raise exception 'WHATSAPP_FLOW_SENDER_SCOPE_INVALID'; end if;
  select sv.* into service from public.dabbir_services sv
   join public.dabbir_branch_services bs on bs.business_id=sv.business_id and bs.service_id=sv.id and bs.branch_id=s.branch_id and bs.active=true
   where sv.id=p_service_id and sv.business_id=s.business_id and sv.active=true limit 1;
  if not found then raise exception 'WHATSAPP_FLOW_SERVICE_SCOPE_INVALID'; end if;

  v_body := 'طلب حجز عبر نموذج WhatsApp' || E'\nالخدمة: ' || left(coalesce(nullif(service.name_ar,''),nullif(service.name,''),service.name_en),180)
    || E'\nالموقع: ' || v_location || E'\nالتاريخ المطلوب: ' || v_date || E'\nالوقت المطلوب: ' || v_time
    || E'\n[DABBIR_BOOKING_FLOW service_id=' || service.id::text || ']';

  select * into persisted from public.dabbir_whatsapp_persist_inbound(
    trim(p_phone_number_id),v_provider,v_sender,customer.display_name,left(v_body,4000),'APPOINTMENT_REQUEST',coalesce(p_occurred_at,now())
  ) limit 1;
  if persisted.message_id is null or persisted.conversation_id<>s.conversation_id then raise exception 'WHATSAPP_FLOW_PERSISTENCE_UNVERIFIED'; end if;

  update public.dabbir_whatsapp_flow_sessions set
    state='completed',completion_provider_message_id=v_provider,service_id=service.id,location_text=v_location,
    preferred_date=v_date,preferred_time=v_time,completed_at=now(),last_error=null,updated_at=now()
   where id=s.id;
  return query select persisted.message_id,persisted.conversation_id,coalesce(persisted.duplicate,false);
end;
$function$;

revoke all on function public.dabbir_whatsapp_upsert_flow_provision(uuid,text,text,text,text,jsonb,integer,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_get_published_booking_flow(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_create_booking_flow_session(uuid,uuid,uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_mark_booking_flow_delivery(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_consume_booking_flow_reply(text,text,text,text,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_upsert_flow_provision(uuid,text,text,text,text,jsonb,integer,text,timestamptz) to service_role;
grant execute on function public.dabbir_whatsapp_get_published_booking_flow(uuid,uuid,text) to service_role;
grant execute on function public.dabbir_whatsapp_create_booking_flow_session(uuid,uuid,uuid,uuid,text,integer) to service_role;
grant execute on function public.dabbir_whatsapp_mark_booking_flow_delivery(uuid,text,text,text) to service_role;
grant execute on function public.dabbir_whatsapp_consume_booking_flow_reply(text,text,text,text,uuid,text,text,text,timestamptz) to service_role;