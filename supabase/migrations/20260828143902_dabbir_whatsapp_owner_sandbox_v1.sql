create table if not exists public.dabbir_whatsapp_sandbox_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  platform_phone_number_id text not null check (length(platform_phone_number_id) between 1 and 160),
  bound_sender_handle text null check (bound_sender_handle is null or length(bound_sender_handle) between 1 and 160),
  conversation_id uuid null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','BOUND','REVOKED','EXPIRED')),
  expires_at timestamptz not null,
  last_message_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_whatsapp_sandbox_session_conversation_fk
    foreign key (business_id, conversation_id)
    references public.dabbir_conversations(business_id, id)
    on delete set null
);

create table if not exists public.dabbir_whatsapp_sandbox_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.dabbir_whatsapp_sandbox_sessions(id) on delete cascade,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  conversation_id uuid not null,
  provider_message_id text not null unique check (length(provider_message_id) between 1 and 320),
  sender_handle text not null check (length(sender_handle) between 1 and 160),
  customer_message_id uuid not null,
  ai_message_id uuid null,
  reply_state text not null default 'PENDING' check (reply_state in ('PENDING','SENDING','PROVIDER_ACCEPTED','FAILED','AMBIGUOUS')),
  reply_body text null check (reply_body is null or length(reply_body) <= 4000),
  reply_body_hash text null check (reply_body_hash is null or reply_body_hash ~ '^[0-9a-f]{64}$'),
  provider_reply_message_id text null unique,
  provider_status text null,
  error_code text null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_whatsapp_sandbox_event_conversation_fk
    foreign key (business_id, conversation_id)
    references public.dabbir_conversations(business_id, id)
    on delete cascade,
  constraint dabbir_whatsapp_sandbox_event_customer_message_fk
    foreign key (business_id, customer_message_id)
    references public.dabbir_messages(business_id, id)
    on delete cascade,
  constraint dabbir_whatsapp_sandbox_event_ai_message_fk
    foreign key (business_id, ai_message_id)
    references public.dabbir_messages(business_id, id)
    on delete set null
);

create index if not exists dabbir_whatsapp_sandbox_sessions_business_idx
  on public.dabbir_whatsapp_sandbox_sessions(business_id, status, expires_at desc);
create index if not exists dabbir_whatsapp_sandbox_sessions_sender_idx
  on public.dabbir_whatsapp_sandbox_sessions(platform_phone_number_id, bound_sender_handle, status, expires_at desc);
create index if not exists dabbir_whatsapp_sandbox_events_session_idx
  on public.dabbir_whatsapp_sandbox_events(session_id, created_at desc);
create index if not exists dabbir_whatsapp_sandbox_events_business_idx
  on public.dabbir_whatsapp_sandbox_events(business_id, created_at desc);

alter table public.dabbir_whatsapp_sandbox_sessions enable row level security;
alter table public.dabbir_whatsapp_sandbox_sessions force row level security;
alter table public.dabbir_whatsapp_sandbox_events enable row level security;
alter table public.dabbir_whatsapp_sandbox_events force row level security;

revoke all on public.dabbir_whatsapp_sandbox_sessions from public, anon, authenticated;
revoke all on public.dabbir_whatsapp_sandbox_events from public, anon, authenticated;
grant select, insert, update, delete on public.dabbir_whatsapp_sandbox_sessions to service_role;
grant select, insert, update, delete on public.dabbir_whatsapp_sandbox_events to service_role;

