-- DABBIR WhatsApp AI receptionist P0: durable queue + atomic inbound dispatch.
-- Signed Meta inbound is persisted and enqueued in the same transaction.
-- AI processing happens out of webhook through a single-use dispatch token;
-- pg_net is best-effort fast dispatch, while the Vercel cron is recovery only.

alter table public.dabbir_message_batches
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists lock_token uuid,
  add column if not exists locked_until timestamptz,
  add column if not exists last_error text,
  add column if not exists dispatch_token uuid,
  add column if not exists dispatched_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

alter table public.dabbir_message_batches
  drop constraint if exists dabbir_message_batches_state_check,
  drop constraint if exists dabbir_message_batches_attempt_count_check,
  drop constraint if exists dabbir_message_batches_max_attempts_check;
alter table public.dabbir_message_batches
  add constraint dabbir_message_batches_state_check
    check (state in ('OPEN','READY','PROCESSING','RETRY','PROCESSED','CANCELLED','DEAD','HUMAN_REQUIRED')),
  add constraint dabbir_message_batches_attempt_count_check
    check (attempt_count between 0 and 20),
  add constraint dabbir_message_batches_max_attempts_check
    check (max_attempts between 1 and 20);

create unique index if not exists dabbir_message_batches_dispatch_token_uq
  on public.dabbir_message_batches(dispatch_token) where dispatch_token is not null;
create index if not exists dabbir_message_batches_ai_ready_idx
  on public.dabbir_message_batches(state,next_attempt_at,ready_at,updated_at)
  where state in ('OPEN','READY','RETRY','PROCESSING');
create index if not exists dabbir_message_batches_ai_conversation_idx
  on public.dabbir_message_batches(business_id,conversation_id,created_at desc);

create table if not exists public.dabbir_ai_conversation_state (
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  conversation_id uuid not null references public.dabbir_conversations(id) on delete cascade,
  pending_action text not null default 'none',
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id,conversation_id),
  constraint dabbir_ai_conversation_state_action_check
    check (pending_action in ('none','choose_slot','confirm_booking','choose_appointment','reschedule_slot','handoff'))
);
alter table public.dabbir_ai_conversation_state enable row level security;
revoke all on table public.dabbir_ai_conversation_state from public,anon,authenticated;
grant select,insert,update,delete on table public.dabbir_ai_conversation_state to service_role;

create table if not exists public.dabbir_ai_action_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  conversation_id uuid not null references public.dabbir_conversations(id) on delete cascade,
  operation_key text not null,
  operation_type text not null,
  fingerprint text not null,
  entity_id uuid,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_ai_action_ledger_operation_key_len check (char_length(operation_key) between 16 and 180),
  constraint dabbir_ai_action_ledger_type_check check (operation_type in ('booking.create','booking.cancel','booking.reschedule')),
  constraint dabbir_ai_action_ledger_fingerprint_check check (fingerprint ~ '^[0-9a-f]{32,64}$'),
  unique (business_id,operation_key)
);
alter table public.dabbir_ai_action_ledger enable row level security;
revoke all on table public.dabbir_ai_action_ledger from public,anon,authenticated;
grant select,insert,update,delete on table public.dabbir_ai_action_ledger to service_role;
create index if not exists dabbir_ai_action_ledger_conversation_idx
  on public.dabbir_ai_action_ledger(business_id,conversation_id,created_at desc);

-- Fix and harden the pre-existing batching primitive. The old function omitted the
-- mandatory ordinal column, so first real use would fail. A conversation-scoped
-- advisory lock also prevents two OPEN batches from being created concurrently.
create or replace function public.dabbir_enqueue_message_batch(
  p_business_id uuid,
  p_conversation_id uuid,
  p_customer_id uuid,
  p_channel_type text,
  p_message_id uuid,
  p_batch_window_ms integer default 3500,
  p_immediate_bypass boolean default false,
  p_bypass_reason text default null
) returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public'
as $function$
declare
  v_batch uuid;
  v_window integer;
  v_ordinal bigint;
