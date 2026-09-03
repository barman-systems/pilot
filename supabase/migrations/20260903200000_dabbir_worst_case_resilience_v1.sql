-- DABBIR worst-case resilience v1.
-- Business truth is committed first; external side effects are retried separately.

alter table public.dabbir_appointments
  add column if not exists idempotency_key text,
  add column if not exists idempotency_payload_hash text;

create unique index if not exists dabbir_appointments_business_idempotency_uq
  on public.dabbir_appointments(business_id,idempotency_key)
  where idempotency_key is not null;

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_idempotency_key_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_idempotency_key_check
  check (idempotency_key is null or char_length(idempotency_key) between 16 and 160);

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_idempotency_hash_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_idempotency_hash_check
  check (idempotency_payload_hash is null or idempotency_payload_hash ~ '^[0-9a-f]{64}$');

-- Operational bookings are never hard-deleted by normal authenticated users.
-- Cancellation preserves history, audit, reminders and recovery evidence.
drop policy if exists dabbir_appointments_delete on public.dabbir_appointments;
revoke delete on public.dabbir_appointments from authenticated;

create table if not exists public.dabbir_integration_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  destination text not null check (destination in ('calendar_sync')),
  aggregate_type text not null default 'appointment' check (char_length(aggregate_type) between 2 and 60),
  aggregate_id uuid,
  event_type text not null check (char_length(event_type) between 2 and 80),
  idempotency_key text not null check (char_length(idempotency_key) between 12 and 200),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','retry','succeeded','dead','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  max_attempts integer not null default 8 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_token uuid,
  provider_correlation_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (business_id,destination,idempotency_key)
);

create index if not exists dabbir_integration_outbox_due_idx
  on public.dabbir_integration_outbox(status,available_at,created_at)
  where status in ('pending','retry');
create index if not exists dabbir_integration_outbox_dead_idx
  on public.dabbir_integration_outbox(updated_at desc,business_id)
  where status='dead';
create index if not exists dabbir_integration_outbox_business_idx
  on public.dabbir_integration_outbox(business_id,destination,created_at desc);

alter table public.dabbir_integration_outbox enable row level security;
revoke all on public.dabbir_integration_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.dabbir_integration_outbox to service_role;

create table if not exists public.dabbir_rate_limit_windows (
  action text not null check (char_length(action) between 2 and 80),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (action,key_hash,window_started_at)
);
create index if not exists dabbir_rate_limit_windows_expiry_idx
  on public.dabbir_rate_limit_windows(expires_at);
alter table public.dabbir_rate_limit_windows enable row level security;
revoke all on public.dabbir_rate_limit_windows from public,anon,authenticated;
grant select,insert,update,delete on public.dabbir_rate_limit_windows to service_role;

alter table public.dabbir_workflow_notifications
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 6,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz;

alter table public.dabbir_workflow_notifications
  drop constraint if exists dabbir_workflow_notifications_attempts_check;
alter table public.dabbir_workflow_notifications
  add constraint dabbir_workflow_notifications_attempts_check check (attempts between 0 and 100);
alter table public.dabbir_workflow_notifications
  drop constraint if exists dabbir_workflow_notifications_max_attempts_check;
alter table public.dabbir_workflow_notifications
  add constraint dabbir_workflow_notifications_max_attempts_check check (max_attempts between 1 and 20);

create index if not exists dabbir_workflow_notifications_retry_due_idx
  on public.dabbir_workflow_notifications(status,coalesce(next_attempt_at,scheduled_for),scheduled_for)
  where status='pending';

create or replace function public.dabbir_create_appointment_idempotent(
  p_business_id uuid,
  p_idempotency_key text,
  p_customer_id uuid default null,
  p_customer_name text default 'Customer',
  p_customer_phone text default null,
  p_service_id uuid default null,
  p_worker_id uuid default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_source text default 'internal'
) returns table(appointment_id uuid, customer_id uuid, duplicate boolean, status text)
language plpgsql
security invoker
set search_path=public,extensions,pg_temp
as $function$
declare
  v_key text := trim(coalesce(p_idempotency_key,''));
  v_customer_id uuid := p_customer_id;
  v_payload_hash text;
  v_existing public.dabbir_appointments%rowtype;
  v_inserted public.dabbir_appointments%rowtype;
  v_name text := left(coalesce(nullif(trim(p_customer_name),''),'Customer'),120);
  v_phone text := nullif(left(trim(coalesce(p_customer_phone,'')),30),'');
  v_end timestamptz;