create or replace function public.dabbir_whatsapp_sandbox_create_session(
  p_business_id uuid,
  p_token_hash text,
  p_platform_phone_number_id text,
  p_ttl_minutes integer default 20
)
returns table(session_id uuid, expires_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_expires timestamptz;
begin
  if p_business_id is null or coalesce(p_token_hash,'') !~ '^[0-9a-f]{64}$' or nullif(trim(p_platform_phone_number_id),'') is null then
    raise exception 'WHATSAPP_SANDBOX_SESSION_INPUT_INVALID';
  end if;
  if p_ttl_minutes < 5 or p_ttl_minutes > 60 then
    raise exception 'WHATSAPP_SANDBOX_TTL_INVALID';
  end if;
  if not exists (select 1 from public.dabbir_businesses b where b.id = p_business_id) then
    raise exception 'WHATSAPP_SANDBOX_BUSINESS_NOT_FOUND';
  end if;
  if exists (
    select 1 from public.dabbir_whatsapp_connections c
    where c.phone_number_id = trim(p_platform_phone_number_id)
  ) then
    raise exception 'WHATSAPP_SANDBOX_PLATFORM_NUMBER_CONFLICT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dabbir-wa-sandbox-business:' || p_business_id::text, 0));
  update public.dabbir_whatsapp_sandbox_sessions
     set status = 'REVOKED', updated_at = now()
   where business_id = p_business_id
     and status in ('ACTIVE','BOUND');

  v_expires := now() + make_interval(mins => p_ttl_minutes);
  insert into public.dabbir_whatsapp_sandbox_sessions(
    business_id, token_hash, platform_phone_number_id, status, expires_at
  ) values (
    p_business_id, lower(p_token_hash), trim(p_platform_phone_number_id), 'ACTIVE', v_expires
  ) returning id into v_id;

  return query select v_id, v_expires;
end;
$$;