begin
  v_window:=greatest(500,least(15000,coalesce(p_batch_window_ms,3500)));
  if p_channel_type not in ('whatsapp','instagram','web') then raise exception 'INVALID_CHANNEL'; end if;
  if not exists(select 1 from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id) then raise exception 'CONVERSATION_NOT_IN_BUSINESS'; end if;
  if not exists(select 1 from public.dabbir_messages m where m.id=p_message_id and m.business_id=p_business_id and m.conversation_id=p_conversation_id and m.sender_type='customer') then raise exception 'CUSTOMER_MESSAGE_NOT_IN_CONVERSATION'; end if;

  perform pg_advisory_xact_lock(hashtextextended('dabbir:message-batch:'||p_business_id::text||':'||p_conversation_id::text,0));

  -- A new customer turn supersedes a not-yet-processing retry/ready response.
  update public.dabbir_message_batches
     set state='CANCELLED',last_error='SUPERSEDED_BY_NEW_CUSTOMER_MESSAGE',
         lock_token=null,locked_until=null,updated_at=now()
   where business_id=p_business_id and conversation_id=p_conversation_id
     and state in ('READY','RETRY');

  select id into v_batch
  from public.dabbir_message_batches
  where business_id=p_business_id and conversation_id=p_conversation_id and state='OPEN'
  order by created_at desc
  for update limit 1;

  if v_batch is null then
    insert into public.dabbir_message_batches(
      business_id,conversation_id,customer_id,channel_type,batch_window_ms,message_count,
      immediate_bypass,bypass_reason,first_message_at,last_message_at,ready_at
    ) values(
      p_business_id,p_conversation_id,p_customer_id,p_channel_type,v_window,0,
      p_immediate_bypass,left(p_bypass_reason,120),now(),now(),
      case when p_immediate_bypass then now() else now()+(v_window||' milliseconds')::interval end
    ) returning id into v_batch;
  end if;

  select coalesce(max(i.ordinal),0)+1 into v_ordinal
  from public.dabbir_message_batch_items i where i.batch_id=v_batch;

  insert into public.dabbir_message_batch_items(business_id,batch_id,message_id,ordinal)
  values(p_business_id,v_batch,p_message_id,v_ordinal)
  on conflict (business_id,message_id) do nothing;

  update public.dabbir_message_batches b
  set message_count=(select count(*) from public.dabbir_message_batch_items i where i.batch_id=b.id),
      last_message_at=now(),
      immediate_bypass=b.immediate_bypass or p_immediate_bypass,
      bypass_reason=coalesce(b.bypass_reason,left(p_bypass_reason,120)),
      ready_at=case when b.immediate_bypass or p_immediate_bypass then now() else now()+(v_window||' milliseconds')::interval end,
      updated_at=now()
  where b.id=v_batch;
  return v_batch;
end;
$function$;
revoke all on function public.dabbir_enqueue_message_batch(uuid,uuid,uuid,text,uuid,integer,boolean,text) from public,anon,authenticated;
grant execute on function public.dabbir_enqueue_message_batch(uuid,uuid,uuid,text,uuid,integer,boolean,text) to service_role;

-- Signed Meta persistence + queue enqueue are one transaction. Duplicate Meta webhook
-- events return before enqueue, so provider retries cannot create duplicate AI turns.
create or replace function public.dabbir_whatsapp_persist_inbound(
  p_phone_number_id text,
  p_provider_message_id text,
  p_sender_handle text,
  p_display_name text,
  p_body text,
  p_intent text,
  p_occurred_at timestamptz default now()
) returns table(business_id uuid,connection_id uuid,customer_id uuid,conversation_id uuid,message_id uuid,duplicate boolean)
language plpgsql
set search_path='pg_catalog','public','dabbir_private','auth'
as $function$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_existing public.dabbir_whatsapp_event_ledger%rowtype;
  v_event_key text;
  v_name text;
  v_sender text:=trim(coalesce(p_sender_handle,''));
  v_batch_id uuid;
  v_dispatch_token uuid;
  v_dispatch_request bigint;
