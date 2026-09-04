-- DABBIR mobile car-wash Killer Job P0.
-- PRODUCTION GATE: this migration is intentionally committed but must not be applied until
-- schema-only/function/policy/trigger backups, checksums and restore verification are approved.
-- It extends the existing booking, appointment, WhatsApp and outcome infrastructure.

alter table public.dabbir_car_wash_settings
  add column if not exists operator_mode text not null default 'shadow',
  add column if not exists shadow_started_at timestamptz not null default now(),
  add column if not exists kill_switch boolean not null default false,
  add column if not exists operator_permissions jsonb not null default '{"READ":true,"MESSAGE":false,"QUOTE":true,"BOOK":false,"ASSIGN":false,"REMIND":false,"CHARGE":false}'::jsonb,
  add column if not exists confidence_threshold numeric(4,3) not null default 0.900,
  add column if not exists service_areas jsonb not null default '[]'::jsonb,
  add column if not exists default_travel_minutes integer not null default 20,
  add column if not exists max_concurrent_bookings integer not null default 1,
  add column if not exists max_quote_aed numeric(10,2) not null default 1000,
  add column if not exists max_discount_pct numeric(5,2) not null default 0,
  add column if not exists max_messages_per_inquiry integer not null default 6,
  add column if not exists ai_target_monthly_aed numeric(8,2) not null default 30,
  add column if not exists ai_hard_cap_monthly_aed numeric(8,2) not null default 60,
  add column if not exists ai_usage_month_aed numeric(8,2) not null default 0;

alter table public.dabbir_car_wash_settings
  drop constraint if exists dabbir_car_wash_settings_operator_mode_check,
  drop constraint if exists dabbir_car_wash_settings_confidence_check,
  drop constraint if exists dabbir_car_wash_settings_travel_check,
  drop constraint if exists dabbir_car_wash_settings_concurrency_check,
  drop constraint if exists dabbir_car_wash_settings_commercial_limits_check,
  drop constraint if exists dabbir_car_wash_settings_ai_cost_check,
  drop constraint if exists dabbir_car_wash_settings_json_policy_check,
  add constraint dabbir_car_wash_settings_operator_mode_check check (operator_mode in ('shadow','controlled_live','paused')),
  add constraint dabbir_car_wash_settings_confidence_check check (confidence_threshold between 0.500 and 1.000),
  add constraint dabbir_car_wash_settings_travel_check check (default_travel_minutes between 0 and 180),
  add constraint dabbir_car_wash_settings_concurrency_check check (max_concurrent_bookings between 1 and 15),
  add constraint dabbir_car_wash_settings_commercial_limits_check check (max_quote_aed between 0 and 100000 and max_discount_pct between 0 and 100 and max_messages_per_inquiry between 1 and 20),
  add constraint dabbir_car_wash_settings_json_policy_check check (
    jsonb_typeof(operator_permissions)='object'
    and operator_permissions ?& array['READ','MESSAGE','QUOTE','BOOK','ASSIGN','REMIND','CHARGE']
    and jsonb_typeof(operator_permissions->'READ')='boolean'
    and jsonb_typeof(operator_permissions->'MESSAGE')='boolean'
    and jsonb_typeof(operator_permissions->'QUOTE')='boolean'
    and jsonb_typeof(operator_permissions->'BOOK')='boolean'
    and jsonb_typeof(operator_permissions->'ASSIGN')='boolean'
    and jsonb_typeof(operator_permissions->'REMIND')='boolean'
    and jsonb_typeof(operator_permissions->'CHARGE')='boolean'
    and jsonb_typeof(service_areas)='array'
  ),
  add constraint dabbir_car_wash_settings_ai_cost_check check (
    ai_target_monthly_aed between 0 and 30
    and ai_hard_cap_monthly_aed between 1 and 60
    and ai_target_monthly_aed <= ai_hard_cap_monthly_aed
    and ai_usage_month_aed >= 0
  );

create or replace function dabbir_private.car_wash_settings_mode_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.operator_mode='controlled_live' and old.operator_mode is distinct from 'controlled_live'
    and (old.shadow_started_at is null or old.shadow_started_at>now()-interval '48 hours')
  then raise exception 'CAR_WASH_SHADOW_48_HOURS_REQUIRED'; end if;
  if new.operator_mode='shadow' and old.operator_mode is distinct from 'shadow' then new.shadow_started_at:=now(); end if;
  if new.operator_mode<>'controlled_live' then
    new.operator_permissions:=new.operator_permissions||'{"MESSAGE":false,"BOOK":false,"ASSIGN":false,"REMIND":false,"CHARGE":false}'::jsonb;
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.car_wash_settings_mode_guard() from public,anon,authenticated;
drop trigger if exists dabbir_car_wash_settings_mode_guard on public.dabbir_car_wash_settings;
create trigger dabbir_car_wash_settings_mode_guard before update of operator_mode,operator_permissions
on public.dabbir_car_wash_settings for each row execute function dabbir_private.car_wash_settings_mode_guard();

alter table public.dabbir_car_wash_booking_requests
  add column if not exists ends_at timestamptz,
  add column if not exists branch_id uuid references public.dabbir_business_branches(id) on delete set null,
  add column if not exists assigned_worker_id uuid references public.dabbir_workers(id) on delete set null,
  add column if not exists appointment_id uuid references public.dabbir_appointments(id) on delete set null,
  add column if not exists conversation_id uuid references public.dabbir_conversations(id) on delete set null,
  add column if not exists idempotency_key text,
  add column if not exists failure_reason text;

alter table public.dabbir_car_wash_booking_requests alter column location_lat drop not null;
alter table public.dabbir_car_wash_booking_requests alter column location_lng drop not null;
alter table public.dabbir_car_wash_booking_requests
  drop constraint if exists dabbir_car_wash_booking_requests_source_check;
alter table public.dabbir_car_wash_booking_requests
  add constraint dabbir_car_wash_booking_requests_source_check
  check (source in ('public_booking','operations','recurring','whatsapp','demo'));
alter table public.dabbir_car_wash_booking_requests
  drop constraint if exists dabbir_car_wash_booking_request_time_check;
alter table public.dabbir_car_wash_booking_requests
  add constraint dabbir_car_wash_booking_request_time_check check (ends_at is null or ends_at > starts_at);
create unique index if not exists dabbir_car_wash_booking_idempotency_uq
  on public.dabbir_car_wash_booking_requests(business_id,idempotency_key)
  where idempotency_key is not null;
create index if not exists dabbir_car_wash_booking_capacity_idx
  on public.dabbir_car_wash_booking_requests(business_id,branch_id,assigned_worker_id,starts_at,ends_at)
  where status in ('new','confirmed','en_route','arrived','washing');

create table if not exists public.dabbir_car_wash_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  customer_id uuid references public.dabbir_customers(id) on delete set null,
  conversation_id uuid references public.dabbir_conversations(id) on delete set null,
  booking_request_id uuid references public.dabbir_car_wash_booking_requests(id) on delete set null,
  appointment_id uuid references public.dabbir_appointments(id) on delete set null,
  assigned_worker_id uuid references public.dabbir_workers(id) on delete set null,
  state text not null default 'inquiry' check (state in ('inquiry','qualified','offered','confirmed','assigned','reminded','completed','paid','lost')),
  source text not null check (source in ('whatsapp','public_booking','operations','recurring','demo')),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 180),
  signal jsonb not null default '{}'::jsonb,
  extracted jsonb not null default '{}'::jsonb,
  extraction_confidence numeric(4,3) not null default 0 check (extraction_confidence between 0 and 1),
  operator_mode text not null default 'shadow' check (operator_mode in ('shadow','controlled_live','paused','demo')),
  booking_value numeric(12,2) not null default 0 check (booking_value >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  currency_code text not null default 'AED' check (currency_code ~ '^[A-Z]{3}$'),
  lost_reason text,
  reminder_due_at timestamptz,
  reminder_state text not null default 'not_due' check (reminder_state in ('not_due','pending','leased','accepted','delivered','failed','ambiguous','cancelled')),
  reminder_lock_token uuid,
  reminder_locked_until timestamptz,
  reminder_attempt_count integer not null default 0 check (reminder_attempt_count between 0 and 5),
  reminder_provider_message_id text,
  last_failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (business_id,idempotency_key),
  unique (business_id,booking_request_id)
);

create table if not exists public.dabbir_car_wash_job_transitions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  job_id uuid not null references public.dabbir_car_wash_jobs(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 180),
  from_state text,
  to_state text not null check (to_state in ('inquiry','qualified','offered','confirmed','assigned','reminded','completed','paid','lost')),
  actor_type text not null check (actor_type in ('human','rule','ai','provider')),
  actor_user_id uuid references auth.users(id) on delete set null,
  owner_override boolean not null default false,
  permission_used text check (permission_used is null or permission_used in ('READ','MESSAGE','QUOTE','BOOK','ASSIGN','REMIND','CHARGE')),
  decision jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  action jsonb not null default '{}'::jsonb,
  external_result jsonb not null default '{}'::jsonb,
  failure_reason text,
  compensation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (business_id,idempotency_key)
);