create or replace function public.dabbir_whatsapp_sandbox_route_inbound(
  p_phone_number_id text,
  p_provider_message_id text,
  p_sender_handle text,
  p_display_name text,
  p_token_hash text,
  p_body text,
  p_occurred_at timestamptz default now()
)
returns table(
  session_id uuid,
  event_id uuid,
  business_id uuid,
  conversation_id uuid,
  customer_message_id uuid,
  duplicate boolean,
  reply_state text,
  stored_reply_body text,
  business_name text,
  business_type text,
  locale text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  s public.dabbir_whatsapp_sandbox_sessions%rowtype;
  e public.dabbir_whatsapp_sandbox_events%rowtype;
  v_customer_id uuid;
  v_customer_message_id uuid;
  v_conversation_id uuid;
  v_name text;
  v_type text;
  v_locale text;
  v_body text;
begin
  if nullif(trim(p_phone_number_id),'') is null
     or nullif(trim(p_provider_message_id),'') is null
     or nullif(trim(p_sender_handle),'') is null then
    raise exception 'WHATSAPP_SANDBOX_INBOUND_EVENT_INCOMPLETE';
  end if;
  if exists (
    select 1 from public.dabbir_whatsapp_connections c
    where c.phone_number_id = trim(p_phone_number_id)
  ) then
    raise exception 'WHATSAPP_SANDBOX_PLATFORM_NUMBER_CONFLICT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dabbir-wa-sandbox-event:' || trim(p_provider_message_id), 0));

  select ev.* into e
    from public.dabbir_whatsapp_sandbox_events ev
   where ev.provider_message_id = trim(p_provider_message_id)
   limit 1;
  if found then
    select b.name, b.business_type, b.locale into v_name, v_type, v_locale
      from public.dabbir_businesses b where b.id = e.business_id;
    return query select e.session_id, e.id, e.business_id, e.conversation_id, e.customer_message_id,
      true, e.reply_state, e.reply_body, v_name, v_type, v_locale;
    return;
  end if;

  if nullif(trim(coalesce(p_token_hash,'')),'') is not null then
    select ss.* into s
      from public.dabbir_whatsapp_sandbox_sessions ss
     where ss.token_hash = lower(trim(p_token_hash))
       and ss.platform_phone_number_id = trim(p_phone_number_id)
       and ss.status in ('ACTIVE','BOUND')
       and ss.expires_at > now()
     for update
     limit 1;
    if not found then
      raise exception 'WHATSAPP_SANDBOX_SESSION_NOT_FOUND';
    end if;
    if s.bound_sender_handle is not null and s.bound_sender_handle <> trim(p_sender_handle) then
      raise exception 'WHATSAPP_SANDBOX_TOKEN_BOUND_TO_ANOTHER_SENDER';
    end if;
    if s.bound_sender_handle is null then
      update public.dabbir_whatsapp_sandbox_sessions
         set bound_sender_handle = trim(p_sender_handle), status = 'BOUND', updated_at = now()
       where id = s.id;
      s.bound_sender_handle := trim(p_sender_handle);
      s.status := 'BOUND';
    end if;
  else
    select ss.* into s
      from public.dabbir_whatsapp_sandbox_sessions ss
     where ss.platform_phone_number_id = trim(p_phone_number_id)
       and ss.bound_sender_handle = trim(p_sender_handle)
       and ss.status = 'BOUND'
       and ss.expires_at > now()
     order by ss.last_message_at desc nulls last, ss.created_at desc
     for update
     limit 1;
    if not found then
      raise exception 'WHATSAPP_SANDBOX_SESSION_NOT_FOUND';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dabbir-wa-sandbox-sender:' || s.business_id::text || ':' || trim(p_sender_handle), 0));

  select c.id into v_customer_id
    from public.dabbir_customers c
   where c.business_id = s.business_id
     and c.channel_handle = 'sandbox:' || trim(p_sender_handle)
   order by c.created_at desc
   limit 1;
  if v_customer_id is null then
    insert into public.dabbir_customers(business_id, display_name, channel_handle, lead_status, metadata)
    values (
      s.business_id,
      coalesce(nullif(trim(p_display_name),''), 'DABBIR WhatsApp Test'),
      'sandbox:' || trim(p_sender_handle),
      'new',
      jsonb_build_object('source','dabbir_whatsapp_owner_sandbox','sandbox',true)
    ) returning id into v_customer_id;
  end if;

  v_conversation_id := s.conversation_id;
  if v_conversation_id is null then
    insert into public.dabbir_conversations(business_id, customer_id, channel_type, state, demo_mode)
    values (s.business_id, v_customer_id, 'whatsapp', 'ai_active', true)
    returning id into v_conversation_id;
    update public.dabbir_whatsapp_sandbox_sessions
       set conversation_id = v_conversation_id, updated_at = now()
     where id = s.id;
  end if;

  v_body := left(coalesce(nullif(trim(p_body),''), 'مرحبا، أريد تجربة دبّر على واتساب.'), 4000);
  insert into public.dabbir_messages(business_id, conversation_id, sender_type, body, intent, simulated)
  values (s.business_id, v_conversation_id, 'customer', v_body, 'SANDBOX_OWNER_TEST', true)
  returning id into v_customer_message_id;

  insert into public.dabbir_whatsapp_sandbox_events(
    session_id, business_id, conversation_id, provider_message_id, sender_handle,
    customer_message_id, reply_state, occurred_at
  ) values (
    s.id, s.business_id, v_conversation_id, trim(p_provider_message_id), trim(p_sender_handle),
    v_customer_message_id, 'PENDING', coalesce(p_occurred_at, now())
  ) returning * into e;

  update public.dabbir_whatsapp_sandbox_sessions
     set last_message_at = now(), updated_at = now()
   where id = s.id;

  select b.name, b.business_type, b.locale into v_name, v_type, v_locale
    from public.dabbir_businesses b where b.id = s.business_id;

  return query select s.id, e.id, s.business_id, v_conversation_id, v_customer_message_id,
    false, e.reply_state, e.reply_body, v_name, v_type, v_locale;
end;
$$;