begin
  if nullif(trim(p_phone_number_id),'') is null then raise exception 'WHATSAPP_PHONE_NUMBER_ID_REQUIRED'; end if;
  if nullif(trim(p_provider_message_id),'') is null or length(p_provider_message_id)>320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  if nullif(v_sender,'') is null or length(v_sender)>160 then raise exception 'WHATSAPP_SENDER_REQUIRED'; end if;
  if nullif(trim(p_body),'') is null or length(p_body)>4000 then raise exception 'WHATSAPP_MESSAGE_BODY_REQUIRED'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
   where c.phone_number_id=trim(p_phone_number_id) and c.status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  v_event_key:='inbound:'||trim(p_provider_message_id);
  perform pg_advisory_xact_lock(hashtextextended(v_connection.business_id::text||':'||v_event_key,0));
  select * into v_existing from public.dabbir_whatsapp_event_ledger e
   where e.business_id=v_connection.business_id and e.event_key=v_event_key limit 1;
  if found then
    return query select v_existing.business_id,v_existing.connection_id,
      (select c.customer_id from public.dabbir_conversations c where c.id=v_existing.conversation_id),
      v_existing.conversation_id,v_existing.message_id,true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_connection.business_id::text||':wa-sender:'||v_sender,0));
  v_name:=left(coalesce(nullif(trim(p_display_name),''),'WhatsApp Customer'),120);
  insert into public.dabbir_customers(business_id,display_name,channel_handle,phone_e164,lead_status,metadata)
  values(v_connection.business_id,v_name,v_sender,case when v_sender~'^\+?[0-9]{7,20}$' then case when left(v_sender,1)='+' then v_sender else '+'||v_sender end else null end,'new',jsonb_build_object('source','whatsapp','provider','meta'))
  on conflict (business_id,channel_handle) where channel_handle is not null
  do update set
    display_name=case when excluded.display_name<>'WhatsApp Customer' then excluded.display_name else public.dabbir_customers.display_name end,
    phone_e164=coalesce(public.dabbir_customers.phone_e164,excluded.phone_e164),
    metadata=coalesce(public.dabbir_customers.metadata,'{}'::jsonb)||jsonb_build_object('source','whatsapp','provider','meta'),
    updated_at=now()
  returning id into v_customer_id;

  select c.id into v_conversation_id from public.dabbir_conversations c
   where c.business_id=v_connection.business_id and c.customer_id=v_customer_id
     and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed'
   order by c.updated_at desc limit 1 for update;
  if v_conversation_id is null then
    insert into public.dabbir_conversations(business_id,customer_id,channel_type,state,demo_mode)
    values(v_connection.business_id,v_customer_id,'whatsapp','ai_active',false)
    returning id into v_conversation_id;
  else
    update public.dabbir_conversations
       set state=case when state='waiting_customer' then 'ai_active' else state end,updated_at=now()
     where id=v_conversation_id and business_id=v_connection.business_id;
  end if;

  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated)
  values(v_connection.business_id,v_conversation_id,'customer',left(trim(p_body),4000),nullif(left(trim(coalesce(p_intent,'')),120),''),false)
  returning id into v_message_id;

  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,
    conversation_id,message_id,provider_status,provider_verified,occurred_at,verified_at,evidence
  ) values(
    v_connection.business_id,v_connection.id,v_event_key,'inbound','message',trim(p_provider_message_id),
    v_conversation_id,v_message_id,'received',true,coalesce(p_occurred_at,now()),now(),
    jsonb_build_object('source','meta_signed_webhook','signature_verified',true)
  );

  v_batch_id:=public.dabbir_enqueue_message_batch(
    v_connection.business_id,v_conversation_id,v_customer_id,'whatsapp',v_message_id,1200,false,null
  );
  v_dispatch_token:=gen_random_uuid();
  update public.dabbir_message_batches
     set dispatch_token=v_dispatch_token,dispatched_at=null,last_error=null,updated_at=now()
   where id=v_batch_id;

  -- Fast path only. Any failure here leaves the durable batch for recovery cron.
  begin
    v_dispatch_request:=net.http_post(
      url:='https://dabbir.bmalman.com/api/dabbir-whatsapp-ai-worker',
      body:=jsonb_build_object('dispatch_token',v_dispatch_token::text),
      params:='{}'::jsonb,
      headers:=jsonb_build_object('Content-Type','application/json','User-Agent','dabbir-pg-net/1.0'),
      timeout_milliseconds:=1000
    );
    update public.dabbir_message_batches set dispatched_at=now(),updated_at=now() where id=v_batch_id;
  exception when others then
    update public.dabbir_message_batches set last_error='FAST_DISPATCH_ENQUEUE_FAILED',updated_at=now() where id=v_batch_id;
  end;

  update public.dabbir_whatsapp_connections
     set last_verified_at=now(),last_provider_status=200,last_error=null,updated_at=now()
   where id=v_connection.id;

  return query select v_connection.business_id,v_connection.id,v_customer_id,v_conversation_id,v_message_id,false;
end;
$function$;
revoke all on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) to service_role;

