-- DABBIR worst-case booking resilience.
-- 1) A repeated booking command with the same idempotency key returns the same booking.
-- 2) Definitive notification failures retry with bounded backoff.
-- 3) Ambiguous provider outcomes never auto-retry, preventing duplicate customer messages.

alter table public.dabbir_appointments
  add column if not exists idempotency_key text,
  add column if not exists idempotency_fingerprint text;

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_idempotency_key_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_idempotency_key_check
  check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9:_-]{16,160}$');

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_idempotency_fingerprint_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_idempotency_fingerprint_check
  check (idempotency_fingerprint is null or idempotency_fingerprint ~ '^[0-9a-f]{32}$');

create unique index if not exists dabbir_appointments_business_idempotency_uq
  on public.dabbir_appointments(business_id,idempotency_key)
  where idempotency_key is not null;

create or replace function public.dabbir_salon_quick_book_idempotent(
  p_business_id uuid,
  p_customer_name text default '',
  p_customer_phone text default '',
  p_service_id uuid default null,
  p_worker_id uuid default null,
  p_starts_at timestamptz default null,
  p_discount_aed numeric default 0,
  p_notes text default '',
  p_source text default 'internal',
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_key text := trim(coalesce(p_idempotency_key,''));
  v_fingerprint text;
  v_existing public.dabbir_appointments%rowtype;
  v_result jsonb;
  v_appointment_id uuid;
begin
  if not dabbir_private.has_permission(p_business_id,'manage_appointments') then
    raise exception 'APPOINTMENT_MANAGEMENT_REQUIRED';
  end if;
  if v_key !~ '^[A-Za-z0-9:_-]{16,160}$' then
    raise exception 'VALID_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  -- Serialize the replay check with the same business-scoped lock used by the
  -- booking calendar. This closes the race where two identical requests arrive
  -- before either transaction commits.
  perform pg_advisory_xact_lock(hashtextextended('dabbir:booking-calendar:' || p_business_id::text,0));

  v_fingerprint := md5(jsonb_build_object(
    'customer_name',left(trim(coalesce(p_customer_name,'')),120),
    'customer_phone',trim(coalesce(p_customer_phone,'')),
    'service_id',p_service_id,
    'worker_id',p_worker_id,
    'starts_at',p_starts_at,
    'discount_aed',coalesce(p_discount_aed,0),
    'notes',left(coalesce(p_notes,''),2000),
    'source',coalesce(p_source,'internal')
  )::text);

  select a.* into v_existing
  from public.dabbir_appointments a
  where a.business_id=p_business_id and a.idempotency_key=v_key
  for update;

  if found then
    if v_existing.idempotency_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BOOKING';
    end if;
    return jsonb_build_object(
      'appointment_id',v_existing.id,
      'customer_id',v_existing.customer_id,
      'service_id',v_existing.service_id,
      'worker_id',v_existing.worker_id,
      'starts_at',v_existing.starts_at,
      'ends_at',v_existing.ends_at,
      'status',v_existing.status,
      'idempotency_key',v_key,
      'idempotent_replay',true
    );
  end if;

  v_result := public.dabbir_salon_quick_book(
    p_business_id,p_customer_name,p_customer_phone,p_service_id,p_worker_id,
    p_starts_at,p_discount_aed,p_notes,p_source
  );
  v_appointment_id := nullif(v_result->>'appointment_id','')::uuid;
  if v_appointment_id is null then raise exception 'BOOKING_IDEMPOTENCY_PERSIST_FAILED'; end if;

  update public.dabbir_appointments a
  set idempotency_key=v_key,idempotency_fingerprint=v_fingerprint,updated_at=now()
  where a.business_id=p_business_id and a.id=v_appointment_id;
  if not found then raise exception 'BOOKING_IDEMPOTENCY_PERSIST_FAILED'; end if;

  return v_result || jsonb_build_object('idempotency_key',v_key,'idempotent_replay',false);
end;
$$;

revoke all on function public.dabbir_salon_quick_book_idempotent(uuid,text,text,uuid,uuid,timestamptz,numeric,text,text,text) from public,anon;
grant execute on function public.dabbir_salon_quick_book_idempotent(uuid,text,text,uuid,uuid,timestamptz,numeric,text,text,text) to authenticated;

alter table public.dabbir_workflow_notifications
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

alter table public.dabbir_workflow_notifications
  drop constraint if exists dabbir_workflow_notifications_attempt_count_check;
alter table public.dabbir_workflow_notifications
  add constraint dabbir_workflow_notifications_attempt_count_check
  check (attempt_count between 0 and 20);

alter table public.dabbir_workflow_notifications
  drop constraint if exists dabbir_workflow_notifications_max_attempts_check;
alter table public.dabbir_workflow_notifications
  add constraint dabbir_workflow_notifications_max_attempts_check
  check (max_attempts between 1 and 20);

create index if not exists dabbir_workflow_notifications_retry_due_idx
  on public.dabbir_workflow_notifications(status,next_attempt_at,scheduled_for,business_id)
  where status='pending';

create or replace function public.dabbir_claim_workflow_notifications(p_limit integer default 25)
returns table(
  notification_id uuid,
  business_id uuid,
  appointment_id uuid,
  customer_id uuid,
  notification_type text,
  template_name text,
  template_language text,
  idempotency_key text,
  phone_e164 text,
  business_name text,
  timezone text,
  starts_at timestamptz,
  ends_at timestamptz,
  service_name_ar text,
  service_name_en text,
  worker_name text
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  -- If a worker disappeared after claiming an item, we cannot know whether Meta
  -- accepted the request. Fail closed: mark ambiguous and require reconciliation;
  -- never blindly send it a second time.
  update public.dabbir_workflow_notifications n
  set status='ambiguous',
      last_error='STALE_PROCESSING_REQUIRES_RECONCILIATION',
      processing_started_at=null,
      updated_at=now()
  where n.status='processing'
    and coalesce(n.processing_started_at,n.updated_at)<now()-interval '15 minutes';

  -- Do not deliver confirmations/reminders after the appointment has already begun.
  update public.dabbir_workflow_notifications n
  set status='cancelled',last_error='NOTIFICATION_EXPIRED_BEFORE_DELIVERY',updated_at=now()
  from public.dabbir_appointments a
  where n.status='pending'
    and n.appointment_id=a.id
    and n.business_id=a.business_id
    and n.notification_type in ('booking_confirmation','reminder_24h','reminder_2h','appointment_changed')
    and a.starts_at is not null
    and a.starts_at<=now();

  return query
  with candidates as (
    select n.id
    from public.dabbir_workflow_notifications n
    where n.status='pending'
      and coalesce(n.next_attempt_at,n.scheduled_for)<=now()
      and n.scheduled_for>now()-interval '2 days'
      and n.attempt_count<n.max_attempts
    order by coalesce(n.next_attempt_at,n.scheduled_for),n.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  ), claimed as (
    update public.dabbir_workflow_notifications n
    set status='processing',
        processing_started_at=now(),
        attempt_count=n.attempt_count+1,
        updated_at=now(),
        last_error=null
    from candidates c
    where n.id=c.id
    returning n.*
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
$$;

create or replace function public.dabbir_finalize_workflow_notification(
  p_notification_id uuid,p_status text,p_provider_message_id text default null,p_error text default null
) returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.dabbir_workflow_notifications%rowtype;
  v_effective_status text;
  v_delay interval;
begin
  if p_status not in ('sent','failed','ambiguous') then raise exception 'INVALID_NOTIFICATION_FINAL_STATUS'; end if;

  select n.* into v_row
  from public.dabbir_workflow_notifications n
  where n.id=p_notification_id and n.status='processing'
  for update;
  if not found then return false; end if;

  if p_status='sent' then
    update public.dabbir_workflow_notifications n
    set status='sent',
        provider_message_id=left(nullif(p_provider_message_id,''),320),
        sent_at=now(),next_attempt_at=null,processing_started_at=null,
        dead_lettered_at=null,last_error=null,updated_at=now()
    where n.id=p_notification_id;
    v_effective_status:='sent';
  elsif p_status='ambiguous' then
    update public.dabbir_workflow_notifications n
    set status='ambiguous',
        provider_message_id=left(nullif(p_provider_message_id,''),320),
        next_attempt_at=null,processing_started_at=null,
        last_error=left(nullif(p_error,''),500),updated_at=now()
    where n.id=p_notification_id;
    v_effective_status:='ambiguous';
  elsif v_row.attempt_count<v_row.max_attempts then
    v_delay := case
      when v_row.attempt_count<=1 then interval '5 minutes'
      when v_row.attempt_count=2 then interval '15 minutes'
      when v_row.attempt_count=3 then interval '1 hour'
      else interval '6 hours'
    end;
    update public.dabbir_workflow_notifications n
    set status='pending',
        provider_message_id=null,
        next_attempt_at=now()+v_delay,
        processing_started_at=null,
        last_error=left(nullif(p_error,''),500),updated_at=now()
    where n.id=p_notification_id;
    v_effective_status:='retry_scheduled';
  else
    update public.dabbir_workflow_notifications n
    set status='failed',
        provider_message_id=left(nullif(p_provider_message_id,''),320),
        next_attempt_at=null,processing_started_at=null,
        dead_lettered_at=now(),last_error=left(nullif(p_error,''),500),updated_at=now()
    where n.id=p_notification_id;
    v_effective_status:='failed';
  end if;

  insert into public.dabbir_workflow_audit(business_id,action,entity_type,entity_id,after_data)
  values(v_row.business_id,'notification.'||v_effective_status,'workflow_notification',p_notification_id,
    jsonb_build_object(
      'requested_status',p_status,
      'effective_status',v_effective_status,
      'attempt_count',v_row.attempt_count,
      'max_attempts',v_row.max_attempts,
      'provider_message_id',p_provider_message_id,
      'error',p_error
    ));
  return true;
end;
$$;

revoke all on function public.dabbir_claim_workflow_notifications(integer) from public,anon,authenticated;
revoke all on function public.dabbir_finalize_workflow_notification(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_claim_workflow_notifications(integer) to service_role;
grant execute on function public.dabbir_finalize_workflow_notification(uuid,text,text,text) to service_role;
