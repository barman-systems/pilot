-- DABBIR SQL special-form qualification root fix v1
-- Fixes runtime-only PostgreSQL resolution failures caused by schema-qualifying
-- SQL special forms (COALESCE/NULLIF/TRIM) as if they were pg_catalog functions.
-- Existing tenant, authorization, RLS, idempotency and execution gates remain unchanged.

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
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_existing public.dabbir_whatsapp_event_ledger%rowtype;
  v_event_key text;
  v_sender text := pg_catalog.regexp_replace(coalesce(p_sender_handle, ''), '[^0-9]', '', 'g');
  v_batch_id uuid;
  v_dispatch_token uuid;
  v_dispatch_request bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if nullif(pg_catalog.btrim(p_phone_number_id), '') is null then
    raise exception 'WHATSAPP_PHONE_NUMBER_ID_REQUIRED';
  end if;
  if nullif(pg_catalog.btrim(p_provider_message_id), '') is null or pg_catalog.length(p_provider_message_id) > 320 then
    raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED';
  end if;
  if pg_catalog.length(v_sender) not between 7 and 20 then
    raise exception 'WHATSAPP_SENDER_REQUIRED';
  end if;
  if nullif(pg_catalog.btrim(p_body), '') is null or pg_catalog.length(p_body) > 4000 then
    raise exception 'WHATSAPP_MESSAGE_BODY_REQUIRED';
  end if;

  select * into v_connection
  from public.dabbir_whatsapp_connections c
  where c.phone_number_id = pg_catalog.btrim(p_phone_number_id)
    and c.status = 'connected'
  limit 1;
  if not found then
    raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND';
  end if;

  v_event_key := 'inbound:' || pg_catalog.btrim(p_provider_message_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_connection.business_id::text || ':' || v_event_key, 0)
  );

  select * into v_existing
  from public.dabbir_whatsapp_event_ledger e
  where e.business_id = v_connection.business_id
    and e.event_key = v_event_key
  limit 1;
  if found then
    return query
    select v_existing.business_id,
           v_existing.connection_id,
           (select c.customer_id from public.dabbir_conversations c where c.id = v_existing.conversation_id),
           v_existing.conversation_id,
           v_existing.message_id,
           true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_connection.business_id::text || ':' || v_connection.branch_id::text || ':wa-sender:' || v_sender,
      0
    )
  );
  v_customer_id := dabbir_private.resolve_whatsapp_customer_v1(
    v_connection.business_id,
    v_sender,
    p_display_name
  );

  select c.id into v_conversation_id
  from public.dabbir_conversations c
  where c.business_id = v_connection.business_id
    and c.branch_id = v_connection.branch_id
    and c.customer_id = v_customer_id
    and c.channel_type = 'whatsapp'
    and c.demo_mode = false
    and c.state <> 'closed'
  order by c.updated_at desc
  limit 1
  for update;

  if v_conversation_id is null then
    insert into public.dabbir_conversations(
      business_id, branch_id, customer_id, channel_type, state, demo_mode
    ) values (
      v_connection.business_id, v_connection.branch_id, v_customer_id, 'whatsapp', 'ai_active', false
    ) returning id into v_conversation_id;
  else
    update public.dabbir_conversations
       set state = case when state = 'waiting_customer' then 'ai_active' else state end,
           updated_at = now()
     where id = v_conversation_id
       and business_id = v_connection.business_id
       and branch_id = v_connection.branch_id;
  end if;

  insert into public.dabbir_messages(
    business_id, conversation_id, sender_type, body, intent, simulated
  ) values (
    v_connection.business_id,
    v_conversation_id,
    'customer',
    left(pg_catalog.btrim(p_body), 4000),
    nullif(left(pg_catalog.btrim(coalesce(p_intent, '')), 120), ''),
    false
  ) returning id into v_message_id;

  insert into public.dabbir_whatsapp_event_ledger(
    business_id,
    connection_id,
    event_key,
    direction,
    event_type,
    provider_message_id,
    conversation_id,
    message_id,
    provider_status,
    provider_verified,
    occurred_at,
    verified_at,
    evidence
  ) values (
    v_connection.business_id,
    v_connection.id,
    v_event_key,
    'inbound',
    'message',
    pg_catalog.btrim(p_provider_message_id),
    v_conversation_id,
    v_message_id,
    'received',
    true,
    coalesce(p_occurred_at, now()),
    now(),
    jsonb_build_object(
      'source', 'meta_signed_webhook',
      'signature_verified', true,
      'branch_id', v_connection.branch_id
    )
  );

  v_batch_id := public.dabbir_enqueue_message_batch(
    v_connection.business_id,
    v_conversation_id,
    v_customer_id,
    'whatsapp',
    v_message_id,
    1200,
    false,
    null
  );
  v_dispatch_token := extensions.gen_random_uuid();
  update public.dabbir_message_batches
     set dispatch_token = v_dispatch_token,
         dispatched_at = null,
         last_error = null,
         updated_at = now()
   where id = v_batch_id;

  begin
    v_dispatch_request := net.http_post(
      url := 'https://dabbir.bmalman.com/api/dabbir-whatsapp-ai-worker',
      body := jsonb_build_object('dispatch_token', v_dispatch_token::text),
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'User-Agent', 'dabbir-pg-net/1.0'
      ),
      timeout_milliseconds := 1000
    );
    update public.dabbir_message_batches
       set dispatched_at = now(), updated_at = now()
     where id = v_batch_id;
  exception when others then
    update public.dabbir_message_batches
       set last_error = 'FAST_DISPATCH_ENQUEUE_FAILED', updated_at = now()
     where id = v_batch_id;
  end;

  update public.dabbir_whatsapp_connections
     set last_verified_at = now(),
         last_provider_status = 200,
         last_error = null,
         updated_at = now()
   where id = v_connection.id;

  return query
  select v_connection.business_id,
         v_connection.id,
         v_customer_id,
         v_conversation_id,
         v_message_id,
         false;