create or replace function public.dabbir_whatsapp_ai_claim_dispatch(p_dispatch_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_lock uuid;
  v_conversation_state text;
  v_due timestamptz;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_dispatch_token is null then return jsonb_build_object('state','STALE_TOKEN'); end if;

  select * into v_batch from public.dabbir_message_batches
   where dispatch_token=p_dispatch_token limit 1 for update;
  if not found then return jsonb_build_object('state','STALE_TOKEN'); end if;

  if v_batch.state in ('PROCESSED','CANCELLED','DEAD','HUMAN_REQUIRED') then
    return jsonb_build_object('state',v_batch.state,'batch_id',v_batch.id);
  end if;

  select c.state into v_conversation_state from public.dabbir_conversations c
   where c.id=v_batch.conversation_id and c.business_id=v_batch.business_id;
  if v_conversation_state='human_active' then
    update public.dabbir_message_batches set state='HUMAN_REQUIRED',lock_token=null,locked_until=null,last_error='HUMAN_TAKEOVER_ACTIVE',updated_at=now() where id=v_batch.id;
    return jsonb_build_object('state','HUMAN_REQUIRED','batch_id',v_batch.id);
  end if;

  if v_batch.state='PROCESSING' and coalesce(v_batch.locked_until,now()+interval '1 minute')>now() then
    return jsonb_build_object('state','BUSY','batch_id',v_batch.id);
  elsif v_batch.state='PROCESSING' then
    update public.dabbir_message_batches set state='RETRY',lock_token=null,locked_until=null,next_attempt_at=now(),last_error='STALE_PROCESSING_LOCK_RECOVERED',updated_at=now() where id=v_batch.id;
    select * into v_batch from public.dabbir_message_batches where id=v_batch.id;
  end if;

  v_due:=greatest(v_batch.ready_at,coalesce(v_batch.next_attempt_at,v_batch.ready_at));
  if v_due>now() then
    return jsonb_build_object('state','WAIT','batch_id',v_batch.id,'ready_at',v_due);
  end if;
  if v_batch.state not in ('OPEN','READY','RETRY') then return jsonb_build_object('state','BUSY','batch_id',v_batch.id); end if;

  v_lock:=gen_random_uuid();
  update public.dabbir_message_batches
     set state='PROCESSING',processing_started_at=now(),attempt_count=attempt_count+1,
         lock_token=v_lock,locked_until=now()+interval '60 seconds',next_attempt_at=null,last_error=null,updated_at=now()
   where id=v_batch.id;
  return jsonb_build_object('state','CLAIMED','batch_id',v_batch.id,'lock_token',v_lock,'attempt_count',v_batch.attempt_count+1);
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_claim_dispatch(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_claim_dispatch(uuid) to service_role;

create or replace function public.dabbir_whatsapp_ai_claim_next()
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_lock uuid;
  v_conversation_state text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;

  select * into v_batch from public.dabbir_message_batches b
   where b.channel_type='whatsapp'
     and (
       (b.state in ('OPEN','READY','RETRY') and greatest(b.ready_at,coalesce(b.next_attempt_at,b.ready_at))<=now())
       or (b.state='PROCESSING' and coalesce(b.locked_until,'epoch'::timestamptz)<=now())
     )
   order by case when b.state='PROCESSING' then 0 else 1 end,b.ready_at asc
   for update skip locked limit 1;
  if not found then return jsonb_build_object('state','EMPTY'); end if;

  select c.state into v_conversation_state from public.dabbir_conversations c
   where c.id=v_batch.conversation_id and c.business_id=v_batch.business_id;
  if v_conversation_state='human_active' then
    update public.dabbir_message_batches set state='HUMAN_REQUIRED',lock_token=null,locked_until=null,last_error='HUMAN_TAKEOVER_ACTIVE',updated_at=now() where id=v_batch.id;
    return jsonb_build_object('state','HUMAN_REQUIRED','batch_id',v_batch.id);
  end if;

  v_lock:=gen_random_uuid();
  update public.dabbir_message_batches
     set state='PROCESSING',processing_started_at=now(),attempt_count=attempt_count+1,
         lock_token=v_lock,locked_until=now()+interval '60 seconds',next_attempt_at=null,
         last_error=case when v_batch.state='PROCESSING' then 'STALE_PROCESSING_LOCK_RECOVERED' else null end,
         updated_at=now()
   where id=v_batch.id;
  return jsonb_build_object('state','CLAIMED','batch_id',v_batch.id,'lock_token',v_lock,'attempt_count',v_batch.attempt_count+1,'recovery',true);
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_claim_next() from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_claim_next() to service_role;

create or replace function public.dabbir_whatsapp_ai_finish_batch(
  p_batch_id uuid,p_lock_token uuid,p_outcome text,p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_outcome text:=upper(trim(coalesce(p_outcome,'')));
  v_delay integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_batch from public.dabbir_message_batches where id=p_batch_id for update;
  if not found then raise exception 'AI_BATCH_NOT_FOUND'; end if;
  if v_batch.state<>'PROCESSING' or v_batch.lock_token is distinct from p_lock_token then raise exception 'AI_BATCH_LOCK_MISMATCH'; end if;

  if v_outcome='PROCESSED' then
    update public.dabbir_message_batches set state='PROCESSED',processed_at=now(),lock_token=null,locked_until=null,last_error=null,updated_at=now() where id=p_batch_id;
  elsif v_outcome='HUMAN_REQUIRED' then
    update public.dabbir_message_batches set state='HUMAN_REQUIRED',lock_token=null,locked_until=null,last_error=left(coalesce(p_error,'HUMAN_REQUIRED'),300),updated_at=now() where id=p_batch_id;
  elsif v_outcome='CANCELLED' then
    update public.dabbir_message_batches set state='CANCELLED',lock_token=null,locked_until=null,last_error=left(coalesce(p_error,'SUPERSEDED'),300),updated_at=now() where id=p_batch_id;
  elsif v_outcome='RETRY' and v_batch.attempt_count<v_batch.max_attempts then
    v_delay:=least(60,greatest(2,(2^least(v_batch.attempt_count,5))::integer));
    update public.dabbir_message_batches set state='RETRY',next_attempt_at=now()+make_interval(secs=>v_delay),lock_token=null,locked_until=null,last_error=left(coalesce(p_error,'RETRY'),300),updated_at=now() where id=p_batch_id;
  else
    update public.dabbir_message_batches set state='DEAD',dead_lettered_at=now(),lock_token=null,locked_until=null,last_error=left(coalesce(p_error,'AI_BATCH_FAILED'),300),updated_at=now() where id=p_batch_id;
  end if;

  select * into v_batch from public.dabbir_message_batches where id=p_batch_id;
  return jsonb_build_object('batch_id',v_batch.id,'state',v_batch.state,'attempt_count',v_batch.attempt_count,'next_attempt_at',v_batch.next_attempt_at);
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_finish_batch(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_finish_batch(uuid,uuid,text,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_context(p_batch_id uuid,p_lock_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_business public.dabbir_businesses%rowtype;
  v_customer public.dabbir_customers%rowtype;
  v_state public.dabbir_ai_conversation_state%rowtype;
  v_newer boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_batch from public.dabbir_message_batches where id=p_batch_id and state='PROCESSING' and lock_token=p_lock_token;
  if not found then raise exception 'AI_BATCH_LOCK_MISMATCH'; end if;
  select * into v_conversation from public.dabbir_conversations where id=v_batch.conversation_id and business_id=v_batch.business_id;
  if not found then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  select * into v_business from public.dabbir_businesses where id=v_batch.business_id;
  select * into v_customer from public.dabbir_customers where id=v_conversation.customer_id and business_id=v_batch.business_id;
  select * into v_state from public.dabbir_ai_conversation_state where business_id=v_batch.business_id and conversation_id=v_batch.conversation_id and (expires_at is null or expires_at>now());

  select exists(
    select 1 from public.dabbir_messages m
    where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id
      and m.sender_type='customer' and m.simulated=false and m.created_at>v_batch.last_message_at
  ) into v_newer;

  return jsonb_build_object(
    'batch',jsonb_build_object('id',v_batch.id,'business_id',v_batch.business_id,'conversation_id',v_batch.conversation_id,'customer_id',v_batch.customer_id,'message_count',v_batch.message_count,'attempt_count',v_batch.attempt_count,'last_message_at',v_batch.last_message_at),
    'conversation',jsonb_build_object('id',v_conversation.id,'state',v_conversation.state,'channel_type',v_conversation.channel_type,'newer_customer_message_exists',v_newer),
    'business',jsonb_build_object('id',v_business.id,'name',v_business.name,'business_type',v_business.business_type,'locale',v_business.locale,'country_code',v_business.country_code,'currency_code',v_business.currency_code,'timezone',v_business.timezone),
    'customer',jsonb_build_object('id',v_customer.id,'display_name',v_customer.display_name,'phone_e164',v_customer.phone_e164,'channel_handle',v_customer.channel_handle),
    'pending_state',case when v_state.conversation_id is null then null else jsonb_build_object('pending_action',v_state.pending_action,'payload',v_state.payload,'expires_at',v_state.expires_at) end,
    'batch_messages',coalesce((
      select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'created_at',m.created_at) order by i.ordinal)
      from public.dabbir_message_batch_items i join public.dabbir_messages m on m.id=i.message_id and m.business_id=i.business_id
      where i.batch_id=v_batch.id
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(x.obj order by x.created_at) from (
        select jsonb_build_object('sender_type',m.sender_type,'body',m.body,'created_at',m.created_at) obj,m.created_at
        from public.dabbir_messages m where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id and m.id not in (select message_id from public.dabbir_message_batch_items where batch_id=v_batch.id)
        order by m.created_at desc limit 10
      ) x
    ),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'name_ar',s.name_ar,'name_en',s.name_en,'duration_minutes',s.duration_minutes,'price',s.price_aed) order by s.name) from public.dabbir_services s where s.business_id=v_batch.business_id and s.active),'[]'::jsonb),
    'workers',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'display_name',w.display_name,'job_title',w.job_title) order by w.display_name) from public.dabbir_workers w where w.business_id=v_batch.business_id and w.status='active'),'[]'::jsonb),
    'worker_services',coalesce((select jsonb_agg(jsonb_build_object('worker_id',ws.worker_id,'service_id',ws.service_id,'duration_minutes',ws.duration_minutes,'price',ws.price_aed)) from public.dabbir_worker_services ws where ws.business_id=v_batch.business_id and ws.active),'[]'::jsonb),
    'upcoming_appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'service_id',a.service_id,'worker_id',a.worker_id,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,'confirmation_gate',a.confirmation_gate,'deposit_required_amount',a.deposit_required_amount,'deposit_currency_code',a.deposit_currency_code) order by a.starts_at) from public.dabbir_appointments a where a.business_id=v_batch.business_id and a.customer_id=v_customer.id and a.starts_at>=now() and a.status not in ('cancelled','completed','no_show') limit 10),'[]'::jsonb),
    'knowledge',coalesce((select jsonb_agg(jsonb_build_object('key',k.knowledge_key,'type',k.knowledge_type,'value',k.value,'source',k.source,'confidence',k.confidence)) from public.dabbir_business_knowledge k where k.business_id=v_batch.business_id and (k.status is null or lower(k.status) in ('active','verified','approved')) order by k.updated_at desc limit 20),'[]'::jsonb)
  );
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_context(uuid,uuid) to service_role;