create table if not exists public.dabbir_car_wash_outcome_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 200),
  job_id uuid not null references public.dabbir_car_wash_jobs(id) on delete cascade,
  transition_id uuid references public.dabbir_car_wash_job_transitions(id) on delete set null,
  customer_id uuid references public.dabbir_customers(id) on delete set null,
  conversation_id uuid references public.dabbir_conversations(id) on delete set null,
  booking_request_id uuid references public.dabbir_car_wash_booking_requests(id) on delete set null,
  action_type text not null,
  actor_type text not null check (actor_type in ('human','rule','ai','provider')),
  permission_used text,
  requested_result jsonb not null default '{}'::jsonb,
  verified_result jsonb not null default '{}'::jsonb,
  status text not null check (status in ('PENDING','VERIFIED','FAILED','UNKNOWN')),
  failure_reason text,
  booking_value numeric(12,2) not null default 0 check (booking_value >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  estimated_revenue numeric(12,2) not null default 0 check (estimated_revenue >= 0),
  verified_revenue numeric(12,2) not null default 0 check (verified_revenue >= 0),
  recovered_revenue numeric(12,2) not null default 0 check (recovered_revenue >= 0),
  lost_revenue numeric(12,2) not null default 0 check (lost_revenue >= 0),
  attribution_source text not null default 'none',
  evidence_reference text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (business_id,idempotency_key)
);

create index if not exists dabbir_car_wash_jobs_owner_idx on public.dabbir_car_wash_jobs(business_id,state,updated_at desc);
create index if not exists dabbir_car_wash_jobs_reminder_idx on public.dabbir_car_wash_jobs(reminder_due_at,reminder_state) where reminder_state in ('pending','leased');
create index if not exists dabbir_car_wash_transitions_job_idx on public.dabbir_car_wash_job_transitions(business_id,job_id,created_at);
create index if not exists dabbir_car_wash_outcomes_owner_idx on public.dabbir_car_wash_outcome_ledger(business_id,created_at desc);

alter table public.dabbir_car_wash_jobs enable row level security;
alter table public.dabbir_car_wash_job_transitions enable row level security;
alter table public.dabbir_car_wash_outcome_ledger enable row level security;
alter table public.dabbir_car_wash_jobs force row level security;
alter table public.dabbir_car_wash_job_transitions force row level security;
alter table public.dabbir_car_wash_outcome_ledger force row level security;

revoke all on public.dabbir_car_wash_jobs, public.dabbir_car_wash_job_transitions, public.dabbir_car_wash_outcome_ledger from public,anon,authenticated;
grant select on public.dabbir_car_wash_jobs, public.dabbir_car_wash_job_transitions to authenticated;
grant select on public.dabbir_car_wash_outcome_ledger to authenticated;

create policy dabbir_car_wash_jobs_member_select on public.dabbir_car_wash_jobs
for select to authenticated using (dabbir_private.has_permission(business_id,'view_business'));
create policy dabbir_car_wash_transitions_member_select on public.dabbir_car_wash_job_transitions
for select to authenticated using (dabbir_private.has_permission(business_id,'view_business'));
create policy dabbir_car_wash_outcomes_member_select on public.dabbir_car_wash_outcome_ledger
for select to authenticated using (dabbir_private.has_permission(business_id,'view_analytics'));

create or replace function dabbir_private.car_wash_transition_allowed(p_from text,p_to text)
returns boolean language sql immutable set search_path='' as $$
  select case p_from
    when 'inquiry' then p_to in ('qualified','lost')
    when 'qualified' then p_to in ('offered','lost')
    when 'offered' then p_to in ('confirmed','lost')
    when 'confirmed' then p_to in ('assigned','lost')
    when 'assigned' then p_to in ('reminded','completed','lost')
    when 'reminded' then p_to in ('completed','lost')
    when 'completed' then p_to='paid'
    else false
  end;
$$;
revoke all on function dabbir_private.car_wash_transition_allowed(text,text) from public,anon,authenticated;

create or replace function dabbir_private.car_wash_capacity_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_duration integer;
  v_travel integer;
  v_max integer;
  v_active_workers integer;
  v_overlap_count integer;
  v_worker_id uuid;
begin
  if new.status not in ('new','confirmed','en_route','arrived','washing') then return new; end if;
  select o.duration_minutes into v_duration from public.dabbir_car_wash_offers o where o.id=new.offer_id and o.business_id=new.business_id;
  if v_duration is null then raise exception 'CAR_WASH_OFFER_NOT_IN_BUSINESS'; end if;
  new.ends_at:=coalesce(new.ends_at,new.starts_at+make_interval(mins=>v_duration));
  perform pg_advisory_xact_lock(hashtextextended('dabbir:car-wash-capacity:'||new.business_id::text,0));
  select greatest(1,s.max_concurrent_bookings),greatest(0,s.default_travel_minutes) into v_max,v_travel from public.dabbir_car_wash_settings s where s.business_id=new.business_id;
  select count(*) into v_active_workers from public.dabbir_workers w
  where w.business_id=new.business_id and w.status='active'
    and (
      new.branch_id is null
      or exists(
        select 1 from public.dabbir_worker_branches wb
        where wb.business_id=new.business_id and wb.branch_id=new.branch_id and wb.worker_id=w.id and wb.active
      )
    );
  if v_active_workers>0 and new.assigned_worker_id is null then
    select w.id into v_worker_id from public.dabbir_workers w
    where w.business_id=new.business_id and w.status='active'
      and (
        new.branch_id is null
        or exists(
          select 1 from public.dabbir_worker_branches wb
          where wb.business_id=new.business_id and wb.branch_id=new.branch_id and wb.worker_id=w.id and wb.active
        )
      )
      and not exists(
        select 1 from public.dabbir_car_wash_booking_requests r
        where r.business_id=new.business_id and (r.branch_id is null or new.branch_id is null or r.branch_id=new.branch_id) and r.assigned_worker_id=w.id
          and r.status in ('new','confirmed','en_route','arrived','washing')
          and r.starts_at<new.ends_at+make_interval(mins=>coalesce(v_travel,0))
          and coalesce(r.ends_at,r.starts_at+interval '60 minutes')+make_interval(mins=>coalesce(v_travel,0))>new.starts_at
      )
    order by w.display_name,w.id limit 1;
    if v_worker_id is null then raise exception 'CAR_WASH_CREW_REQUIRED'; end if;
    new.assigned_worker_id:=v_worker_id;
  end if;
  if new.assigned_worker_id is not null and not exists(select 1 from public.dabbir_workers w where w.id=new.assigned_worker_id and w.business_id=new.business_id and w.status='active') then raise exception 'CAR_WASH_CREW_NOT_IN_BUSINESS'; end if;
  if new.assigned_worker_id is not null and new.branch_id is not null and not exists(
    select 1 from public.dabbir_worker_branches wb
    where wb.business_id=new.business_id and wb.branch_id=new.branch_id and wb.worker_id=new.assigned_worker_id and wb.active
  ) then raise exception 'CAR_WASH_CREW_NOT_IN_BRANCH'; end if;
  if new.assigned_worker_id is not null and exists(
    select 1 from public.dabbir_car_wash_booking_requests r
    where r.business_id=new.business_id and (r.branch_id is null or new.branch_id is null or r.branch_id=new.branch_id) and r.id<>coalesce(new.id,gen_random_uuid())
      and r.assigned_worker_id=new.assigned_worker_id and r.status in ('new','confirmed','en_route','arrived','washing')
      and r.starts_at<new.ends_at+make_interval(mins=>coalesce(v_travel,0))
      and coalesce(r.ends_at,r.starts_at+interval '60 minutes')+make_interval(mins=>coalesce(v_travel,0))>new.starts_at
  ) then raise exception 'CAR_WASH_CREW_DOUBLE_BOOKED'; end if;
  select count(*) into v_overlap_count from public.dabbir_car_wash_booking_requests r
  where r.business_id=new.business_id and (r.branch_id is null or new.branch_id is null or r.branch_id=new.branch_id) and r.id<>coalesce(new.id,gen_random_uuid())
    and r.status in ('new','confirmed','en_route','arrived','washing')
    and r.starts_at<new.ends_at+make_interval(mins=>coalesce(v_travel,0))
    and coalesce(r.ends_at,r.starts_at+interval '60 minutes')+make_interval(mins=>coalesce(v_travel,0))>new.starts_at;
  if v_overlap_count>=coalesce(v_max,1) then raise exception 'CAR_WASH_CAPACITY_FULL'; end if;
  return new;