end;
$function$;

revoke all on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz)
from public, anon, authenticated;
grant execute on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz)
to service_role;

create or replace function public.dabbir_car_wash_public_booking_abuse_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_phone_key text;
  v_recent_count integer;
  v_daily_count integer;
begin
  if new.source is distinct from 'public_booking' then
    return new;
  end if;

  v_phone_key := pg_catalog.regexp_replace(
    coalesce(new.customer_phone, ''),
    '[^0-9]'::text,
    ''::text,
    'g'::text
  );
  if pg_catalog.length(v_phone_key) < 6 then
    raise exception 'INVALID_CUSTOMER_PHONE' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.business_id::text || ':' || v_phone_key, 0)
  );

  select pg_catalog.count(*)::integer
    into v_recent_count
    from public.dabbir_car_wash_booking_requests r
   where r.business_id = new.business_id
     and r.source = 'public_booking'
     and r.created_at >= pg_catalog.now() - interval '10 minutes'
     and pg_catalog.regexp_replace(r.customer_phone, '[^0-9]'::text, ''::text, 'g'::text) = v_phone_key;

  if v_recent_count >= 5 then
    raise exception 'BOOKING_RATE_LIMITED' using errcode = 'P0001';
  end if;

  select pg_catalog.count(*)::integer
    into v_daily_count
    from public.dabbir_car_wash_booking_requests r
   where r.business_id = new.business_id
     and r.source = 'public_booking'
     and r.created_at >= pg_catalog.now() - interval '24 hours'
     and pg_catalog.regexp_replace(r.customer_phone, '[^0-9]'::text, ''::text, 'g'::text) = v_phone_key;

  if v_daily_count >= 20 then
    raise exception 'BOOKING_RATE_LIMITED' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function public.dabbir_car_wash_public_booking_abuse_guard()
from public, anon, authenticated;

notify pgrst, 'reload schema';