create or replace function public.dabbir_whatsapp_sandbox_ai_context(p_event_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_conversation_id uuid;
  v_business jsonb;
  v_knowledge jsonb;
  v_history jsonb;
begin
  select e.business_id, e.conversation_id into v_business_id, v_conversation_id
    from public.dabbir_whatsapp_sandbox_events e where e.id = p_event_id;
  if v_business_id is null then raise exception 'WHATSAPP_SANDBOX_EVENT_NOT_FOUND'; end if;

  select jsonb_build_object('name',b.name,'type',b.business_type,'locale',b.locale)
    into v_business from public.dabbir_businesses b where b.id = v_business_id;

  select coalesce(jsonb_agg(x.item order by x.updated_at desc), '[]'::jsonb) into v_knowledge
  from (
    select jsonb_build_object(
      'key',k.knowledge_key,'type',k.knowledge_type,'value',k.value,
      'source',k.source,'confidence',k.confidence
    ) as item, k.updated_at
    from public.dabbir_business_knowledge k
    where k.business_id = v_business_id
      and (k.status is null or lower(k.status) in ('active','verified','approved'))
    order by k.updated_at desc
    limit 30
  ) x;

  select coalesce(jsonb_agg(y.item order by y.created_at asc), '[]'::jsonb) into v_history
  from (
    select jsonb_build_object('sender_type',m.sender_type,'body',m.body,'created_at',m.created_at) as item, m.created_at
    from public.dabbir_messages m
    where m.business_id = v_business_id and m.conversation_id = v_conversation_id
    order by m.created_at desc
    limit 20
  ) y;

  return jsonb_build_object('business',v_business,'knowledge',v_knowledge,'history',v_history);
end;
$$;

create or replace function public.dabbir_whatsapp_sandbox_prepare_reply(
  p_event_id uuid,
  p_reply_body text,
  p_reply_body_hash text
)
returns table(
  event_id uuid,
  should_send boolean,
  reply_state text,
  recipient_handle text,
  provider_reply_message_id text,
  stored_reply_body text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  e public.dabbir_whatsapp_sandbox_events%rowtype;
  s public.dabbir_whatsapp_sandbox_sessions%rowtype;
begin
  if nullif(trim(p_reply_body),'') is null or coalesce(p_reply_body_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'WHATSAPP_SANDBOX_REPLY_INPUT_INVALID';
  end if;
  select * into e from public.dabbir_whatsapp_sandbox_events where id = p_event_id for update;
  if not found then raise exception 'WHATSAPP_SANDBOX_EVENT_NOT_FOUND'; end if;
  select * into s from public.dabbir_whatsapp_sandbox_sessions where id = e.session_id;
  if s.bound_sender_handle is null or s.status <> 'BOUND' or s.expires_at <= now() then
    raise exception 'WHATSAPP_SANDBOX_SESSION_NOT_ACTIVE';
  end if;

  if e.reply_state = 'PROVIDER_ACCEPTED' then
    return query select e.id, false, e.reply_state, s.bound_sender_handle, e.provider_reply_message_id, e.reply_body;
    return;
  end if;
  if e.reply_state in ('SENDING','AMBIGUOUS') then
    return query select e.id, false, e.reply_state, s.bound_sender_handle, e.provider_reply_message_id, e.reply_body;
    return;
  end if;
  if e.reply_state = 'FAILED' and (e.reply_body_hash is distinct from lower(p_reply_body_hash) or e.reply_body is distinct from left(p_reply_body,4000)) then
    raise exception 'WHATSAPP_SANDBOX_REPLY_RETRY_PAYLOAD_MISMATCH';
  end if;

  update public.dabbir_whatsapp_sandbox_events
     set reply_state = 'SENDING',
         reply_body = left(p_reply_body,4000),
         reply_body_hash = lower(p_reply_body_hash),
         error_code = null,
         updated_at = now()
   where id = e.id
   returning * into e;

  return query select e.id, true, e.reply_state, s.bound_sender_handle, e.provider_reply_message_id, e.reply_body;
end;
$$;

create or replace function public.dabbir_whatsapp_sandbox_finalize_reply(
  p_event_id uuid,
  p_provider_reply_message_id text
)
returns table(ai_message_id uuid, provider_reply_message_id text, reply_state text, duplicate boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  e public.dabbir_whatsapp_sandbox_events%rowtype;
  v_message_id uuid;
begin
  if nullif(trim(p_provider_reply_message_id),'') is null then raise exception 'WHATSAPP_SANDBOX_PROVIDER_REPLY_ID_REQUIRED'; end if;
  select * into e from public.dabbir_whatsapp_sandbox_events where id = p_event_id for update;
  if not found then raise exception 'WHATSAPP_SANDBOX_EVENT_NOT_FOUND'; end if;
  if e.reply_state = 'PROVIDER_ACCEPTED' then
    return query select e.ai_message_id, e.provider_reply_message_id, e.reply_state, true;
    return;
  end if;
  if e.reply_state <> 'SENDING' or e.reply_body is null then raise exception 'WHATSAPP_SANDBOX_REPLY_NOT_RESERVED'; end if;

  insert into public.dabbir_messages(business_id, conversation_id, sender_type, body, intent, simulated)
  values (e.business_id, e.conversation_id, 'ai', e.reply_body, 'SANDBOX_OWNER_TEST', true)
  returning id into v_message_id;

  update public.dabbir_conversations
     set state = 'waiting_customer', updated_at = now()
   where business_id = e.business_id and id = e.conversation_id;

  update public.dabbir_whatsapp_sandbox_events
     set ai_message_id = v_message_id,
         provider_reply_message_id = trim(p_provider_reply_message_id),
         reply_state = 'PROVIDER_ACCEPTED',
         provider_status = 'accepted',
         error_code = null,
         updated_at = now()
   where id = e.id
   returning * into e;

  return query select v_message_id, e.provider_reply_message_id, e.reply_state, false;
end;
$$;

create or replace function public.dabbir_whatsapp_sandbox_mark_reply_result(
  p_event_id uuid,
  p_state text,
  p_error_code text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_state text := upper(trim(coalesce(p_state,'')));
begin
  if v_state not in ('FAILED','AMBIGUOUS') then raise exception 'WHATSAPP_SANDBOX_REPLY_RESULT_INVALID'; end if;
  update public.dabbir_whatsapp_sandbox_events
     set reply_state = v_state, error_code = left(nullif(trim(p_error_code),''),160), updated_at = now()
   where id = p_event_id and reply_state = 'SENDING';
  return found;
end;
$$;

create or replace function public.dabbir_whatsapp_sandbox_apply_status(
  p_phone_number_id text,
  p_provider_message_id text,
  p_status text
)
returns table(matched boolean, reply_state text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  e public.dabbir_whatsapp_sandbox_events%rowtype;
begin
  select ev.* into e
    from public.dabbir_whatsapp_sandbox_events ev
    join public.dabbir_whatsapp_sandbox_sessions ss on ss.id = ev.session_id
   where ss.platform_phone_number_id = trim(p_phone_number_id)
     and ev.provider_reply_message_id = trim(p_provider_message_id)
   limit 1;
  if not found then return query select false, null::text; return; end if;
  update public.dabbir_whatsapp_sandbox_events
     set provider_status = left(lower(trim(coalesce(p_status,''))),40), updated_at = now()
   where id = e.id;
  return query select true, e.reply_state;
end;
$$;

revoke execute on function public.dabbir_whatsapp_sandbox_create_session(uuid,text,text,integer) from public, anon, authenticated;
revoke execute on function public.dabbir_whatsapp_sandbox_route_inbound(text,text,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke execute on function public.dabbir_whatsapp_sandbox_ai_context(uuid) from public, anon, authenticated;
revoke execute on function public.dabbir_whatsapp_sandbox_prepare_reply(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.dabbir_whatsapp_sandbox_finalize_reply(uuid,text) from public, anon, authenticated;
revoke execute on function public.dabbir_whatsapp_sandbox_mark_reply_result(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.dabbir_whatsapp_sandbox_apply_status(text,text,text) from public, anon, authenticated;

grant execute on function public.dabbir_whatsapp_sandbox_create_session(uuid,text,text,integer) to service_role;
grant execute on function public.dabbir_whatsapp_sandbox_route_inbound(text,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.dabbir_whatsapp_sandbox_ai_context(uuid) to service_role;
grant execute on function public.dabbir_whatsapp_sandbox_prepare_reply(uuid,text,text) to service_role;
grant execute on function public.dabbir_whatsapp_sandbox_finalize_reply(uuid,text) to service_role;
grant execute on function public.dabbir_whatsapp_sandbox_mark_reply_result(uuid,text,text) to service_role;
grant execute on function public.dabbir_whatsapp_sandbox_apply_status(text,text,text) to service_role;