end;
$$;
revoke all on function dabbir_private.car_wash_capacity_guard() from public,anon,authenticated;
drop trigger if exists dabbir_00_car_wash_capacity_guard on public.dabbir_car_wash_booking_requests;
create trigger dabbir_00_car_wash_capacity_guard before insert or update of starts_at,ends_at,assigned_worker_id,status,offer_id
on public.dabbir_car_wash_booking_requests for each row execute function dabbir_private.car_wash_capacity_guard();

create or replace function dabbir_private.car_wash_booking_job_sync()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_job_state text;v_job_id uuid;v_mode text;v_currency text;
begin
  v_job_state:=case new.status when 'paid' then 'paid' when 'completed' then 'completed' when 'cancelled' then 'lost' when 'declined' then 'lost' when 'confirmed' then case when new.assigned_worker_id is null then 'confirmed' else 'assigned' end else 'inquiry' end;
  select s.operator_mode into v_mode from public.dabbir_car_wash_settings s where s.business_id=new.business_id;
  select b.currency_code into v_currency from public.dabbir_businesses b where b.id=new.business_id;
  insert into public.dabbir_car_wash_jobs(
    business_id,customer_id,conversation_id,booking_request_id,appointment_id,assigned_worker_id,state,source,idempotency_key,
    signal,extracted,extraction_confidence,operator_mode,booking_value,currency_code,lost_reason,reminder_due_at,reminder_state
  ) values(
    new.business_id,new.customer_id,new.conversation_id,new.id,new.appointment_id,new.assigned_worker_id,v_job_state,new.source,
    coalesce(new.idempotency_key,'booking:'||new.id::text),
    jsonb_build_object('source',new.source,'booking_request_id',new.id),
    jsonb_build_object('vehicle_type',new.vehicle_type,'location_label',new.location_label,'offer_id',new.offer_id,'starts_at',new.starts_at),
    case when new.source='whatsapp' then 0.9 else 1 end,coalesce(v_mode,'shadow'),coalesce(new.quoted_price_amount,new.quoted_price_aed,0),coalesce(v_currency,new.currency_code,'AED'),
    case when v_job_state='lost' then coalesce(nullif(new.failure_reason,''),lower(new.status)) else null end,
    case when v_job_state in ('confirmed','assigned') then new.starts_at-interval '2 hours' else null end,
    case when v_job_state in ('confirmed','assigned') then 'pending' else 'not_due' end
  ) on conflict (business_id,idempotency_key) do update set
    customer_id=excluded.customer_id,conversation_id=excluded.conversation_id,booking_request_id=excluded.booking_request_id,
    appointment_id=excluded.appointment_id,assigned_worker_id=excluded.assigned_worker_id,
    booking_value=excluded.booking_value,updated_at=now()
  returning id into v_job_id;
  return new;
end;
$$;
revoke all on function dabbir_private.car_wash_booking_job_sync() from public,anon,authenticated;
drop trigger if exists dabbir_car_wash_booking_job_sync on public.dabbir_car_wash_booking_requests;
create trigger dabbir_car_wash_booking_job_sync after insert or update of assigned_worker_id,appointment_id,customer_id,conversation_id,quoted_price_amount,quoted_price_aed
on public.dabbir_car_wash_booking_requests for each row execute function dabbir_private.car_wash_booking_job_sync();

insert into public.dabbir_car_wash_jobs(
  business_id,customer_id,conversation_id,booking_request_id,appointment_id,assigned_worker_id,state,source,idempotency_key,
  signal,extracted,extraction_confidence,operator_mode,booking_value,currency_code,lost_reason,reminder_due_at,reminder_state
)
select
  r.business_id,r.customer_id,r.conversation_id,r.id,r.appointment_id,r.assigned_worker_id,
  case r.status when 'paid' then 'paid' when 'completed' then 'completed' when 'cancelled' then 'lost' when 'declined' then 'lost' when 'confirmed' then case when r.assigned_worker_id is null then 'confirmed' else 'assigned' end else 'inquiry' end,
  r.source,'booking:'||r.id::text,jsonb_build_object('source',r.source,'booking_request_id',r.id),
  jsonb_build_object('vehicle_type',r.vehicle_type,'location_label',r.location_label,'offer_id',r.offer_id,'starts_at',r.starts_at),
  case when r.source='whatsapp' then 0.9 else 1 end,coalesce(s.operator_mode,'shadow'),coalesce(r.quoted_price_amount,r.quoted_price_aed,0),coalesce(b.currency_code,r.currency_code,'AED'),
  case when r.status in ('cancelled','declined') then coalesce(nullif(r.failure_reason,''),lower(r.status)) else null end,
  case when r.status='confirmed' then r.starts_at-interval '2 hours' else null end,
  case when r.status='confirmed' then 'pending' else 'not_due' end
from public.dabbir_car_wash_booking_requests r
join public.dabbir_businesses b on b.id=r.business_id
left join public.dabbir_car_wash_settings s on s.business_id=r.business_id
where not exists(select 1 from public.dabbir_car_wash_jobs j where j.business_id=r.business_id and j.booking_request_id=r.id)
on conflict (business_id,booking_request_id) do nothing;