create or replace function public.dabbir_whatsapp_ai_set_state(
  p_business_id uuid,p_conversation_id uuid,p_pending_action text,p_payload jsonb,p_ttl_seconds integer default 900
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare v_action text:=lower(trim(coalesce(p_pending_action,'none')));v_exp timestamptz;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id) then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if v_action not in ('none','choose_slot','confirm_booking','choose_appointment','reschedule_slot','handoff') then raise exception 'AI_PENDING_ACTION_INVALID'; end if;
  v_exp:=case when v_action='none' then null else now()+make_interval(secs=>greatest(60,least(86400,coalesce(p_ttl_seconds,900)))) end;
  insert into public.dabbir_ai_conversation_state(business_id,conversation_id,pending_action,payload,expires_at,updated_at)
  values(p_business_id,p_conversation_id,v_action,coalesce(p_payload,'{}'::jsonb),v_exp,now())
  on conflict (business_id,conversation_id) do update set pending_action=excluded.pending_action,payload=excluded.payload,expires_at=excluded.expires_at,updated_at=now();
  return jsonb_build_object('pending_action',v_action,'expires_at',v_exp);
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_set_state(uuid,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_set_state(uuid,uuid,text,jsonb,integer) to service_role;

-- Legacy batch claim/mark functions must not become a side door around the AI lock protocol.
revoke all on function public.dabbir_claim_ready_message_batch() from public,anon,authenticated;
revoke all on function public.dabbir_mark_message_batch_processed(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_claim_ready_message_batch() to service_role;
grant execute on function public.dabbir_mark_message_batch_processed(uuid) to service_role;