begin
  if p_business_id is null then raise exception 'BUSINESS_REQUIRED'; end if;
  if char_length(v_key) < 16 or char_length(v_key) > 160 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  if p_starts_at is null or p_starts_at <= now() then raise exception 'VALID_FUTURE_START_REQUIRED'; end if;
  if coalesce(p_source,'internal') not in ('internal','web','whatsapp','phone','walk_in','rebook','waitlist','calendar_sync') then raise exception 'INVALID_BOOKING_SOURCE'; end if;
  v_end := coalesce(p_ends_at,p_starts_at+interval '60 minutes');
  if v_end <= p_starts_at then raise exception 'INVALID_APPOINTMENT_RANGE'; end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'business_id',p_business_id,'customer_id',p_customer_id,'customer_name',v_name,
    'customer_phone',v_phone,'service_id',p_service_id,'worker_id',p_worker_id,
    'starts_at',p_starts_at,'ends_at',v_end,'source',coalesce(p_source,'internal')
  )::text,'sha256'),'hex');

  select a.* into v_existing
  from public.dabbir_appointments a
  where a.business_id=p_business_id and a.idempotency_key=v_key
  limit 1;
  if found then
    if v_existing.idempotency_payload_hash is distinct from v_payload_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSE_CONFLICT';
    end if;
    return query select v_existing.id,v_existing.customer_id,true,v_existing.status;
    return;
  end if;

  begin
    if v_customer_id is null and v_phone is not null then
      select c.id into v_customer_id from public.dabbir_customers c
      where c.business_id=p_business_id and c.phone_e164=v_phone limit 1;
    end if;
    if v_customer_id is null then
      insert into public.dabbir_customers(business_id,display_name,phone_e164,lead_status,metadata)
      values(p_business_id,v_name,v_phone,'new',jsonb_build_object('source','idempotent_booking_runtime'))
      on conflict (business_id,phone_e164) where phone_e164 is not null
      do update set display_name=excluded.display_name,updated_at=now()
      returning id into v_customer_id;
    end if;

    insert into public.dabbir_appointments(
      business_id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,
      booking_source,idempotency_key,idempotency_payload_hash
    ) values(
      p_business_id,v_customer_id,p_service_id,p_worker_id,p_starts_at,v_end,'new',false,
      coalesce(p_source,'internal'),v_key,v_payload_hash
    ) returning * into v_inserted;
  exception when unique_violation then
    select a.* into v_existing
    from public.dabbir_appointments a
    where a.business_id=p_business_id and a.idempotency_key=v_key
    limit 1;
    if not found then raise; end if;
    if v_existing.idempotency_payload_hash is distinct from v_payload_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSE_CONFLICT';
    end if;
    return query select v_existing.id,v_existing.customer_id,true,v_existing.status;
    return;
  end;

  return query select v_inserted.id,v_inserted.customer_id,false,v_inserted.status;