create or replace function public.dabbir_car_wash_transition_job(
  p_business_id uuid,
  p_job_id uuid,
  p_to_state text,
  p_actor_type text,
  p_idempotency_key text,
  p_permission_used text default null,
  p_reason text default null,
  p_decision jsonb default '{}'::jsonb,
  p_evidence jsonb default '{}'::jsonb,
  p_action jsonb default '{}'::jsonb,
  p_external_result jsonb default '{}'::jsonb,
  p_owner_override boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.dabbir_car_wash_jobs%rowtype;
  v_settings public.dabbir_car_wash_settings%rowtype;
  v_existing public.dabbir_car_wash_job_transitions%rowtype;
  v_transition_id uuid;
  v_required text;
  v_actor text:=lower(trim(coalesce(p_actor_type,'')));
  v_to text:=lower(trim(coalesce(p_to_state,'')));
  v_reason text:=left(trim(coalesce(p_reason,'')),500);
  v_paid numeric:=0;
  v_verified numeric:=0;
  v_recovered numeric:=0;
  v_lost numeric:=0;
  v_attribution text:='none';
begin
  if coalesce(auth.role(),'')<>'service_role' and not dabbir_private.has_permission(p_business_id,'manage_appointments') then raise exception 'CAR_WASH_TRANSITION_FORBIDDEN'; end if;
  if v_actor not in ('human','rule','ai','provider') then raise exception 'CAR_WASH_ACTOR_INVALID'; end if;
  if coalesce(auth.role(),'')<>'service_role' and v_actor<>'human' then raise exception 'CAR_WASH_SYSTEM_ACTOR_FORBIDDEN'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 16 and 180 then raise exception 'CAR_WASH_IDEMPOTENCY_REQUIRED'; end if;
  select * into v_existing from public.dabbir_car_wash_job_transitions t where t.business_id=p_business_id and t.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.job_id<>p_job_id or v_existing.to_state<>v_to then raise exception 'CAR_WASH_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('ok',true,'replay',true,'transition_id',v_existing.id,'job_id',v_existing.job_id,'state',v_existing.to_state);
  end if;
  select * into v_job from public.dabbir_car_wash_jobs j where j.id=p_job_id and j.business_id=p_business_id for update;
  if not found then raise exception 'CAR_WASH_JOB_NOT_FOUND'; end if;
  select * into v_settings from public.dabbir_car_wash_settings s where s.business_id=p_business_id;
  if not found then raise exception 'CAR_WASH_SETTINGS_REQUIRED'; end if;
  if v_job.state=v_to then return jsonb_build_object('ok',true,'replay',true,'job_id',v_job.id,'state',v_job.state); end if;
  if p_owner_override then
    if v_actor<>'human' or coalesce(auth.role(),'')='service_role' or char_length(v_reason)<3 then raise exception 'OWNER_OVERRIDE_REASON_REQUIRED'; end if;
  elsif not dabbir_private.car_wash_transition_allowed(v_job.state,v_to) then raise exception 'ILLEGAL_CAR_WASH_TRANSITION'; end if;
  if v_settings.kill_switch and v_actor in ('rule','ai') then raise exception 'CAR_WASH_KILL_SWITCH_ACTIVE'; end if;
  if v_settings.operator_mode='paused' and v_actor in ('rule','ai') then raise exception 'CAR_WASH_OPERATOR_PAUSED'; end if;
  if v_settings.operator_mode='shadow' and v_actor in ('rule','ai') and v_to in ('confirmed','assigned','reminded','completed','paid') then raise exception 'SHADOW_MODE_NO_EXTERNAL_ACTION'; end if;
  v_required:=case v_to when 'qualified' then 'READ' when 'offered' then 'QUOTE' when 'confirmed' then 'BOOK' when 'assigned' then 'ASSIGN' when 'reminded' then 'REMIND' when 'paid' then 'CHARGE' else null end;
  if v_actor in ('rule','ai') and v_required is not null and coalesce((v_settings.operator_permissions->>v_required)::boolean,false) is not true then raise exception 'CAR_WASH_PERMISSION_REQUIRED:%',v_required; end if;
  if v_actor='ai' and v_job.extraction_confidence<v_settings.confidence_threshold then raise exception 'LOW_CONFIDENCE_HUMAN_ESCALATION'; end if;
  if v_to='lost' and char_length(v_reason)<3 then raise exception 'CAR_WASH_LOST_REASON_REQUIRED'; end if;
  if v_to='completed' and coalesce((p_evidence->>'service_completed')::boolean,false) is not true then raise exception 'VERIFIED_SERVICE_COMPLETION_REQUIRED'; end if;
  if v_to='paid' then
    if coalesce((p_evidence->>'payment_event_verified')::boolean,false) is not true then raise exception 'VERIFIED_PAYMENT_EVIDENCE_REQUIRED'; end if;
    v_paid:=greatest(0,coalesce((p_evidence->>'amount_paid')::numeric,0));
    if v_paid<=0 then raise exception 'VERIFIED_PAYMENT_AMOUNT_REQUIRED'; end if;
    v_verified:=v_paid;
    if p_evidence->>'attribution'='recovered_after_followup' then v_recovered:=v_paid;v_attribution:='recovered_after_followup';else v_attribution:='verified_payment_event';end if;
  elsif v_to='lost' then v_lost:=v_job.booking_value;v_attribution:='closed_with_documented_loss_reason';
  elsif v_to in ('offered','confirmed','assigned','reminded','completed') then v_attribution:='booking_value_not_payment'; end if;
  insert into public.dabbir_car_wash_job_transitions(
    business_id,job_id,idempotency_key,from_state,to_state,actor_type,actor_user_id,owner_override,permission_used,
    decision,evidence,action,external_result,failure_reason,compensation
  ) values(
    p_business_id,p_job_id,p_idempotency_key,v_job.state,v_to,v_actor,case when v_actor='human' then auth.uid() else null end,
    p_owner_override,coalesce(p_permission_used,v_required),coalesce(p_decision,'{}'),coalesce(p_evidence,'{}'),coalesce(p_action,'{}'),
    coalesce(p_external_result,'{}'),case when v_to='lost' then v_reason else null end,
    case when v_to in ('confirmed','assigned','reminded') then jsonb_build_object('supported',true,'action','cancel_or_reassign') else '{}'::jsonb end
  ) returning id into v_transition_id;
  update public.dabbir_car_wash_jobs set
    state=v_to,lost_reason=case when v_to='lost' then v_reason else lost_reason end,
    amount_paid=case when v_to='paid' then v_paid else amount_paid end,
    completed_at=case when v_to in ('paid','lost') then now() else completed_at end,
    updated_at=now(),last_failure_reason=null
  where id=p_job_id and business_id=p_business_id;
  update public.dabbir_car_wash_booking_requests set
    status=case v_to
      when 'confirmed' then 'confirmed'
      when 'assigned' then 'confirmed'
      when 'reminded' then 'confirmed'
      when 'completed' then 'completed'
      when 'paid' then 'paid'
      when 'lost' then 'cancelled'
      else status
    end,
    failure_reason=case when v_to='lost' then v_reason else failure_reason end,
    updated_at=now()
  where id=v_job.booking_request_id and business_id=p_business_id;
  update public.dabbir_appointments set
    status=case when v_to in ('confirmed','assigned','reminded') then 'confirmed' when v_to in ('completed','paid') then 'completed' when v_to='lost' then 'cancelled' else status end,
    payment_status=case when v_to='paid' then 'paid' else payment_status end,
    updated_at=now()
  where id=v_job.appointment_id and business_id=p_business_id;
  insert into public.dabbir_car_wash_outcome_ledger(
    business_id,idempotency_key,job_id,transition_id,customer_id,conversation_id,booking_request_id,action_type,actor_type,permission_used,
    requested_result,verified_result,status,booking_value,amount_paid,estimated_revenue,verified_revenue,recovered_revenue,lost_revenue,
    attribution_source,evidence_reference,verified_at
  ) values(
    p_business_id,left('state:'||p_idempotency_key,200),p_job_id,v_transition_id,v_job.customer_id,v_job.conversation_id,v_job.booking_request_id,'state.'||v_to,v_actor,coalesce(p_permission_used,v_required),
    jsonb_build_object('from',v_job.state,'to',v_to),coalesce(p_external_result,'{}'),'VERIFIED',v_job.booking_value,v_paid,
    case when v_to in ('offered','confirmed','assigned','reminded','completed') then v_job.booking_value else 0 end,v_verified,v_recovered,v_lost,
    v_attribution,nullif(p_evidence->>'reference',''),now()
  );
  insert into public.dabbir_operation_outcomes(
    business_id,operation_key,correlation_id,operation_type,outcome,failure_class,safe_eligible,autonomous,
    estimated_manual_seconds,duration_ms,cost_microusd,source,metadata,started_at,completed_at
  ) values(
    p_business_id,'car-wash-transition:'||p_idempotency_key,'car-wash-job:'||p_job_id::text,'car_wash.job.transition','VERIFIED_SUCCESS',null,
    v_to not in ('paid'),v_actor in ('rule','ai'),60,null,0,'car_wash_killer_job_v1',
    jsonb_build_object('job_id',p_job_id,'transition_id',v_transition_id,'from',v_job.state,'to',v_to,'permission',coalesce(p_permission_used,v_required),'owner_override',p_owner_override),now(),now()
  ) on conflict (business_id,operation_key) do nothing;
  return jsonb_build_object('ok',true,'replay',false,'transition_id',v_transition_id,'job_id',p_job_id,'state',v_to,'classification',jsonb_build_object('estimated',case when v_to in ('offered','confirmed','assigned','reminded','completed') then v_job.booking_value else 0 end,'verified',v_verified,'recovered',v_recovered,'lost',v_lost));
end;
$$;
revoke all on function public.dabbir_car_wash_transition_job(uuid,uuid,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.dabbir_car_wash_transition_job(uuid,uuid,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,boolean) to authenticated,service_role;

create or replace function public.dabbir_car_wash_whatsapp_context(p_business_id uuid,p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path=''
as $$
declare v_business public.dabbir_businesses%rowtype;v_settings public.dabbir_car_wash_settings%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_business from public.dabbir_businesses b where b.id=p_business_id and b.business_type='car_wash';
  if not found then raise exception 'CAR_WASH_BUSINESS_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state not in ('closed','human_active')) then raise exception 'CAR_WASH_CONVERSATION_UNAVAILABLE'; end if;
  select * into v_settings from public.dabbir_car_wash_settings s where s.business_id=p_business_id;
  if not found then raise exception 'CAR_WASH_SETTINGS_REQUIRED'; end if;
  return jsonb_build_object(
    'operator_mode',v_settings.operator_mode,'kill_switch',v_settings.kill_switch,'permissions',v_settings.operator_permissions,
    'confidence_threshold',v_settings.confidence_threshold,'service_areas',v_settings.service_areas,
    'open_time',v_settings.open_time,'close_time',v_settings.close_time,'working_days',v_settings.working_days,
    'travel_minutes',v_settings.default_travel_minutes,'max_concurrent',v_settings.max_concurrent_bookings,
    'max_quote_aed',v_settings.max_quote_aed,'max_discount_pct',v_settings.max_discount_pct,
    'max_messages',v_settings.max_messages_per_inquiry,'ai_usage_month_aed',v_settings.ai_usage_month_aed,
    'ai_target_monthly_aed',v_settings.ai_target_monthly_aed,'ai_hard_cap_monthly_aed',v_settings.ai_hard_cap_monthly_aed,
    'currency_code',v_business.currency_code,'timezone',v_business.timezone,
    'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name_ar',o.name_ar,'name_en',o.name_en,'duration_minutes',o.duration_minutes,'saloon_price',coalesce(o.saloon_price_amount,o.saloon_price_aed),'suv_price',coalesce(o.station_price_amount,o.station_price_aed)) order by o.sort_order) from public.dabbir_car_wash_offers o where o.business_id=p_business_id and o.active),'[]'::jsonb),
    'teams',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.display_name,'service_areas',coalesce(w.metadata->'service_areas','[]'::jsonb)) order by w.display_name) from public.dabbir_workers w where w.business_id=p_business_id and w.status='active'),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.dabbir_car_wash_whatsapp_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_car_wash_whatsapp_context(uuid,uuid) to service_role;