end;
$function$;
revoke all on function public.dabbir_create_appointment_idempotent(uuid,text,uuid,text,text,uuid,uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.dabbir_create_appointment_idempotent(uuid,text,uuid,text,text,uuid,uuid,timestamptz,timestamptz,text) to authenticated;

create or replace function dabbir_private.enqueue_calendar_sync_from_appointment()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_event text;
  v_key text;
begin
  if tg_op='UPDATE' and row(new.starts_at,new.ends_at,new.status,new.worker_id,new.customer_id,new.service_id)
     is not distinct from row(old.starts_at,old.ends_at,old.status,old.worker_id,old.customer_id,old.service_id) then
    return new;
  end if;
  if not exists(
    select 1 from public.dabbir_calendar_connections c
    where c.business_id=new.business_id and c.status='active' and c.sync_enabled=true
  ) then return new; end if;

  v_event := case when new.status='cancelled' then 'appointment.cancelled' else 'appointment.upserted' end;
  v_key := 'appointment:'||new.id||':'||txid_current()::text;
  insert into public.dabbir_integration_outbox(
    business_id,destination,aggregate_type,aggregate_id,event_type,idempotency_key,payload
  ) values(
    new.business_id,'calendar_sync','appointment',new.id,v_event,v_key,
    jsonb_build_object('appointment_id',new.id,'status',new.status,'starts_at',new.starts_at,'ends_at',new.ends_at)
  ) on conflict (business_id,destination,idempotency_key) do nothing;
  return new;
end;
$function$;
revoke all on function dabbir_private.enqueue_calendar_sync_from_appointment() from public,anon,authenticated;

drop trigger if exists zz_dabbir_appointment_calendar_outbox on public.dabbir_appointments;
create trigger zz_dabbir_appointment_calendar_outbox
after insert or update on public.dabbir_appointments
for each row execute function dabbir_private.enqueue_calendar_sync_from_appointment();

create or replace function public.dabbir_claim_integration_jobs(p_limit integer default 20)
returns table(
  job_id uuid,business_id uuid,destination text,aggregate_type text,aggregate_id uuid,
  event_type text,payload jsonb,attempts integer,max_attempts integer,lock_token uuid
)
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
begin
  update public.dabbir_integration_outbox o
  set status=case when o.attempts>=o.max_attempts then 'dead' else 'retry' end,
      available_at=case when o.attempts>=o.max_attempts then o.available_at else now() end,
      last_error=case when o.attempts>=o.max_attempts then 'STALE_PROCESSING_EXHAUSTED' else 'STALE_PROCESSING_RECOVERED' end,
      locked_at=null,lock_token=null,updated_at=now(),
      completed_at=case when o.attempts>=o.max_attempts then now() else null end
  where o.status='processing' and o.locked_at<now()-interval '5 minutes';

  return query
  with candidates as (
    select o.id
    from public.dabbir_integration_outbox o
    where o.status in ('pending','retry') and o.available_at<=now()
    order by o.available_at,o.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  ), claimed as (
    update public.dabbir_integration_outbox o
    set status='processing',attempts=o.attempts+1,locked_at=now(),lock_token=gen_random_uuid(),updated_at=now()
    from candidates c where o.id=c.id
    returning o.*
  )
  select c.id,c.business_id,c.destination,c.aggregate_type,c.aggregate_id,c.event_type,
         c.payload,c.attempts,c.max_attempts,c.lock_token
  from claimed c order by c.available_at,c.created_at;
end;
$function$;
revoke all on function public.dabbir_claim_integration_jobs(integer) from public,anon,authenticated;
grant execute on function public.dabbir_claim_integration_jobs(integer) to service_role;

create or replace function public.dabbir_finalize_integration_job(
  p_job_id uuid,p_lock_token uuid,p_success boolean,p_retryable boolean,
  p_error text default null,p_provider_correlation_id text default null
) returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_job public.dabbir_integration_outbox%rowtype;
  v_state text;
  v_delay integer;
begin
  select o.* into v_job from public.dabbir_integration_outbox o
  where o.id=p_job_id and o.status='processing' and o.lock_token=p_lock_token for update;
  if not found then return 'not_owned'; end if;

  if p_success then
    v_state:='succeeded';
    update public.dabbir_integration_outbox o set status=v_state,completed_at=now(),locked_at=null,lock_token=null,
      provider_correlation_id=left(nullif(p_provider_correlation_id,''),320),last_error=null,updated_at=now()
    where o.id=p_job_id;
  elsif coalesce(p_retryable,false) and v_job.attempts<v_job.max_attempts then
    v_state:='retry';
    v_delay:=least(1800,15*power(2,greatest(0,v_job.attempts-1))::integer);
    update public.dabbir_integration_outbox o set status=v_state,available_at=now()+make_interval(secs=>v_delay),
      locked_at=null,lock_token=null,last_error=left(nullif(p_error,''),500),updated_at=now()
    where o.id=p_job_id;
  else
    v_state:='dead';
    update public.dabbir_integration_outbox o set status=v_state,completed_at=now(),locked_at=null,lock_token=null,
      last_error=left(nullif(p_error,''),500),updated_at=now()
    where o.id=p_job_id;
  end if;
  return v_state;
end;
$function$;
revoke all on function public.dabbir_finalize_integration_job(uuid,uuid,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_finalize_integration_job(uuid,uuid,boolean,boolean,text,text) to service_role;

create or replace function public.dabbir_claim_workflow_notifications(p_limit integer default 25)
returns table(
  notification_id uuid,business_id uuid,appointment_id uuid,customer_id uuid,notification_type text,
  template_name text,template_language text,idempotency_key text,phone_e164 text,business_name text,
  timezone text,starts_at timestamptz,ends_at timestamptz,service_name_ar text,service_name_en text,worker_name text
)
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
begin
  update public.dabbir_workflow_notifications n
  set status=case when n.attempts>=n.max_attempts then 'failed' else 'pending' end,
      next_attempt_at=case when n.attempts>=n.max_attempts then n.next_attempt_at else now() end,
      last_error=case when n.attempts>=n.max_attempts then 'STALE_PROCESSING_EXHAUSTED' else 'STALE_PROCESSING_RECOVERED' end,
      updated_at=now()
  where n.status='processing' and n.updated_at<now()-interval '15 minutes';

  update public.dabbir_workflow_notifications n
  set status='failed',last_error='NOTIFICATION_EXPIRED_BEFORE_DELIVERY',updated_at=now()
  where n.status='pending' and n.scheduled_for<now()-interval '2 days';

  return query
  with candidates as (
    select n.id
    from public.dabbir_workflow_notifications n
    where n.status='pending' and n.scheduled_for<=now()
      and coalesce(n.next_attempt_at,n.scheduled_for)<=now()
      and n.attempts<n.max_attempts
    order by coalesce(n.next_attempt_at,n.scheduled_for),n.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  ), claimed as (
    update public.dabbir_workflow_notifications n
    set status='processing',attempts=n.attempts+1,last_attempt_at=now(),updated_at=now(),last_error=null
    from candidates c where n.id=c.id returning n.*
  )
  select n.id,n.business_id,n.appointment_id,n.customer_id,n.notification_type,
    coalesce(n.template_name,case n.notification_type
      when 'booking_confirmation' then 'dabbir_salon_booking_confirmation'
      when 'reminder_24h' then 'dabbir_salon_reminder_24h'
      when 'reminder_2h' then 'dabbir_salon_reminder_2h'
      when 'appointment_changed' then 'dabbir_salon_appointment_changed'
      when 'appointment_cancelled' then 'dabbir_salon_appointment_cancelled'
      when 'waitlist_offer' then 'dabbir_salon_waitlist_offer'
      when 'rebooking' then 'dabbir_salon_rebooking'
      else 'dabbir_salon_follow_up' end),
    n.template_language,n.idempotency_key,c.phone_e164,b.name,coalesce(ss.timezone,'Asia/Dubai'),a.starts_at,a.ends_at,
    coalesce(s.name_ar,s.name),coalesce(s.name_en,s.name),w.display_name
  from claimed n
  join public.dabbir_businesses b on b.id=n.business_id and b.business_type='salon'
  left join public.dabbir_salon_settings ss on ss.business_id=n.business_id
  join public.dabbir_customers c on c.id=n.customer_id and c.business_id=n.business_id
  left join public.dabbir_appointments a on a.id=n.appointment_id and a.business_id=n.business_id
  left join public.dabbir_services s on s.id=a.service_id and s.business_id=n.business_id
  left join public.dabbir_workers w on w.id=a.worker_id and w.business_id=n.business_id
  where c.phone_e164 is not null;
end;
$function$;
revoke all on function public.dabbir_claim_workflow_notifications(integer) from public,anon,authenticated;
grant execute on function public.dabbir_claim_workflow_notifications(integer) to service_role;

create or replace function public.dabbir_finalize_workflow_notification_v2(
  p_notification_id uuid,p_status text,p_provider_message_id text default null,
  p_error text default null,p_retryable boolean default false
) returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_row public.dabbir_workflow_notifications%rowtype;
  v_state text;
  v_delay integer;
begin
  if p_status not in ('sent','failed','ambiguous') then raise exception 'INVALID_NOTIFICATION_FINAL_STATUS'; end if;
  select n.* into v_row from public.dabbir_workflow_notifications n
  where n.id=p_notification_id and n.status='processing' for update;
  if not found then return 'not_processing'; end if;

  if p_status='sent' then
    v_state:='sent';
    update public.dabbir_workflow_notifications n set status='sent',provider_message_id=left(nullif(p_provider_message_id,''),320),
      sent_at=now(),last_error=null,next_attempt_at=null,updated_at=now() where n.id=p_notification_id;
  elsif p_status='ambiguous' then
    v_state:='ambiguous';
    update public.dabbir_workflow_notifications n set status='ambiguous',last_error=left(nullif(p_error,''),500),
      next_attempt_at=null,updated_at=now() where n.id=p_notification_id;
  elsif coalesce(p_retryable,false) and v_row.attempts<v_row.max_attempts then
    v_state:='pending';
    v_delay:=least(1800,20*power(2,greatest(0,v_row.attempts-1))::integer);
    update public.dabbir_workflow_notifications n set status='pending',next_attempt_at=now()+make_interval(secs=>v_delay),
      last_error=left(nullif(p_error,''),500),updated_at=now() where n.id=p_notification_id;
  else
    v_state:='failed';
    update public.dabbir_workflow_notifications n set status='failed',last_error=left(nullif(p_error,''),500),
      next_attempt_at=null,updated_at=now() where n.id=p_notification_id;
  end if;

  insert into public.dabbir_workflow_audit(business_id,action,entity_type,entity_id,after_data)
  values(v_row.business_id,'notification.'||v_state,'workflow_notification',p_notification_id,
    jsonb_build_object('status',v_state,'provider_message_id',p_provider_message_id,'error',p_error,'attempts',v_row.attempts));
  return v_state;
end;
$function$;
revoke all on function public.dabbir_finalize_workflow_notification_v2(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.dabbir_finalize_workflow_notification_v2(uuid,text,text,text,boolean) to service_role;

create or replace function public.dabbir_finalize_workflow_notification(
  p_notification_id uuid,p_status text,p_provider_message_id text default null,p_error text default null
) returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare v_state text;
begin
  v_state:=public.dabbir_finalize_workflow_notification_v2(
    p_notification_id,p_status,p_provider_message_id,p_error,p_status='failed'
  );
  return v_state<>'not_processing';
end;
$function$;
revoke all on function public.dabbir_finalize_workflow_notification(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_finalize_workflow_notification(uuid,text,text,text) to service_role;

create or replace function public.dabbir_consume_rate_limit(
  p_action text,p_key_hash text,p_limit integer,p_window_seconds integer
) returns table(allowed boolean,remaining integer,retry_after integer)
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_action text:=left(trim(coalesce(p_action,'')),80);
  v_hash text:=lower(trim(coalesce(p_key_hash,'')));
  v_start timestamptz;
  v_expiry timestamptz;
  v_count integer;
begin
  if char_length(v_action)<2 or v_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_RATE_LIMIT_KEY'; end if;
  if p_limit<1 or p_limit>10000 or p_window_seconds<1 or p_window_seconds>86400 then raise exception 'INVALID_RATE_LIMIT_POLICY'; end if;
  v_start:=to_timestamp(floor(extract(epoch from clock_timestamp())/p_window_seconds)*p_window_seconds);
  v_expiry:=v_start+make_interval(secs=>p_window_seconds);
  insert into public.dabbir_rate_limit_windows(action,key_hash,window_started_at,request_count,expires_at)
  values(v_action,v_hash,v_start,1,v_expiry)
  on conflict (action,key_hash,window_started_at)
  do update set request_count=public.dabbir_rate_limit_windows.request_count+1,updated_at=now()
  returning request_count into v_count;
  return query select v_count<=p_limit,greatest(0,p_limit-v_count),greatest(1,ceil(extract(epoch from (v_expiry-clock_timestamp())))::integer);
end;
$function$;
revoke all on function public.dabbir_consume_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.dabbir_consume_rate_limit(text,text,integer,integer) to service_role;

create or replace function public.dabbir_cleanup_resilience_state()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare v_rate integer:=0;v_outbox integer:=0;
begin
  delete from public.dabbir_rate_limit_windows where expires_at<now()-interval '1 hour';
  get diagnostics v_rate=row_count;
  delete from public.dabbir_integration_outbox where status in ('succeeded','cancelled') and completed_at<now()-interval '30 days';
  get diagnostics v_outbox=row_count;
  return jsonb_build_object('rate_windows_deleted',v_rate,'outbox_jobs_deleted',v_outbox);
end;
$function$;
revoke all on function public.dabbir_cleanup_resilience_state() from public,anon,authenticated;
grant execute on function public.dabbir_cleanup_resilience_state() to service_role;

create or replace function public.dabbir_resilience_health_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog,dabbir_private,pg_temp
as $function$
declare
  v_conflict_guard boolean;
  v_recovery_guard boolean;
  v_notif_overdue bigint;
  v_notif_stale bigint;
  v_notif_bad bigint;
  v_outbox_due bigint;
  v_outbox_stale bigint;
  v_outbox_dead bigint;
  v_calendar_error bigint;
  v_payment_error bigint;
  v_core boolean;
begin
  select exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.dabbir_appointments'::regclass and t.tgname='dabbir_appointment_calendar_conflict_guard' and not t.tgisinternal) into v_conflict_guard;
  select exists(select 1 from dabbir_private.recovery_supported_tables r where r.table_name='dabbir_appointments' and r.journal_enabled and r.snapshot_enabled) into v_recovery_guard;
  select count(*) into v_notif_overdue from public.dabbir_workflow_notifications n where n.status='pending' and coalesce(n.next_attempt_at,n.scheduled_for)<now()-interval '10 minutes';
  select count(*) into v_notif_stale from public.dabbir_workflow_notifications n where n.status='processing' and n.updated_at<now()-interval '15 minutes';
  select count(*) into v_notif_bad from public.dabbir_workflow_notifications n where n.status in ('failed','ambiguous') and n.updated_at>now()-interval '1 hour';
  select count(*) into v_outbox_due from public.dabbir_integration_outbox o where o.status in ('pending','retry') and o.available_at<=now()-interval '5 minutes';
  select count(*) into v_outbox_stale from public.dabbir_integration_outbox o where o.status='processing' and o.locked_at<now()-interval '5 minutes';
  select count(*) into v_outbox_dead from public.dabbir_integration_outbox o where o.status='dead' and o.updated_at>now()-interval '24 hours';
  select count(*) into v_calendar_error from public.dabbir_calendar_connections c where c.sync_enabled=true and c.status='error';
  select count(*) into v_payment_error from public.dabbir_payment_events e where e.processing_error is not null and e.received_at>now()-interval '1 hour';
  v_core:=v_conflict_guard and v_recovery_guard;
  return jsonb_build_object(
    'core_ok',v_core,
    'state',case when not v_core then 'critical' when v_outbox_dead>0 or v_notif_stale>0 or v_outbox_stale>0 or v_payment_error>0 then 'degraded' else 'healthy' end,
    'booking_conflict_guard',v_conflict_guard,'recovery_guard',v_recovery_guard,
    'notification_overdue',v_notif_overdue,'notification_stale',v_notif_stale,'notification_failed_or_ambiguous_1h',v_notif_bad,
    'outbox_due',v_outbox_due,'outbox_stale',v_outbox_stale,'outbox_dead_24h',v_outbox_dead,
    'calendar_connections_error',v_calendar_error,'payment_processing_errors_1h',v_payment_error,
    'checked_at',now()
  );
end;
$function$;
revoke all on function public.dabbir_resilience_health_snapshot() from public,anon,authenticated;
grant execute on function public.dabbir_resilience_health_snapshot() to service_role;