create or replace function public.dabbir_car_wash_whatsapp_availability(
  p_business_id uuid,p_conversation_id uuid,p_offer_id uuid,p_vehicle_type text,p_location_label text,
  p_requested_local timestamp,p_extraction jsonb,p_confidence numeric,p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business public.dabbir_businesses%rowtype;v_settings public.dabbir_car_wash_settings%rowtype;v_offer public.dabbir_car_wash_offers%rowtype;
  v_conversation public.dabbir_conversations%rowtype;v_job public.dabbir_car_wash_jobs%rowtype;v_worker public.dabbir_workers%rowtype;
  v_vehicle text:=lower(trim(coalesce(p_vehicle_type,'')));v_price numeric;v_local timestamp;v_start timestamptz;v_end timestamptz;
  v_slots jsonb:='[]'::jsonb;v_key text:=trim(coalesce(p_operation_key,''));i integer;v_transition jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(v_key) not between 16 and 180 then raise exception 'CAR_WASH_IDEMPOTENCY_REQUIRED'; end if;
  if v_vehicle not in ('saloon','suv') then return jsonb_build_object('ok',false,'state','NEED_VEHICLE'); end if;
  if nullif(trim(p_location_label),'') is null then return jsonb_build_object('ok',false,'state','NEED_AREA'); end if;
  if p_requested_local is null then return jsonb_build_object('ok',false,'state','NEED_TIME'); end if;
  select * into v_business from public.dabbir_businesses b where b.id=p_business_id and b.business_type='car_wash';
  select * into v_settings from public.dabbir_car_wash_settings s where s.business_id=p_business_id;
  select * into v_conversation from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state not in ('closed','human_active');
  select * into v_offer from public.dabbir_car_wash_offers o where o.id=p_offer_id and o.business_id=p_business_id and o.active;
  if v_business.id is null or v_settings.business_id is null or v_conversation.id is null then raise exception 'CAR_WASH_CONTEXT_UNVERIFIED'; end if;
  if v_offer.id is null then return jsonb_build_object('ok',false,'state','NEED_SERVICE'); end if;
  if v_settings.kill_switch or v_settings.operator_mode='paused' then return jsonb_build_object('ok',false,'state','HUMAN_REQUIRED','reason','OPERATOR_STOPPED'); end if;
  if jsonb_typeof(v_settings.service_areas)='array' and jsonb_array_length(v_settings.service_areas)>0
    and not exists(select 1 from jsonb_array_elements_text(v_settings.service_areas) area where lower(trim(p_location_label)) like '%'||lower(trim(area))||'%')
  then return jsonb_build_object('ok',false,'state','OUTSIDE_SERVICE_AREA'); end if;
  v_price:=case when v_vehicle='suv' then coalesce(v_offer.station_price_amount,v_offer.station_price_aed) else coalesce(v_offer.saloon_price_amount,v_offer.saloon_price_aed) end;
  if v_price>v_settings.max_quote_aed then return jsonb_build_object('ok',false,'state','HUMAN_REQUIRED','reason','QUOTE_LIMIT_EXCEEDED'); end if;
  insert into public.dabbir_car_wash_jobs(
    business_id,customer_id,conversation_id,state,source,idempotency_key,signal,extracted,extraction_confidence,operator_mode,booking_value,currency_code
  ) values(
    p_business_id,v_conversation.customer_id,p_conversation_id,'inquiry','whatsapp',v_key,
    jsonb_build_object('channel','whatsapp','conversation_id',p_conversation_id),
    coalesce(p_extraction,'{}'::jsonb)||jsonb_build_object('offer_id',v_offer.id,'vehicle_type',v_vehicle,'location_label',left(trim(p_location_label),240),'requested_local',p_requested_local),
    greatest(0,least(1,coalesce(p_confidence,0))),v_settings.operator_mode,v_price,v_business.currency_code
  ) on conflict (business_id,idempotency_key) do update set updated_at=now()
  returning * into v_job;
  if v_job.state='inquiry' then
    v_transition:=public.dabbir_car_wash_transition_job(p_business_id,v_job.id,'qualified','rule',v_key||':qualified','READ',null,jsonb_build_object('parser','deterministic_vertical_parser_v1'),p_extraction,'{}','{}',false);
    v_transition:=public.dabbir_car_wash_transition_job(p_business_id,v_job.id,'offered','rule',v_key||':offered','QUOTE',null,jsonb_build_object('price',v_price,'currency',v_business.currency_code),p_extraction,'{}','{}',false);
  end if;
  for i in 0..12 loop
    v_local:=p_requested_local+make_interval(mins=>i*v_settings.slot_interval_minutes);
    if not (extract(dow from v_local)::smallint=any(v_settings.working_days)) then continue; end if;
    if v_local::time<v_settings.open_time or (v_local+make_interval(mins=>v_offer.duration_minutes+v_settings.default_travel_minutes))::time>v_settings.close_time then continue; end if;
    v_start:=v_local at time zone v_business.timezone;v_end:=v_start+make_interval(mins=>v_offer.duration_minutes);
    if v_start<=now() then continue; end if;
    select w.* into v_worker from public.dabbir_workers w
    where w.business_id=p_business_id and w.status='active'
      and exists(
        select 1 from public.dabbir_worker_branches wb
        where wb.business_id=p_business_id and wb.branch_id=v_conversation.branch_id and wb.worker_id=w.id and wb.active
      )
      and (
        jsonb_typeof(w.metadata->'service_areas') is distinct from 'array'
        or jsonb_array_length(w.metadata->'service_areas')=0
        or exists(select 1 from jsonb_array_elements_text(w.metadata->'service_areas') a where lower(trim(p_location_label)) like '%'||lower(trim(a))||'%')
      )
      and (
        not exists(
          select 1 from public.dabbir_worker_schedules ws
          where ws.business_id=p_business_id and ws.worker_id=w.id and ws.active and ws.schedule_type='work'
        )
        or exists(
          select 1 from public.dabbir_worker_schedules ws
          where ws.business_id=p_business_id and ws.worker_id=w.id and ws.active and ws.schedule_type='work'
            and ws.weekday=extract(dow from v_local)::smallint
            and ws.starts_at<=v_local::time
            and ws.ends_at>=(v_local+make_interval(mins=>v_offer.duration_minutes))::time
        )
      )
      and not exists(
        select 1 from public.dabbir_worker_schedules ws
        where ws.business_id=p_business_id and ws.worker_id=w.id and ws.active and ws.schedule_type in ('break','unavailable')
          and ws.weekday=extract(dow from v_local)::smallint
          and ws.starts_at<(v_local+make_interval(mins=>v_offer.duration_minutes))::time
          and ws.ends_at>v_local::time
      )
      and not exists(
        select 1 from public.dabbir_worker_time_off wt
        where wt.business_id=p_business_id and wt.worker_id=w.id and wt.starts_at<v_end and wt.ends_at>v_start
      )
      and not exists(
        select 1 from public.dabbir_appointments ap
        where ap.business_id=p_business_id and ap.worker_id=w.id and ap.starts_at is not null
          and ap.status not in ('cancelled','completed','no_show')
          and ap.starts_at<v_end and coalesce(ap.ends_at,ap.starts_at+interval '60 minutes')>v_start
      )
      and not exists(
        select 1 from public.dabbir_calendar_busy_blocks cb
        where cb.business_id=p_business_id and cb.starts_at<v_end and cb.ends_at>v_start
      )
      and not exists(select 1 from public.dabbir_car_wash_booking_requests r where r.business_id=p_business_id and (r.branch_id is null or r.branch_id=v_conversation.branch_id) and r.assigned_worker_id=w.id and r.status in ('new','confirmed','en_route','arrived','washing') and r.starts_at<v_end+make_interval(mins=>v_settings.default_travel_minutes) and coalesce(r.ends_at,r.starts_at+interval '60 minutes')+make_interval(mins=>v_settings.default_travel_minutes)>v_start)
    order by w.display_name,w.id limit 1;
    if found then
      if (select count(*) from public.dabbir_car_wash_booking_requests r where r.business_id=p_business_id and (r.branch_id is null or r.branch_id=v_conversation.branch_id) and r.status in ('new','confirmed','en_route','arrived','washing') and r.starts_at<v_end+make_interval(mins=>v_settings.default_travel_minutes) and coalesce(r.ends_at,r.starts_at+interval '60 minutes')+make_interval(mins=>v_settings.default_travel_minutes)>v_start)<v_settings.max_concurrent_bookings then
        v_slots:=v_slots||jsonb_build_array(jsonb_build_object('kind','car_wash','job_id',v_job.id,'offer_id',v_offer.id,'offer_name',coalesce(v_offer.name_ar,v_offer.name_en),'vehicle_type',v_vehicle,'location_label',left(trim(p_location_label),240),'starts_at',v_start,'ends_at',v_end,'worker_id',v_worker.id,'worker_name',v_worker.display_name,'price',v_price,'currency_code',v_business.currency_code,'timezone',v_business.timezone));
      end if;
    end if;
    exit when jsonb_array_length(v_slots)>=3;
  end loop;
  return jsonb_build_object('ok',true,'state',case when jsonb_array_length(v_slots)>0 then 'SLOTS_AVAILABLE' else 'NO_SLOTS' end,'operator_mode',v_settings.operator_mode,'job_id',v_job.id,'slots',v_slots,'price',v_price,'currency_code',v_business.currency_code);
end;
$$;
revoke all on function public.dabbir_car_wash_whatsapp_availability(uuid,uuid,uuid,text,text,timestamp,jsonb,numeric,text) from public,anon,authenticated;
grant execute on function public.dabbir_car_wash_whatsapp_availability(uuid,uuid,uuid,text,text,timestamp,jsonb,numeric,text) to service_role;

create or replace function public.dabbir_car_wash_whatsapp_confirm(
  p_business_id uuid,p_conversation_id uuid,p_job_id uuid,p_slot jsonb,p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.dabbir_car_wash_jobs%rowtype;v_settings public.dabbir_car_wash_settings%rowtype;v_offer public.dabbir_car_wash_offers%rowtype;
  v_conversation public.dabbir_conversations%rowtype;v_booking public.dabbir_car_wash_booking_requests%rowtype;v_appt public.dabbir_appointments%rowtype;
  v_worker uuid;v_start timestamptz;v_end timestamptz;v_vehicle text;v_location text;v_key text:=trim(coalesce(p_operation_key,''));v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(v_key) not between 16 and 180 then raise exception 'CAR_WASH_IDEMPOTENCY_REQUIRED'; end if;
  select * into v_job from public.dabbir_car_wash_jobs j where j.id=p_job_id and j.business_id=p_business_id and j.conversation_id=p_conversation_id for update;
  select * into v_settings from public.dabbir_car_wash_settings s where s.business_id=p_business_id;
  select * into v_conversation from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state not in ('closed','human_active');
  if v_job.id is null or v_settings.business_id is null or v_conversation.id is null then raise exception 'CAR_WASH_CONTEXT_UNVERIFIED'; end if;
  if v_job.booking_request_id is not null then return jsonb_build_object('ok',true,'replay',true,'job_id',v_job.id,'booking_id',v_job.booking_request_id,'appointment_id',v_job.appointment_id,'state',v_job.state,'price',v_job.booking_value,'currency_code',v_job.currency_code); end if;
  if v_job.state<>'offered' then raise exception 'CAR_WASH_JOB_NOT_OFFERED'; end if;
  if v_settings.kill_switch then raise exception 'CAR_WASH_KILL_SWITCH_ACTIVE'; end if;
  if v_settings.operator_mode<>'controlled_live' then raise exception 'CAR_WASH_CONTROLLED_LIVE_REQUIRED'; end if;
  if coalesce((v_settings.operator_permissions->>'BOOK')::boolean,false) is not true or coalesce((v_settings.operator_permissions->>'ASSIGN')::boolean,false) is not true then raise exception 'CAR_WASH_BOOK_ASSIGN_PERMISSION_REQUIRED'; end if;
  v_start:=(p_slot->>'starts_at')::timestamptz;v_end:=(p_slot->>'ends_at')::timestamptz;v_worker:=nullif(p_slot->>'worker_id','')::uuid;
  if v_start is null or v_end is null or v_end<=v_start or v_start<=now() or v_worker is null then raise exception 'CAR_WASH_SLOT_INVALID'; end if;
  if not exists(select 1 from public.dabbir_workers w where w.id=v_worker and w.business_id=p_business_id and w.status='active') then raise exception 'CAR_WASH_CREW_NOT_IN_BUSINESS'; end if;
  if nullif(p_slot->>'job_id','')::uuid is distinct from v_job.id or nullif(p_slot->>'offer_id','')::uuid is distinct from nullif(v_job.extracted->>'offer_id','')::uuid then raise exception 'CAR_WASH_SLOT_TAMPERED'; end if;
  select * into v_offer from public.dabbir_car_wash_offers o where o.id=nullif(v_job.extracted->>'offer_id','')::uuid and o.business_id=p_business_id and o.active;
  if v_offer.id is null then raise exception 'CAR_WASH_OFFER_NOT_AVAILABLE'; end if;
  v_vehicle:=v_job.extracted->>'vehicle_type';v_location:=left(v_job.extracted->>'location_label',240);
  perform pg_advisory_xact_lock(hashtextextended('dabbir:car-wash-capacity:'||p_business_id::text,0));
  insert into public.dabbir_appointments(business_id,branch_id,customer_id,worker_id,starts_at,ends_at,status,simulated,quoted_price_aed,discount_aed,notes,booking_source,payment_status,location_type,service_address,travel_minutes,currency_code,deposit_currency_code,quoted_price_amount)
  values(p_business_id,v_conversation.branch_id,v_conversation.customer_id,v_worker,v_start,v_end,'new',false,v_job.booking_value,0,'Mobile car wash booked by DABBIR from verified WhatsApp conversation.','whatsapp','unpaid','customer',v_location,v_settings.default_travel_minutes,v_job.currency_code,v_job.currency_code,v_job.booking_value)
  returning * into v_appt;
  insert into public.dabbir_car_wash_booking_requests(
    business_id,branch_id,offer_id,vehicle_type,starts_at,ends_at,customer_name,customer_phone,location_lat,location_lng,location_label,status,source,
    customer_id,quoted_price_aed,quoted_price_amount,currency_code,assigned_worker_id,appointment_id,conversation_id,idempotency_key
  ) values(
    p_business_id,v_conversation.branch_id,v_offer.id,case when v_vehicle='suv' then 'station' else 'saloon' end,v_start,v_end,
    coalesce((select c.display_name from public.dabbir_customers c where c.id=v_conversation.customer_id and c.business_id=p_business_id),'WhatsApp Customer'),
    coalesce((select c.phone_e164 from public.dabbir_customers c where c.id=v_conversation.customer_id and c.business_id=p_business_id),'0000000'),
    null,null,v_location,'confirmed','whatsapp',v_conversation.customer_id,v_job.booking_value,v_job.booking_value,v_job.currency_code,v_worker,v_appt.id,p_conversation_id,v_job.idempotency_key
  ) returning * into v_booking;
  update public.dabbir_car_wash_jobs set booking_request_id=v_booking.id,appointment_id=v_appt.id,assigned_worker_id=v_booking.assigned_worker_id,reminder_due_at=v_start-interval '2 hours',reminder_state='pending',updated_at=now() where id=v_job.id and business_id=p_business_id;
  v_result:=public.dabbir_car_wash_transition_job(p_business_id,v_job.id,'confirmed','rule',v_key||':confirmed','BOOK',null,jsonb_build_object('slot',p_slot),jsonb_build_object('booking_request_id',v_booking.id,'appointment_id',v_appt.id),'{}',jsonb_build_object('booking_persisted',true,'capacity_verified',true),false);
  v_result:=public.dabbir_car_wash_transition_job(p_business_id,v_job.id,'assigned','rule',v_key||':assigned','ASSIGN',null,jsonb_build_object('worker_id',v_booking.assigned_worker_id),jsonb_build_object('booking_request_id',v_booking.id),'{}',jsonb_build_object('crew_assignment_persisted',true),false);
  return jsonb_build_object('ok',true,'replay',false,'verified',true,'job_id',v_job.id,'booking_id',v_booking.id,'appointment_id',v_appt.id,'worker_id',v_booking.assigned_worker_id,'starts_at',v_booking.starts_at,'ends_at',v_booking.ends_at,'status','assigned','price',v_job.booking_value,'currency_code',v_job.currency_code,'timezone',(select b.timezone from public.dabbir_businesses b where b.id=p_business_id));
end;
$$;
revoke all on function public.dabbir_car_wash_whatsapp_confirm(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.dabbir_car_wash_whatsapp_confirm(uuid,uuid,uuid,jsonb,text) to service_role;

create or replace function public.dabbir_car_wash_record_checkpoint(
  p_business_id uuid,p_job_id uuid,p_checkpoint text,p_idempotency_key text,p_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.dabbir_car_wash_jobs%rowtype;v_booking public.dabbir_car_wash_booking_requests%rowtype;
  v_checkpoint text:=lower(trim(coalesce(p_checkpoint,'')));v_status text;v_key text:=left(trim(coalesce(p_idempotency_key,'')),200);
begin
  if not dabbir_private.has_permission(p_business_id,'manage_appointments') then raise exception 'CAR_WASH_CHECKPOINT_FORBIDDEN'; end if;
  if v_checkpoint not in ('crew_accepted','en_route','arrived','service_started') then raise exception 'CAR_WASH_CHECKPOINT_INVALID'; end if;
  if char_length(v_key) not between 16 and 200 then raise exception 'CAR_WASH_CHECKPOINT_IDEMPOTENCY_REQUIRED'; end if;
  if char_length(trim(coalesce(p_evidence->>'reference','')))<3 then raise exception 'CAR_WASH_CHECKPOINT_EVIDENCE_REQUIRED'; end if;
  select * into v_job from public.dabbir_car_wash_jobs j where j.id=p_job_id and j.business_id=p_business_id and j.state in ('assigned','reminded') for update;
  if not found or v_job.booking_request_id is null then raise exception 'CAR_WASH_ACTIVE_JOB_REQUIRED'; end if;
  select * into v_booking from public.dabbir_car_wash_booking_requests r where r.id=v_job.booking_request_id and r.business_id=p_business_id for update;
  v_status:=case v_checkpoint when 'crew_accepted' then 'confirmed' when 'en_route' then 'en_route' when 'arrived' then 'arrived' else 'washing' end;
  insert into public.dabbir_car_wash_outcome_ledger(
    business_id,idempotency_key,job_id,customer_id,conversation_id,booking_request_id,action_type,actor_type,
    requested_result,verified_result,status,booking_value,attribution_source,evidence_reference,verified_at
  ) values(
    p_business_id,v_key,p_job_id,v_job.customer_id,v_job.conversation_id,v_job.booking_request_id,'checkpoint.'||v_checkpoint,'human',
    jsonb_build_object('checkpoint',v_checkpoint),coalesce(p_evidence,'{}'::jsonb),'VERIFIED',v_job.booking_value,'operational_checkpoint_not_revenue',p_evidence->>'reference',now()
  ) on conflict (business_id,idempotency_key) do nothing;
  if found then
    update public.dabbir_car_wash_booking_requests set status=v_status,updated_at=now() where id=v_booking.id and business_id=p_business_id;
    insert into public.dabbir_car_wash_booking_status_history(business_id,booking_id,from_status,to_status,note,changed_by)
    values(p_business_id,v_booking.id,v_booking.status,v_status,'DABBIR owner checkpoint: '||v_checkpoint,auth.uid());
  end if;
  return jsonb_build_object('ok',true,'job_id',v_job.id,'checkpoint',v_checkpoint,'booking_status',v_status);
end;
$$;
revoke all on function public.dabbir_car_wash_record_checkpoint(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.dabbir_car_wash_record_checkpoint(uuid,uuid,text,text,jsonb) to authenticated;

create or replace function public.dabbir_car_wash_record_external_message(
  p_business_id uuid,p_job_id uuid,p_purpose text,p_provider_message_id text,p_delivery_status text,p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.dabbir_car_wash_jobs%rowtype;v_status text:=lower(trim(coalesce(p_delivery_status,'accepted')));
  v_purpose text:=lower(trim(coalesce(p_purpose,'')));v_provider text:=left(trim(coalesce(p_provider_message_id,'')),320);
  v_key text:=left(trim(coalesce(p_operation_key,'')),200);v_ledger_status text;v_failure text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(v_key) not between 16 and 200 then raise exception 'CAR_WASH_EXTERNAL_IDEMPOTENCY_REQUIRED'; end if;
  if v_purpose not in ('offer','confirmation','reminder') then raise exception 'CAR_WASH_EXTERNAL_PURPOSE_INVALID'; end if;
  if v_status not in ('accepted','provider_accepted','sent','delivered','read','failed','ambiguous') then raise exception 'CAR_WASH_DELIVERY_STATUS_INVALID'; end if;
  if v_status not in ('failed','ambiguous') and char_length(v_provider)<3 then raise exception 'CAR_WASH_PROVIDER_EVIDENCE_REQUIRED'; end if;
  select * into v_job from public.dabbir_car_wash_jobs j where j.id=p_job_id and j.business_id=p_business_id;
  if not found then raise exception 'CAR_WASH_JOB_NOT_FOUND'; end if;
  v_ledger_status:=case when v_status in ('delivered','read') then 'VERIFIED' when v_status='failed' then 'FAILED' when v_status='ambiguous' then 'UNKNOWN' else 'PENDING' end;
  v_failure:=case when v_status in ('failed','ambiguous') then 'WHATSAPP_'||upper(v_status) else null end;
  insert into public.dabbir_car_wash_outcome_ledger(
    business_id,idempotency_key,job_id,customer_id,conversation_id,booking_request_id,action_type,actor_type,permission_used,
    requested_result,verified_result,status,failure_reason,booking_value,estimated_revenue,attribution_source,evidence_reference,verified_at
  ) values(
    p_business_id,v_key,p_job_id,v_job.customer_id,v_job.conversation_id,v_job.booking_request_id,'message.'||v_purpose,'rule','MESSAGE',
    jsonb_build_object('delivery','delivered'),'{}'::jsonb,v_ledger_status,v_failure,v_job.booking_value,0,'external_message_not_revenue',nullif(v_provider,''),
    case when v_ledger_status='VERIFIED' then now() else null end
  ) on conflict (business_id,idempotency_key) do update set
    verified_result=jsonb_build_object('provider_message_id',nullif(v_provider,''),'delivery_status',v_status),
    status=v_ledger_status,failure_reason=v_failure,evidence_reference=coalesce(nullif(v_provider,''),public.dabbir_car_wash_outcome_ledger.evidence_reference),
    verified_at=case when v_ledger_status='VERIFIED' then now() else public.dabbir_car_wash_outcome_ledger.verified_at end;
  return jsonb_build_object('ok',true,'job_id',p_job_id,'status',v_ledger_status,'delivery_status',v_status,'provider_message_id',nullif(v_provider,''));
end;
$$;
revoke all on function public.dabbir_car_wash_record_external_message(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_car_wash_record_external_message(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.dabbir_claim_car_wash_reminders(p_limit integer default 20)
returns table(
  job_id uuid,business_id uuid,conversation_id uuid,lock_token uuid,attempt_count integer,
  starts_at timestamptz,timezone text,business_name text,template_language text,offer_name_ar text,offer_name_en text,worker_name text
)
language plpgsql
security definer
set search_path=''
as $$
declare v record;v_lock uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  for v in
    select j.id,j.business_id,j.conversation_id,r.starts_at,b.timezone,b.name as business_name,
      case when lower(coalesce(b.locale,'')) like 'en%' then 'en' else 'ar' end as template_language,
      o.name_ar as offer_name_ar,o.name_en as offer_name_en,w.display_name as worker_name,j.reminder_attempt_count
    from public.dabbir_car_wash_jobs j
    join public.dabbir_car_wash_settings s on s.business_id=j.business_id
    join public.dabbir_businesses b on b.id=j.business_id
    join public.dabbir_car_wash_booking_requests r on r.id=j.booking_request_id and r.business_id=j.business_id
    left join public.dabbir_car_wash_offers o on o.id=r.offer_id and o.business_id=r.business_id
    left join public.dabbir_workers w on w.id=j.assigned_worker_id and w.business_id=j.business_id
    where j.state='assigned' and j.conversation_id is not null and j.reminder_due_at<=now() and r.starts_at>now()
      and (j.reminder_state='pending' or (j.reminder_state='leased' and j.reminder_locked_until<now()))
      and j.reminder_attempt_count<3 and s.operator_mode='controlled_live' and s.kill_switch=false
      and coalesce((s.operator_permissions->>'REMIND')::boolean,false)=true
    order by j.reminder_due_at,j.id
    for update of j skip locked
    limit greatest(1,least(coalesce(p_limit,20),50))
  loop
    v_lock:=gen_random_uuid();
    update public.dabbir_car_wash_jobs set reminder_state='leased',reminder_lock_token=v_lock,reminder_locked_until=now()+interval '90 seconds',
      reminder_attempt_count=reminder_attempt_count+1,last_failure_reason=null,updated_at=now()
    where id=v.id and business_id=v.business_id;
    job_id:=v.id;business_id:=v.business_id;conversation_id:=v.conversation_id;lock_token:=v_lock;
    attempt_count:=v.reminder_attempt_count+1;starts_at:=v.starts_at;timezone:=v.timezone;business_name:=v.business_name;template_language:=v.template_language;
    offer_name_ar:=v.offer_name_ar;offer_name_en:=v.offer_name_en;worker_name:=v.worker_name;
    return next;
  end loop;
end;
$$;
revoke all on function public.dabbir_claim_car_wash_reminders(integer) from public,anon,authenticated;
grant execute on function public.dabbir_claim_car_wash_reminders(integer) to service_role;

create or replace function public.dabbir_finish_car_wash_reminder(
  p_job_id uuid,p_lock_token uuid,p_status text,p_provider_message_id text default null,p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.dabbir_car_wash_jobs%rowtype;v_status text:=lower(trim(coalesce(p_status,'')));
  v_provider text:=left(trim(coalesce(p_provider_message_id,'')),320);v_error text:=left(trim(coalesce(p_error,'')),300);
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_status not in ('accepted','retry','failed','ambiguous') then raise exception 'CAR_WASH_REMINDER_RESULT_INVALID'; end if;
  select * into v_job from public.dabbir_car_wash_jobs j where j.id=p_job_id and j.reminder_state='leased' and j.reminder_lock_token=p_lock_token for update;
  if not found then raise exception 'CAR_WASH_REMINDER_LEASE_MISMATCH'; end if;
  if v_status='accepted' then
    if char_length(v_provider)<3 then raise exception 'CAR_WASH_REMINDER_PROVIDER_ID_REQUIRED'; end if;
    update public.dabbir_car_wash_jobs set reminder_state='accepted',reminder_provider_message_id=v_provider,reminder_lock_token=null,reminder_locked_until=null,updated_at=now() where id=v_job.id;
  elsif v_status='retry' and v_job.reminder_attempt_count<3 then
    update public.dabbir_car_wash_jobs set reminder_state='pending',reminder_due_at=now()+make_interval(secs=>least(900,60*power(2,greatest(0,reminder_attempt_count-1))::integer)),
      reminder_lock_token=null,reminder_locked_until=null,last_failure_reason=coalesce(nullif(v_error,''),'WHATSAPP_RETRYABLE_FAILURE'),updated_at=now() where id=v_job.id;
  else
    update public.dabbir_car_wash_jobs set reminder_state=case when v_status='ambiguous' then 'ambiguous' else 'failed' end,
      reminder_lock_token=null,reminder_locked_until=null,last_failure_reason=coalesce(nullif(v_error,''),'WHATSAPP_REMINDER_FAILED'),updated_at=now() where id=v_job.id;
    perform public.dabbir_whatsapp_ai_handoff(v_job.business_id,v_job.conversation_id,'BOOKING','Car-wash reminder delivery needs human review',coalesce(nullif(v_error,''),v_status));
  end if;
  return jsonb_build_object('ok',true,'job_id',v_job.id,'status',case when v_status='retry' and v_job.reminder_attempt_count>=3 then 'failed' else v_status end,'attempt_count',v_job.reminder_attempt_count);
end;
$$;
revoke all on function public.dabbir_finish_car_wash_reminder(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_finish_car_wash_reminder(uuid,uuid,text,text,text) to service_role;

create or replace function public.dabbir_reconcile_car_wash_message_status(
  p_provider_message_id text,p_status text,p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_provider text:=left(trim(coalesce(p_provider_message_id,'')),320);v_status text:=lower(trim(coalesce(p_status,'')));
  v_outcome public.dabbir_car_wash_outcome_ledger%rowtype;v_job public.dabbir_car_wash_jobs%rowtype;v_transition jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(v_provider)<3 or v_status not in ('sent','delivered','read','failed') then return jsonb_build_object('matched',false); end if;
  select * into v_outcome from public.dabbir_car_wash_outcome_ledger o where o.evidence_reference=v_provider order by o.created_at desc limit 1 for update;
  if not found then return jsonb_build_object('matched',false); end if;
  select * into v_job from public.dabbir_car_wash_jobs j where j.id=v_outcome.job_id and j.business_id=v_outcome.business_id for update;
  update public.dabbir_car_wash_outcome_ledger set
    verified_result=coalesce(verified_result,'{}'::jsonb)||jsonb_build_object('provider_message_id',v_provider,'delivery_status',v_status,'occurred_at',p_occurred_at),
    status=case when v_status in ('delivered','read') then 'VERIFIED' when v_status='failed' then 'FAILED' else status end,
    failure_reason=case when v_status='failed' then 'WHATSAPP_PROVIDER_FAILED' else null end,
    verified_at=case when v_status in ('delivered','read') then p_occurred_at else verified_at end
  where id=v_outcome.id and business_id=v_outcome.business_id;
  if v_outcome.action_type='message.reminder' and v_status in ('delivered','read') then
    update public.dabbir_car_wash_jobs set reminder_state='delivered',updated_at=now() where id=v_job.id and business_id=v_job.business_id;
    if v_job.state='assigned' then
      v_transition:=public.dabbir_car_wash_transition_job(v_job.business_id,v_job.id,'reminded','provider','reminder-delivery:'||md5(v_provider),'REMIND',null,
        jsonb_build_object('provider','meta'),jsonb_build_object('reference',v_provider,'provider_verified',true),
        jsonb_build_object('message','reminder'),jsonb_build_object('status',v_status,'occurred_at',p_occurred_at),false);
    end if;
  elsif v_outcome.action_type='message.reminder' and v_status='failed' then
    update public.dabbir_car_wash_jobs set reminder_state='failed',last_failure_reason='WHATSAPP_PROVIDER_FAILED',updated_at=now() where id=v_job.id and business_id=v_job.business_id;
    perform public.dabbir_whatsapp_ai_handoff(v_job.business_id,v_job.conversation_id,'BOOKING','Car-wash reminder failed after provider acceptance','Provider status: failed');
  end if;
  return jsonb_build_object('matched',true,'job_id',v_job.id,'status',v_status,'provider_verified',v_status in ('delivered','read'));
end;
$$;
revoke all on function public.dabbir_reconcile_car_wash_message_status(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_reconcile_car_wash_message_status(text,text,timestamptz) to service_role;

create or replace function dabbir_private.car_wash_message_evidence(p_business_id uuid,p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' and not dabbir_private.has_permission(p_business_id,'view_business') then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'body',r.body,'state',r.state,'provider_status',r.provider_status,'provider_verified',r.provider_verified,
    'provider_message_id',r.provider_message_id,'error',r.error_code,'attempted_at',r.external_attempt_started_at,'finalized_at',r.finalized_at
  ) order by r.created_at) from public.dabbir_whatsapp_outbound_reservations r where r.business_id=p_business_id and r.conversation_id=p_conversation_id),'[]'::jsonb);
end;
$$;
revoke all on function dabbir_private.car_wash_message_evidence(uuid,uuid) from public,anon;
grant execute on function dabbir_private.car_wash_message_evidence(uuid,uuid) to authenticated,service_role;

create or replace view public.dabbir_car_wash_owner_receipts
with (security_invoker=true)
as
select
  j.id as job_id,j.business_id,j.customer_id,j.conversation_id,j.booking_request_id,j.appointment_id,j.assigned_worker_id,
  j.state,j.source,j.booking_value,j.amount_paid,j.currency_code,j.lost_reason,j.created_at,j.updated_at,j.completed_at,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',t.id,'from',t.from_state,'to',t.to_state,'actor',t.actor_type,'permission',t.permission_used,
    'decision',t.decision,'evidence',t.evidence,'action',t.action,'external_result',t.external_result,
    'failure_reason',t.failure_reason,'owner_override',t.owner_override,'at',t.created_at
  ) order by t.created_at) from public.dabbir_car_wash_job_transitions t where t.business_id=j.business_id and t.job_id=j.id),'[]'::jsonb) as transitions,
  coalesce((select jsonb_build_object(
    'estimated',coalesce(max(o.estimated_revenue),0),
    'verified',coalesce(max(o.verified_revenue),0),
    'recovered',coalesce(max(o.recovered_revenue),0),
    'lost',coalesce(max(o.lost_revenue),0)
  ) from public.dabbir_car_wash_outcome_ledger o where o.business_id=j.business_id and o.job_id=j.id),'{}'::jsonb) as outcomes,
  dabbir_private.car_wash_message_evidence(j.business_id,j.conversation_id) as messages
from public.dabbir_car_wash_jobs j;
revoke all on public.dabbir_car_wash_owner_receipts from public,anon;
grant select on public.dabbir_car_wash_owner_receipts to authenticated;

insert into public.dabbir_action_policies(
  business_id,action_key,risk_class,auto_execute,requires_customer_confirmation,requires_owner_approval,
  requires_identity_verification,max_attempts,timeout_seconds,active,metadata,updated_at
)
select b.id,'car_wash.'||lower(p.permission),p.risk,false,false,p.owner_approval,false,p.attempts,p.timeout,true,
  jsonb_build_object('permission',p.permission,'operator_mode','shadow','source','car_wash_killer_job_p0','version','v1'),now()
from public.dabbir_businesses b
cross join (values
  ('READ','LOW'::text,false,1,5),('MESSAGE','MEDIUM',true,2,15),('QUOTE','LOW',false,1,5),
  ('BOOK','MEDIUM',true,2,15),('ASSIGN','MEDIUM',true,2,15),('REMIND','MEDIUM',true,2,15),('CHARGE','HIGH',true,1,20)
) p(permission,risk,owner_approval,attempts,timeout)
where b.business_type='car_wash'
on conflict (business_id,action_key) do nothing;

comment on table public.dabbir_car_wash_jobs is 'One mobile-car-wash inquiry lifecycle. It links to existing conversations, booking requests and appointments; it is not a parallel booking calendar.';
comment on table public.dabbir_car_wash_outcome_ledger is 'Signal-to-outcome evidence. Estimated, verified, recovered and lost values are separate and recovered requires verified payment attribution.';
comment on function public.dabbir_car_wash_transition_job(uuid,uuid,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,boolean) is 'The only job state mutation surface. Enforces legal transitions, tenant permission, mode, kill switch, confidence, idempotency, audit and outcome attribution.';
