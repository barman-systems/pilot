begin;

-- DABBIR Salon Mode P0. The schema stays vertical-neutral: UI terminology is
-- salon-specific while workers, workflow notifications, payments and audit are reusable.

alter table public.dabbir_customers
  add column if not exists phone_e164 text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists dabbir_customers_business_phone_uq
  on public.dabbir_customers(business_id, phone_e164)
  where phone_e164 is not null;

alter table public.dabbir_services
  add column if not exists name_ar text,
  add column if not exists name_en text,
  add column if not exists category text not null default 'general',
  add column if not exists commission_type text,
  add column if not exists commission_value numeric(12,2),
  add column if not exists updated_at timestamptz not null default now();

update public.dabbir_services
set name_ar = coalesce(nullif(name_ar,''), name),
    name_en = coalesce(nullif(name_en,''), name)
where name_ar is null or name_en is null or name_ar='' or name_en='';

alter table public.dabbir_services
  drop constraint if exists dabbir_services_commission_type_check;
alter table public.dabbir_services
  add constraint dabbir_services_commission_type_check
  check (commission_type is null or commission_type in ('percentage','fixed'));

alter table public.dabbir_services
  drop constraint if exists dabbir_services_commission_value_check;
alter table public.dabbir_services
  add constraint dabbir_services_commission_value_check
  check (
    commission_value is null
    or (commission_type='percentage' and commission_value between 0 and 100)
    or (commission_type='fixed' and commission_value >= 0)
  );

create table if not exists public.dabbir_workers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  membership_user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 2 and 120),
  phone_e164 text,
  job_title text not null default 'employee' check (char_length(job_title) between 2 and 120),
  commission_type text not null default 'percentage' check (commission_type in ('percentage','fixed')),
  commission_value numeric(12,2) not null default 0,
  status text not null default 'active' check (status in ('active','inactive','suspended')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id),
  check (
    (commission_type='percentage' and commission_value between 0 and 100)
    or (commission_type='fixed' and commission_value >= 0)
  )
);

create unique index if not exists dabbir_workers_business_membership_uq
  on public.dabbir_workers(business_id,membership_user_id)
  where membership_user_id is not null;
create index if not exists dabbir_workers_business_status_idx
  on public.dabbir_workers(business_id,status,display_name);

create table if not exists public.dabbir_worker_services (
  business_id uuid not null,
  worker_id uuid not null,
  service_id uuid not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 5 and 1440),
  price_aed numeric(12,2) check (price_aed is null or price_aed between 0 and 10000000),
  commission_type text check (commission_type is null or commission_type in ('percentage','fixed')),
  commission_value numeric(12,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (worker_id,service_id),
  foreign key (business_id,worker_id) references public.dabbir_workers(business_id,id) on delete cascade,
  foreign key (business_id,service_id) references public.dabbir_services(business_id,id) on delete cascade,
  check (
    commission_value is null
    or (commission_type='percentage' and commission_value between 0 and 100)
    or (commission_type='fixed' and commission_value >= 0)
  )
);

create index if not exists dabbir_worker_services_business_service_idx
  on public.dabbir_worker_services(business_id,service_id,active);

create table if not exists public.dabbir_worker_schedules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  worker_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  schedule_type text not null default 'work' check (schedule_type in ('work','break','unavailable')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id,worker_id) references public.dabbir_workers(business_id,id) on delete cascade,
  check (ends_at > starts_at),
  unique (business_id,worker_id,weekday,starts_at,ends_at,schedule_type)
);

create index if not exists dabbir_worker_schedules_lookup_idx
  on public.dabbir_worker_schedules(business_id,worker_id,weekday,starts_at,ends_at)
  where active=true;

create table if not exists public.dabbir_worker_time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  worker_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_off_type text not null default 'unavailable' check (time_off_type in ('leave','unavailable')),
  reason text not null default '' check (char_length(reason) <= 240),
  created_at timestamptz not null default now(),
  foreign key (business_id,worker_id) references public.dabbir_workers(business_id,id) on delete cascade,
  check (ends_at > starts_at)
);

create index if not exists dabbir_worker_time_off_lookup_idx
  on public.dabbir_worker_time_off(business_id,worker_id,starts_at,ends_at);

create table if not exists public.dabbir_salon_settings (
  business_id uuid primary key references public.dabbir_businesses(id) on delete cascade,
  timezone text not null default 'Asia/Dubai',
  reminder_on_booking boolean not null default true,
  reminder_24h boolean not null default true,
  reminder_2h boolean not null default true,
  no_show_warning_threshold smallint not null default 2 check (no_show_warning_threshold between 1 and 20),
  deposit_enabled boolean not null default false,
  retention_days integer not null default 45 check (retention_days between 7 and 730),
  updated_at timestamptz not null default now()
);

insert into public.dabbir_salon_settings(business_id)
select id from public.dabbir_businesses where business_type='salon'
on conflict (business_id) do nothing;

-- The legacy conflict trigger assumes a fixed 60-minute business-wide slot and can
-- reject harmless status normalization on historical rows. It is recreated below
-- with worker-aware duration logic before this transaction commits.
drop trigger if exists dabbir_appointment_calendar_conflict_guard on public.dabbir_appointments;

alter table public.dabbir_appointments
  add column if not exists worker_id uuid,
  add column if not exists ends_at timestamptz,
  add column if not exists quoted_price_aed numeric(12,2) not null default 0,
  add column if not exists discount_aed numeric(12,2) not null default 0,
  add column if not exists notes text not null default '',
  add column if not exists booking_source text not null default 'internal',
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists updated_at timestamptz not null default now();

update public.dabbir_appointments a
set ends_at = a.starts_at + make_interval(mins => coalesce(s.duration_minutes,60))
from public.dabbir_services s
where a.ends_at is null and a.service_id=s.id and a.business_id=s.business_id and a.starts_at is not null;

update public.dabbir_appointments
set ends_at = starts_at + interval '60 minutes'
where ends_at is null and starts_at is not null;

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_status_check;

update public.dabbir_appointments set status='new' where status='requested';
update public.dabbir_appointments set status='confirmed' where status='rescheduled';

alter table public.dabbir_appointments
  add constraint dabbir_appointments_status_check
  check (status in ('new','confirmed','arrived','in_progress','completed','cancelled','no_show'));

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_worker_fk;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_worker_fk
  foreign key (business_id,worker_id) references public.dabbir_workers(business_id,id) on delete restrict;

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_time_range_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_time_range_check
  check (starts_at is null or ends_at is null or ends_at > starts_at);

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_money_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_money_check
  check (quoted_price_aed >= 0 and discount_aed >= 0 and discount_aed <= quoted_price_aed);

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_payment_status_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_payment_status_check
  check (payment_status in ('unpaid','partial','paid','refunded'));

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_booking_source_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_booking_source_check
  check (booking_source in ('internal','web','whatsapp','phone','walk_in','rebook','waitlist','calendar_sync'));

create unique index if not exists dabbir_appointments_business_id_id_uq
  on public.dabbir_appointments(business_id,id);
create index if not exists dabbir_appointments_business_worker_start_status_idx
  on public.dabbir_appointments(business_id,worker_id,starts_at,status);
create index if not exists dabbir_appointments_business_customer_start_idx
  on public.dabbir_appointments(business_id,customer_id,starts_at desc);

create table if not exists public.dabbir_appointment_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  appointment_id uuid not null,
  service_id uuid not null,
  worker_id uuid,
  service_name_ar text not null,
  service_name_en text not null,
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  unit_price_aed numeric(12,2) not null check (unit_price_aed between 0 and 10000000),
  discount_aed numeric(12,2) not null default 0 check (discount_aed >= 0),
  commission_type text check (commission_type is null or commission_type in ('percentage','fixed')),
  commission_value numeric(12,2),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id,appointment_id) references public.dabbir_appointments(business_id,id) on delete cascade,
  foreign key (business_id,service_id) references public.dabbir_services(business_id,id) on delete restrict,
  foreign key (business_id,worker_id) references public.dabbir_workers(business_id,id) on delete restrict,
  unique (business_id,appointment_id,service_id,worker_id),
  check (discount_aed <= unit_price_aed),
  check (
    commission_value is null
    or (commission_type='percentage' and commission_value between 0 and 100)
    or (commission_type='fixed' and commission_value >= 0)
  )
);

create index if not exists dabbir_appointment_services_appointment_idx
  on public.dabbir_appointment_services(business_id,appointment_id);
create index if not exists dabbir_appointment_services_worker_idx
  on public.dabbir_appointment_services(business_id,worker_id,completed_at desc);

insert into public.dabbir_appointment_services(
  business_id,appointment_id,service_id,worker_id,service_name_ar,service_name_en,
  duration_minutes,unit_price_aed,discount_aed,commission_type,commission_value,completed_at
)
select a.business_id,a.id,a.service_id,a.worker_id,
       coalesce(s.name_ar,s.name),coalesce(s.name_en,s.name),
       greatest(5,coalesce(extract(epoch from (a.ends_at-a.starts_at))/60,s.duration_minutes,60)::integer),
       greatest(0,coalesce(nullif(a.quoted_price_aed,0),s.price_aed,0)),a.discount_aed,
       s.commission_type,s.commission_value,
       case when a.status='completed' then coalesce(a.updated_at,a.created_at) end
from public.dabbir_appointments a
join public.dabbir_services s on s.id=a.service_id and s.business_id=a.business_id
where a.service_id is not null
on conflict (business_id,appointment_id,service_id,worker_id) do nothing;

create table if not exists public.dabbir_workflow_status_history (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  workflow_type text not null default 'appointment',
  entity_id uuid not null,
  appointment_id uuid references public.dabbir_appointments(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists dabbir_workflow_status_history_entity_idx
  on public.dabbir_workflow_status_history(business_id,workflow_type,entity_id,changed_at desc);
create index if not exists dabbir_workflow_status_history_appointment_idx
  on public.dabbir_workflow_status_history(business_id,appointment_id,changed_at desc)
  where appointment_id is not null;

create table if not exists public.dabbir_commissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  worker_id uuid not null,
  appointment_id uuid not null,
  appointment_service_id uuid not null references public.dabbir_appointment_services(id) on delete cascade,
  commission_type text not null check (commission_type in ('percentage','fixed')),
  commission_value numeric(12,2) not null,
  revenue_aed numeric(12,2) not null check (revenue_aed >= 0),
  commission_aed numeric(12,2) not null check (commission_aed >= 0),
  salon_gross_aed numeric(12,2) not null,
  status text not null default 'earned' check (status in ('earned','void')),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id,worker_id) references public.dabbir_workers(business_id,id) on delete restrict,
  foreign key (business_id,appointment_id) references public.dabbir_appointments(business_id,id) on delete cascade,
  unique (appointment_service_id)
);

create index if not exists dabbir_commissions_business_worker_date_idx
  on public.dabbir_commissions(business_id,worker_id,generated_at desc,status);

create table if not exists public.dabbir_operational_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  appointment_id uuid not null,
  customer_id uuid,
  amount_aed numeric(12,2) not null check (amount_aed >= 0),
  method text not null check (method in ('cash','card','payment_link','other','unpaid')),
  status text not null default 'paid' check (status in ('paid','unpaid','refunded')),
  reference text,
  idempotency_key text not null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (business_id,appointment_id) references public.dabbir_appointments(business_id,id) on delete cascade,
  foreign key (business_id,customer_id) references public.dabbir_customers(business_id,id) on delete set null,
  unique (business_id,idempotency_key)
);

create index if not exists dabbir_operational_payments_appointment_idx
  on public.dabbir_operational_payments(business_id,appointment_id,created_at desc);
create index if not exists dabbir_operational_payments_customer_idx
  on public.dabbir_operational_payments(business_id,customer_id,created_at desc)
  where customer_id is not null;

create table if not exists public.dabbir_customer_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  note text not null check (char_length(note) between 1 and 2000),
  important boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (business_id,customer_id) references public.dabbir_customers(business_id,id) on delete cascade
);

create index if not exists dabbir_customer_notes_customer_idx
  on public.dabbir_customer_notes(business_id,customer_id,important desc,created_at desc);

create table if not exists public.dabbir_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  customer_id uuid not null,
  service_id uuid not null,
  preferred_worker_id uuid,
  desired_date date not null,
  window_start time not null,
  window_end time not null,
  expires_at timestamptz not null,
  status text not null default 'waiting' check (status in ('waiting','matched','contacted','booked','expired','cancelled')),
  matched_appointment_id uuid references public.dabbir_appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id,customer_id) references public.dabbir_customers(business_id,id) on delete cascade,
  foreign key (business_id,service_id) references public.dabbir_services(business_id,id) on delete cascade,
  foreign key (business_id,preferred_worker_id) references public.dabbir_workers(business_id,id) on delete set null,
  check (window_end > window_start)
);

create index if not exists dabbir_waitlist_match_idx
  on public.dabbir_waitlist_entries(business_id,service_id,desired_date,status,expires_at);

create table if not exists public.dabbir_workflow_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  appointment_id uuid references public.dabbir_appointments(id) on delete cascade,
  customer_id uuid references public.dabbir_customers(id) on delete cascade,
  waitlist_entry_id uuid references public.dabbir_waitlist_entries(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp','internal')),
  notification_type text not null check (notification_type in ('booking_confirmation','reminder_24h','reminder_2h','appointment_changed','appointment_cancelled','waitlist_offer','rebooking','follow_up')),
  template_name text,
  template_language text not null default 'ar' check (template_language in ('ar','en')),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','delivered','failed','cancelled','ambiguous')),
  provider_message_id text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,idempotency_key)
);

create index if not exists dabbir_workflow_notifications_due_idx
  on public.dabbir_workflow_notifications(status,scheduled_for,business_id)
  where status='pending';
create index if not exists dabbir_workflow_notifications_appointment_idx
  on public.dabbir_workflow_notifications(business_id,appointment_id,created_at desc)
  where appointment_id is not null;

create table if not exists public.dabbir_workflow_audit (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists dabbir_workflow_audit_entity_idx
  on public.dabbir_workflow_audit(business_id,entity_type,entity_id,created_at desc);
create index if not exists dabbir_workflow_audit_actor_idx
  on public.dabbir_workflow_audit(business_id,actor_user_id,created_at desc)
  where actor_user_id is not null;

-- Every new tenant-owned table is fail-closed under RLS.
alter table public.dabbir_workers enable row level security;
alter table public.dabbir_worker_services enable row level security;
alter table public.dabbir_worker_schedules enable row level security;
alter table public.dabbir_worker_time_off enable row level security;
alter table public.dabbir_salon_settings enable row level security;
alter table public.dabbir_appointment_services enable row level security;
alter table public.dabbir_workflow_status_history enable row level security;
alter table public.dabbir_commissions enable row level security;
alter table public.dabbir_operational_payments enable row level security;
alter table public.dabbir_customer_notes enable row level security;
alter table public.dabbir_waitlist_entries enable row level security;
alter table public.dabbir_workflow_notifications enable row level security;
alter table public.dabbir_workflow_audit enable row level security;

revoke all on public.dabbir_workers,public.dabbir_worker_services,public.dabbir_worker_schedules,
  public.dabbir_worker_time_off,public.dabbir_salon_settings,public.dabbir_appointment_services,
  public.dabbir_workflow_status_history,public.dabbir_commissions,public.dabbir_operational_payments,
  public.dabbir_customer_notes,public.dabbir_waitlist_entries,public.dabbir_workflow_notifications,
  public.dabbir_workflow_audit from public,anon,authenticated;

grant select,insert,update on public.dabbir_workers,public.dabbir_worker_services,
  public.dabbir_worker_schedules,public.dabbir_worker_time_off,public.dabbir_salon_settings,
  public.dabbir_appointment_services,public.dabbir_operational_payments,public.dabbir_customer_notes,
  public.dabbir_waitlist_entries to authenticated;
grant select on public.dabbir_workflow_status_history,public.dabbir_commissions,
  public.dabbir_workflow_notifications,public.dabbir_workflow_audit to authenticated;
grant usage,select on all sequences in schema public to authenticated;

create or replace function dabbir_private.salon_member_scope(p_business_id uuid,p_worker_id uuid,p_manage boolean default false)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select case
    when not dabbir_private.has_permission(p_business_id,case when p_manage then 'manage_appointments' else 'view_appointments' end) then false
    when not exists(select 1 from public.dabbir_businesses b where b.id=p_business_id and b.business_type='salon') then true
    when exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','manager')) then true
    else exists(select 1 from public.dabbir_workers w where w.business_id=p_business_id and w.id=p_worker_id and w.membership_user_id=(select auth.uid()) and w.status='active')
  end;
$$;
revoke all on function dabbir_private.salon_member_scope(uuid,uuid,boolean) from public,anon,authenticated;

create or replace function dabbir_private.salon_customer_scope(p_business_id uuid,p_customer_id uuid,p_manage boolean default false)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select case
    when not dabbir_private.has_permission(p_business_id,case when p_manage then 'edit_customers' else 'view_customers' end) then false
    when not exists(select 1 from public.dabbir_businesses b where b.id=p_business_id and b.business_type='salon') then true
    when exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','manager')) then true
    else exists(
      select 1
      from public.dabbir_workers w
      join public.dabbir_appointments a on a.business_id=w.business_id and a.worker_id=w.id
      where w.business_id=p_business_id and w.membership_user_id=(select auth.uid()) and w.status='active' and a.customer_id=p_customer_id
    )
  end;
$$;
revoke all on function dabbir_private.salon_customer_scope(uuid,uuid,boolean) from public,anon,authenticated;

-- Staff catalog and schedules are visible to appointment viewers, but only team managers may write them.
create policy dabbir_workers_select on public.dabbir_workers for select to authenticated
using (dabbir_private.has_permission(business_id,'view_appointments'));
create policy dabbir_workers_insert on public.dabbir_workers for insert to authenticated
with check (dabbir_private.has_permission(business_id,'manage_team'));
create policy dabbir_workers_update on public.dabbir_workers for update to authenticated
using (dabbir_private.has_permission(business_id,'manage_team'))
with check (dabbir_private.has_permission(business_id,'manage_team'));

create policy dabbir_worker_services_select on public.dabbir_worker_services for select to authenticated
using (dabbir_private.has_permission(business_id,'view_appointments'));
create policy dabbir_worker_services_write on public.dabbir_worker_services for all to authenticated
using (dabbir_private.has_permission(business_id,'manage_team'))
with check (dabbir_private.has_permission(business_id,'manage_team'));

create policy dabbir_worker_schedules_select on public.dabbir_worker_schedules for select to authenticated
using (dabbir_private.has_permission(business_id,'view_appointments'));
create policy dabbir_worker_schedules_write on public.dabbir_worker_schedules for all to authenticated
using (dabbir_private.has_permission(business_id,'manage_team'))
with check (dabbir_private.has_permission(business_id,'manage_team'));

create policy dabbir_worker_time_off_select on public.dabbir_worker_time_off for select to authenticated
using (dabbir_private.has_permission(business_id,'view_appointments'));
create policy dabbir_worker_time_off_write on public.dabbir_worker_time_off for all to authenticated
using (dabbir_private.has_permission(business_id,'manage_team'))
with check (dabbir_private.has_permission(business_id,'manage_team'));

create policy dabbir_salon_settings_select on public.dabbir_salon_settings for select to authenticated
using (dabbir_private.has_permission(business_id,'view_business'));
create policy dabbir_salon_settings_write on public.dabbir_salon_settings for all to authenticated
using (dabbir_private.has_permission(business_id,'manage_business'))
with check (dabbir_private.has_permission(business_id,'manage_business'));

create policy dabbir_appointment_services_select on public.dabbir_appointment_services for select to authenticated
using (exists(select 1 from public.dabbir_appointments a where a.business_id=dabbir_appointment_services.business_id and a.id=dabbir_appointment_services.appointment_id and dabbir_private.salon_member_scope(a.business_id,a.worker_id,false)));
create policy dabbir_appointment_services_write on public.dabbir_appointment_services for all to authenticated
using (dabbir_private.salon_member_scope(business_id,worker_id,true))
with check (dabbir_private.salon_member_scope(business_id,worker_id,true));

create policy dabbir_status_history_select on public.dabbir_workflow_status_history for select to authenticated
using (
  appointment_id is not null
  and exists(select 1 from public.dabbir_appointments a where a.business_id=dabbir_workflow_status_history.business_id and a.id=dabbir_workflow_status_history.appointment_id and dabbir_private.salon_member_scope(a.business_id,a.worker_id,false))
);
create policy dabbir_commissions_select on public.dabbir_commissions for select to authenticated
using (dabbir_private.has_permission(business_id,'view_analytics'));

create policy dabbir_operational_payments_select on public.dabbir_operational_payments for select to authenticated
using (
  dabbir_private.has_permission(business_id,'view_analytics')
  or exists(select 1 from public.dabbir_appointments a where a.business_id=dabbir_operational_payments.business_id and a.id=dabbir_operational_payments.appointment_id and dabbir_private.salon_member_scope(a.business_id,a.worker_id,true))
);
create policy dabbir_operational_payments_insert on public.dabbir_operational_payments for insert to authenticated
with check (
  exists(select 1 from public.dabbir_appointments a where a.business_id=dabbir_operational_payments.business_id and a.id=dabbir_operational_payments.appointment_id and dabbir_private.salon_member_scope(a.business_id,a.worker_id,true))
);
create policy dabbir_operational_payments_update on public.dabbir_operational_payments for update to authenticated
using (dabbir_private.has_permission(business_id,'manage_business'))
with check (dabbir_private.has_permission(business_id,'manage_business'));

create policy dabbir_customer_notes_select on public.dabbir_customer_notes for select to authenticated
using (dabbir_private.salon_customer_scope(business_id,customer_id,false));
create policy dabbir_customer_notes_write on public.dabbir_customer_notes for all to authenticated
using (dabbir_private.salon_customer_scope(business_id,customer_id,true))
with check (dabbir_private.salon_customer_scope(business_id,customer_id,true));

create policy dabbir_waitlist_select on public.dabbir_waitlist_entries for select to authenticated
using (dabbir_private.salon_customer_scope(business_id,customer_id,false));
create policy dabbir_waitlist_write on public.dabbir_waitlist_entries for all to authenticated
using (dabbir_private.salon_customer_scope(business_id,customer_id,true))
with check (dabbir_private.salon_customer_scope(business_id,customer_id,true));

create policy dabbir_notifications_select on public.dabbir_workflow_notifications for select to authenticated
using (
  appointment_id is null and dabbir_private.has_permission(business_id,'manage_business')
  or exists(select 1 from public.dabbir_appointments a where a.business_id=dabbir_workflow_notifications.business_id and a.id=dabbir_workflow_notifications.appointment_id and dabbir_private.salon_member_scope(a.business_id,a.worker_id,false))
);
create policy dabbir_workflow_audit_select on public.dabbir_workflow_audit for select to authenticated
using (dabbir_private.has_permission(business_id,'manage_business'));

drop policy if exists dabbir_customers_select on public.dabbir_customers;
create policy dabbir_customers_select on public.dabbir_customers for select to authenticated
using (dabbir_private.salon_customer_scope(business_id,id,false));

drop policy if exists dabbir_customers_insert on public.dabbir_customers;
create policy dabbir_customers_insert on public.dabbir_customers for insert to authenticated
with check (dabbir_private.has_permission(business_id,'edit_customers'));

drop policy if exists dabbir_customers_update on public.dabbir_customers;
create policy dabbir_customers_update on public.dabbir_customers for update to authenticated
using (dabbir_private.salon_customer_scope(business_id,id,true))
with check (dabbir_private.salon_customer_scope(business_id,id,true));

drop policy if exists dabbir_customers_delete on public.dabbir_customers;
create policy dabbir_customers_delete on public.dabbir_customers for delete to authenticated
using (dabbir_private.has_permission(business_id,'manage_business'));

-- Tighten salon appointment visibility to the assigned employee while preserving other verticals.
drop policy if exists dabbir_appointments_select on public.dabbir_appointments;
create policy dabbir_appointments_select on public.dabbir_appointments for select to authenticated
using (dabbir_private.salon_member_scope(business_id,worker_id,false));

drop policy if exists dabbir_appointments_insert on public.dabbir_appointments;
create policy dabbir_appointments_insert on public.dabbir_appointments for insert to authenticated
with check (dabbir_private.salon_member_scope(business_id,worker_id,true));

drop policy if exists dabbir_appointments_update on public.dabbir_appointments;
create policy dabbir_appointments_update on public.dabbir_appointments for update to authenticated
using (dabbir_private.salon_member_scope(business_id,worker_id,true))
with check (dabbir_private.salon_member_scope(business_id,worker_id,true));

drop policy if exists dabbir_appointments_delete on public.dabbir_appointments;
create policy dabbir_appointments_delete on public.dabbir_appointments for delete to authenticated
using (dabbir_private.salon_member_scope(business_id,worker_id,true));

create or replace function dabbir_private.capture_salon_admin_audit()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_before jsonb:=case when tg_op='INSERT' then null else to_jsonb(old) end;
  v_after jsonb:=case when tg_op='DELETE' then null else to_jsonb(new) end;
  v_business_id uuid:=coalesce((v_after->>'business_id')::uuid,(v_before->>'business_id')::uuid);
  v_entity_id uuid:=coalesce(nullif(v_after->>'id','')::uuid,nullif(v_before->>'id','')::uuid,nullif(v_after->>'worker_id','')::uuid,nullif(v_before->>'worker_id','')::uuid,nullif(v_after->>'service_id','')::uuid,nullif(v_before->>'service_id','')::uuid);
begin
  if not exists(select 1 from public.dabbir_businesses b where b.id=v_business_id and b.business_type='salon') then
    return case when tg_op='DELETE' then old else new end;
  end if;
  insert into public.dabbir_workflow_audit(business_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_business_id,(select auth.uid()),lower(tg_table_name)||'.'||lower(tg_op),tg_table_name,v_entity_id,v_before,v_after);
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function dabbir_private.capture_salon_admin_audit() from public,anon,authenticated;

create trigger dabbir_workers_salon_audit after insert or update or delete on public.dabbir_workers for each row execute function dabbir_private.capture_salon_admin_audit();
create trigger dabbir_worker_services_salon_audit after insert or update or delete on public.dabbir_worker_services for each row execute function dabbir_private.capture_salon_admin_audit();
create trigger dabbir_worker_schedules_salon_audit after insert or update or delete on public.dabbir_worker_schedules for each row execute function dabbir_private.capture_salon_admin_audit();
create trigger dabbir_worker_time_off_salon_audit after insert or update or delete on public.dabbir_worker_time_off for each row execute function dabbir_private.capture_salon_admin_audit();
create trigger dabbir_salon_settings_audit after insert or update or delete on public.dabbir_salon_settings for each row execute function dabbir_private.capture_salon_admin_audit();
create trigger dabbir_services_salon_audit after insert or update or delete on public.dabbir_services for each row execute function dabbir_private.capture_salon_admin_audit();

create or replace function dabbir_private.prevent_appointment_calendar_conflict()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_end timestamptz;
  v_timezone text := 'Asia/Dubai';
  v_local_start timestamp;
  v_local_end timestamp;
  v_weekday smallint;
  v_has_schedule boolean;
begin
  if new.starts_at is null or new.status in ('cancelled','completed','no_show') then return new; end if;
  v_end := coalesce(new.ends_at,new.starts_at+interval '60 minutes');
  if v_end <= new.starts_at then raise exception 'INVALID_APPOINTMENT_RANGE'; end if;

  select coalesce(s.timezone,'Asia/Dubai') into v_timezone
  from public.dabbir_salon_settings s where s.business_id=new.business_id;
  v_local_start := new.starts_at at time zone v_timezone;
  v_local_end := v_end at time zone v_timezone;
  v_weekday := extract(dow from v_local_start)::smallint;

  if new.worker_id is not null then
    select exists(select 1 from public.dabbir_worker_schedules s where s.business_id=new.business_id and s.worker_id=new.worker_id and s.active and s.schedule_type='work') into v_has_schedule;
    if v_has_schedule and not exists(
      select 1 from public.dabbir_worker_schedules s
      where s.business_id=new.business_id and s.worker_id=new.worker_id and s.weekday=v_weekday
        and s.active and s.schedule_type='work'
        and s.starts_at <= v_local_start::time and s.ends_at >= v_local_end::time
    ) then raise exception 'WORKER_OUTSIDE_SCHEDULE'; end if;

    if exists(
      select 1 from public.dabbir_worker_schedules s
      where s.business_id=new.business_id and s.worker_id=new.worker_id and s.weekday=v_weekday
        and s.active and s.schedule_type in ('break','unavailable')
        and s.starts_at < v_local_end::time and s.ends_at > v_local_start::time
    ) then raise exception 'WORKER_UNAVAILABLE'; end if;

    if exists(
      select 1 from public.dabbir_worker_time_off t
      where t.business_id=new.business_id and t.worker_id=new.worker_id
        and t.starts_at < v_end and t.ends_at > new.starts_at
    ) then raise exception 'WORKER_TIME_OFF'; end if;
  end if;

  if exists(
    select 1 from public.dabbir_calendar_busy_blocks b
    where b.business_id=new.business_id and b.starts_at < v_end and b.ends_at > new.starts_at
  ) then raise exception 'APPOINTMENT_CALENDAR_CONFLICT'; end if;

  if exists(
    select 1 from public.dabbir_appointments a
    where a.business_id=new.business_id
      and a.id <> coalesce(new.id,gen_random_uuid())
      and a.starts_at is not null
      and a.status not in ('cancelled','completed','no_show')
      and (new.worker_id is null or a.worker_id=new.worker_id)
      and a.starts_at < v_end
      and coalesce(a.ends_at,a.starts_at+interval '60 minutes') > new.starts_at
  ) then raise exception 'APPOINTMENT_TIME_CONFLICT'; end if;
  return new;
end;
$$;
revoke all on function dabbir_private.prevent_appointment_calendar_conflict() from public,anon,authenticated;

drop trigger if exists dabbir_appointment_calendar_conflict_guard on public.dabbir_appointments;
create trigger dabbir_appointment_calendar_conflict_guard
before insert or update of starts_at,ends_at,status,worker_id on public.dabbir_appointments
for each row execute function dabbir_private.prevent_appointment_calendar_conflict();

create or replace function dabbir_private.capture_appointment_workflow()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_action text;
  v_settings public.dabbir_salon_settings%rowtype;
begin
  if tg_op='INSERT' then
    insert into public.dabbir_workflow_status_history(business_id,workflow_type,entity_id,appointment_id,to_status,actor_user_id)
    values(new.business_id,'appointment',new.id,new.id,new.status,(select auth.uid()));
    v_action := 'booking.created';
  elsif new.status is distinct from old.status then
    insert into public.dabbir_workflow_status_history(business_id,workflow_type,entity_id,appointment_id,from_status,to_status,actor_user_id)
    values(new.business_id,'appointment',new.id,new.id,old.status,new.status,(select auth.uid()));
    v_action := case new.status when 'cancelled' then 'booking.cancelled' when 'no_show' then 'booking.no_show' when 'completed' then 'booking.completed' else 'booking.status_changed' end;
  elsif new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then v_action := 'booking.rescheduled';
  elsif new.worker_id is distinct from old.worker_id then v_action := 'booking.worker_changed';
  elsif new.quoted_price_aed is distinct from old.quoted_price_aed or new.discount_aed is distinct from old.discount_aed then v_action := 'booking.price_changed';
  else v_action := 'booking.updated'; end if;

  insert into public.dabbir_workflow_audit(business_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(new.business_id,(select auth.uid()),v_action,'appointment',new.id,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));

  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
    update public.dabbir_appointment_services set completed_at=coalesce(completed_at,now()),updated_at=now()
    where business_id=new.business_id and appointment_id=new.id;

    insert into public.dabbir_commissions(
      business_id,worker_id,appointment_id,appointment_service_id,commission_type,commission_value,
      revenue_aed,commission_aed,salon_gross_aed
    )
    select l.business_id,l.worker_id,l.appointment_id,l.id,
      coalesce(l.commission_type,ws.commission_type,s.commission_type,w.commission_type,'percentage'),
      coalesce(l.commission_value,ws.commission_value,s.commission_value,w.commission_value,0),
      greatest(0,l.unit_price_aed-l.discount_aed),
      round(case coalesce(l.commission_type,ws.commission_type,s.commission_type,w.commission_type,'percentage')
        when 'fixed' then least(greatest(0,l.unit_price_aed-l.discount_aed),coalesce(l.commission_value,ws.commission_value,s.commission_value,w.commission_value,0))
        else greatest(0,l.unit_price_aed-l.discount_aed)*coalesce(l.commission_value,ws.commission_value,s.commission_value,w.commission_value,0)/100 end,2),
      greatest(0,l.unit_price_aed-l.discount_aed)-round(case coalesce(l.commission_type,ws.commission_type,s.commission_type,w.commission_type,'percentage')
        when 'fixed' then least(greatest(0,l.unit_price_aed-l.discount_aed),coalesce(l.commission_value,ws.commission_value,s.commission_value,w.commission_value,0))
        else greatest(0,l.unit_price_aed-l.discount_aed)*coalesce(l.commission_value,ws.commission_value,s.commission_value,w.commission_value,0)/100 end,2)
    from public.dabbir_appointment_services l
    join public.dabbir_workers w on w.business_id=l.business_id and w.id=l.worker_id
    join public.dabbir_services s on s.business_id=l.business_id and s.id=l.service_id
    left join public.dabbir_worker_services ws on ws.business_id=l.business_id and ws.worker_id=l.worker_id and ws.service_id=l.service_id
    where l.business_id=new.business_id and l.appointment_id=new.id and l.worker_id is not null
    on conflict (appointment_service_id) do update set status='earned',updated_at=now();
  elsif tg_op='UPDATE' and old.status='completed' and new.status<>'completed' then
    update public.dabbir_commissions set status='void',updated_at=now()
    where business_id=new.business_id and appointment_id=new.id;
  end if;

  if exists(select 1 from public.dabbir_businesses b where b.id=new.business_id and b.business_type='salon') then
    select * into v_settings from public.dabbir_salon_settings where business_id=new.business_id;
    if tg_op='INSERT' then
      if coalesce(v_settings.reminder_on_booking,true) then
        insert into public.dabbir_workflow_notifications(business_id,appointment_id,customer_id,notification_type,scheduled_for,idempotency_key,payload)
        values(new.business_id,new.id,new.customer_id,'booking_confirmation',now(),'appointment:'||new.id||':booking_confirmation',jsonb_build_object('appointment_id',new.id)) on conflict do nothing;
      end if;
      if coalesce(v_settings.reminder_24h,true) and new.starts_at>now()+interval '24 hours' then
        insert into public.dabbir_workflow_notifications(business_id,appointment_id,customer_id,notification_type,scheduled_for,idempotency_key,payload)
        values(new.business_id,new.id,new.customer_id,'reminder_24h',new.starts_at-interval '24 hours','appointment:'||new.id||':reminder_24h',jsonb_build_object('appointment_id',new.id)) on conflict do nothing;
      end if;
      if coalesce(v_settings.reminder_2h,true) and new.starts_at>now()+interval '2 hours' then
        insert into public.dabbir_workflow_notifications(business_id,appointment_id,customer_id,notification_type,scheduled_for,idempotency_key,payload)
        values(new.business_id,new.id,new.customer_id,'reminder_2h',new.starts_at-interval '2 hours','appointment:'||new.id||':reminder_2h',jsonb_build_object('appointment_id',new.id)) on conflict do nothing;
      end if;
    elsif new.status='cancelled' and old.status is distinct from 'cancelled' then
      update public.dabbir_workflow_notifications set status='cancelled',updated_at=now()
      where business_id=new.business_id and appointment_id=new.id and status='pending';
      insert into public.dabbir_workflow_notifications(business_id,appointment_id,customer_id,notification_type,scheduled_for,idempotency_key,payload)
      values(new.business_id,new.id,new.customer_id,'appointment_cancelled',now(),'appointment:'||new.id||':cancelled',jsonb_build_object('appointment_id',new.id)) on conflict do nothing;
    elsif new.starts_at is distinct from old.starts_at or new.worker_id is distinct from old.worker_id then
      update public.dabbir_workflow_notifications set status='cancelled',updated_at=now()
      where business_id=new.business_id and appointment_id=new.id and status='pending' and notification_type in ('reminder_24h','reminder_2h');
      insert into public.dabbir_workflow_notifications(business_id,appointment_id,customer_id,notification_type,scheduled_for,idempotency_key,payload)
      values(new.business_id,new.id,new.customer_id,'appointment_changed',now(),'appointment:'||new.id||':changed:'||extract(epoch from new.updated_at)::bigint,jsonb_build_object('appointment_id',new.id)) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.capture_appointment_workflow() from public,anon,authenticated;

drop trigger if exists dabbir_appointment_workflow_capture on public.dabbir_appointments;
create trigger dabbir_appointment_workflow_capture
after insert or update on public.dabbir_appointments
for each row execute function dabbir_private.capture_appointment_workflow();

create or replace function dabbir_private.sync_appointment_payment_status()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_paid numeric;v_due numeric;
begin
  select coalesce(sum(case when status='paid' then amount_aed when status='refunded' then -amount_aed else 0 end),0)
    into v_paid from public.dabbir_operational_payments where business_id=new.business_id and appointment_id=new.appointment_id;
  select greatest(0,quoted_price_aed-discount_aed) into v_due from public.dabbir_appointments where business_id=new.business_id and id=new.appointment_id;
  update public.dabbir_appointments set payment_status=case when v_paid<=0 then 'unpaid' when v_paid<v_due then 'partial' else 'paid' end,updated_at=now()
  where business_id=new.business_id and id=new.appointment_id;
  return new;
end;
$$;
revoke all on function dabbir_private.sync_appointment_payment_status() from public,anon,authenticated;

drop trigger if exists dabbir_operational_payment_status_sync on public.dabbir_operational_payments;
create trigger dabbir_operational_payment_status_sync
after insert or update of status,amount_aed on public.dabbir_operational_payments
for each row execute function dabbir_private.sync_appointment_payment_status();

create or replace function public.dabbir_salon_quick_book(
  p_business_id uuid,p_customer_name text,p_customer_phone text,p_service_id uuid,p_worker_id uuid,
  p_starts_at timestamptz,p_discount_aed numeric default 0,p_notes text default '',p_source text default 'internal'
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_customer_id uuid;v_duration integer;v_price numeric;v_name_ar text;v_name_en text;v_appointment_id uuid;v_end timestamptz;
begin
  if not dabbir_private.has_permission(p_business_id,'manage_appointments') then raise exception 'APPOINTMENT_MANAGEMENT_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_businesses where id=p_business_id and business_type='salon') then raise exception 'SALON_MODE_REQUIRED'; end if;
  if p_starts_at is null or p_starts_at<=now() then raise exception 'INVALID_START_TIME'; end if;
  if p_source not in ('internal','web','whatsapp','phone','walk_in','rebook','waitlist','calendar_sync') then raise exception 'INVALID_BOOKING_SOURCE'; end if;

  select coalesce(ws.duration_minutes,s.duration_minutes),coalesce(ws.price_aed,s.price_aed),coalesce(s.name_ar,s.name),coalesce(s.name_en,s.name)
    into v_duration,v_price,v_name_ar,v_name_en
  from public.dabbir_services s
  join public.dabbir_worker_services ws on ws.business_id=s.business_id and ws.service_id=s.id and ws.worker_id=p_worker_id and ws.active
  join public.dabbir_workers w on w.business_id=s.business_id and w.id=p_worker_id and w.status='active'
  where s.business_id=p_business_id and s.id=p_service_id and s.active;
  if v_duration is null then raise exception 'WORKER_SERVICE_NOT_AVAILABLE'; end if;
  if coalesce(p_discount_aed,0)<0 or coalesce(p_discount_aed,0)>v_price then raise exception 'INVALID_DISCOUNT'; end if;
  v_end:=p_starts_at+make_interval(mins=>v_duration);

  if nullif(trim(coalesce(p_customer_phone,'')),'') is not null then
    select id into v_customer_id from public.dabbir_customers where business_id=p_business_id and phone_e164=trim(p_customer_phone) limit 1;
  end if;
  if v_customer_id is null then
    insert into public.dabbir_customers(business_id,display_name,phone_e164,lead_status,metadata)
    values(p_business_id,left(trim(p_customer_name),120),nullif(trim(p_customer_phone),''),'converted',jsonb_build_object('source','salon_quick_booking')) returning id into v_customer_id;
  else
    update public.dabbir_customers set display_name=coalesce(nullif(left(trim(p_customer_name),120),''),display_name),updated_at=now() where business_id=p_business_id and id=v_customer_id;
  end if;

  insert into public.dabbir_appointments(business_id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,quoted_price_aed,discount_aed,notes,booking_source,payment_status)
  values(p_business_id,v_customer_id,p_service_id,p_worker_id,p_starts_at,v_end,'new',false,v_price,coalesce(p_discount_aed,0),left(coalesce(p_notes,''),2000),p_source,'unpaid') returning id into v_appointment_id;

  insert into public.dabbir_appointment_services(business_id,appointment_id,service_id,worker_id,service_name_ar,service_name_en,duration_minutes,unit_price_aed,discount_aed)
  values(p_business_id,v_appointment_id,p_service_id,p_worker_id,v_name_ar,v_name_en,v_duration,v_price,coalesce(p_discount_aed,0));

  return jsonb_build_object('appointment_id',v_appointment_id,'customer_id',v_customer_id,'starts_at',p_starts_at,'ends_at',v_end,'status','new');
end;
$$;

create or replace function public.dabbir_salon_transition_appointment(p_business_id uuid,p_appointment_id uuid,p_status text)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_current public.dabbir_appointments%rowtype;v_allowed boolean;
begin
  if not dabbir_private.has_permission(p_business_id,'manage_appointments') then raise exception 'APPOINTMENT_MANAGEMENT_REQUIRED'; end if;
  select * into v_current from public.dabbir_appointments where business_id=p_business_id and id=p_appointment_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_allowed:=case v_current.status
    when 'new' then p_status in ('confirmed','cancelled','no_show')
    when 'confirmed' then p_status in ('arrived','cancelled','no_show')
    when 'arrived' then p_status in ('in_progress','cancelled','no_show')
    when 'in_progress' then p_status in ('completed','cancelled')
    when 'completed' then false
    when 'cancelled' then false
    when 'no_show' then false else false end;
  if not v_allowed then raise exception 'INVALID_STATUS_TRANSITION'; end if;
  update public.dabbir_appointments set status=p_status,updated_at=now() where business_id=p_business_id and id=p_appointment_id;
  return jsonb_build_object('appointment_id',p_appointment_id,'from_status',v_current.status,'to_status',p_status);
end;
$$;

create or replace function public.dabbir_salon_rebook(p_business_id uuid,p_appointment_id uuid,p_starts_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_source public.dabbir_appointments%rowtype;v_duration integer;v_new_id uuid;
begin
  if not dabbir_private.has_permission(p_business_id,'manage_appointments') then raise exception 'APPOINTMENT_MANAGEMENT_REQUIRED'; end if;
  select * into v_source from public.dabbir_appointments where business_id=p_business_id and id=p_appointment_id and status='completed';
  if not found then raise exception 'COMPLETED_APPOINTMENT_REQUIRED'; end if;
  v_duration:=greatest(5,extract(epoch from (v_source.ends_at-v_source.starts_at))/60)::integer;
  insert into public.dabbir_appointments(business_id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,quoted_price_aed,discount_aed,notes,booking_source,payment_status)
  values(p_business_id,v_source.customer_id,v_source.service_id,v_source.worker_id,p_starts_at,p_starts_at+make_interval(mins=>v_duration),'new',false,v_source.quoted_price_aed,0,'','rebook','unpaid') returning id into v_new_id;
  insert into public.dabbir_appointment_services(business_id,appointment_id,service_id,worker_id,service_name_ar,service_name_en,duration_minutes,unit_price_aed,discount_aed,commission_type,commission_value)
  select business_id,v_new_id,service_id,worker_id,service_name_ar,service_name_en,duration_minutes,unit_price_aed,0,commission_type,commission_value
  from public.dabbir_appointment_services where business_id=p_business_id and appointment_id=p_appointment_id;
  return jsonb_build_object('appointment_id',v_new_id,'source_appointment_id',p_appointment_id,'starts_at',p_starts_at);
end;
$$;

create or replace function public.dabbir_salon_customer_360(p_business_id uuid,p_customer_id uuid)
returns jsonb
language sql
security invoker
stable
set search_path=public,pg_temp
as $$
select jsonb_build_object(
  'customer',to_jsonb(c),
  'summary',jsonb_build_object(
    'visits',count(a.id) filter(where a.status='completed'),
    'no_show',count(a.id) filter(where a.status='no_show'),
    'cancelled',count(a.id) filter(where a.status='cancelled'),
    'total_bookings',count(a.id),
    'no_show_rate',case when count(a.id)=0 then 0 else round(100.0*count(a.id) filter(where a.status='no_show')/count(a.id),1) end,
    'last_visit',max(a.starts_at) filter(where a.status='completed'),
    'total_spend_aed',coalesce((select sum(p.amount_aed) from public.dabbir_operational_payments p where p.business_id=p_business_id and p.customer_id=p_customer_id and p.status='paid'),0)
  ),
  'appointments',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at desc) from public.dabbir_appointments x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.dabbir_operational_payments x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
  'notes',coalesce((select jsonb_agg(to_jsonb(x) order by x.important desc,x.created_at desc) from public.dabbir_customer_notes x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb)
)
from public.dabbir_customers c
left join public.dabbir_appointments a on a.business_id=c.business_id and a.customer_id=c.id
where c.business_id=p_business_id and c.id=p_customer_id
group by c.id;
$$;

create or replace function public.dabbir_salon_today(p_business_id uuid,p_day date default current_date)
returns jsonb
language sql
security invoker
stable
set search_path=public,pg_temp
as $$
with settings as (select coalesce((select timezone from public.dabbir_salon_settings where business_id=p_business_id),'Asia/Dubai') tz),
bounds as (select p_day::timestamp at time zone tz as s,(p_day+1)::timestamp at time zone tz as e from settings),
a as (select x.* from public.dabbir_appointments x,bounds b where x.business_id=p_business_id and x.starts_at>=b.s and x.starts_at<b.e),
c as (select coalesce(sum(revenue_aed),0) revenue,coalesce(sum(commission_aed),0) commission from public.dabbir_commissions,bounds b where business_id=p_business_id and status='earned' and generated_at>=b.s and generated_at<b.e)
select jsonb_build_object(
  'day',p_day,
  'bookings',count(*),
  'new',count(*) filter(where status='new'),
  'confirmed',count(*) filter(where status='confirmed'),
  'arrived',count(*) filter(where status='arrived'),
  'in_progress',count(*) filter(where status='in_progress'),
  'completed',count(*) filter(where status='completed'),
  'cancelled',count(*) filter(where status='cancelled'),
  'no_show',count(*) filter(where status='no_show'),
  'expected_revenue_aed',coalesce(sum(greatest(0,quoted_price_aed-discount_aed)) filter(where status not in ('cancelled','no_show')),0),
  'realized_revenue_aed',(select revenue from c),
  'commissions_aed',(select commission from c),
  'unconfirmed',count(*) filter(where status='new'),
  'appointments',coalesce(jsonb_agg(to_jsonb(a) order by starts_at) filter(where a.id is not null),'[]'::jsonb)
) from a;
$$;

create or replace function public.dabbir_salon_waitlist_matches(p_business_id uuid,p_appointment_id uuid)
returns setof public.dabbir_waitlist_entries
language sql
security invoker
stable
set search_path=public,pg_temp
as $$
  select w.* from public.dabbir_waitlist_entries w
  join public.dabbir_appointments a on a.business_id=w.business_id and a.id=p_appointment_id
  where w.business_id=p_business_id and a.business_id=p_business_id and a.status='cancelled'
    and w.status='waiting' and w.expires_at>now() and w.service_id=a.service_id
    and (w.preferred_worker_id is null or w.preferred_worker_id=a.worker_id)
    and w.desired_date=(a.starts_at at time zone coalesce((select timezone from public.dabbir_salon_settings where business_id=p_business_id),'Asia/Dubai'))::date
    and w.window_start <= (a.starts_at at time zone coalesce((select timezone from public.dabbir_salon_settings where business_id=p_business_id),'Asia/Dubai'))::time
    and w.window_end >= (a.ends_at at time zone coalesce((select timezone from public.dabbir_salon_settings where business_id=p_business_id),'Asia/Dubai'))::time
  order by w.created_at
  limit 50;
$$;

revoke all on function public.dabbir_salon_quick_book(uuid,text,text,uuid,uuid,timestamptz,numeric,text,text) from public,anon;
revoke all on function public.dabbir_salon_transition_appointment(uuid,uuid,text) from public,anon;
revoke all on function public.dabbir_salon_rebook(uuid,uuid,timestamptz) from public,anon;
revoke all on function public.dabbir_salon_customer_360(uuid,uuid) from public,anon;
revoke all on function public.dabbir_salon_today(uuid,date) from public,anon;
revoke all on function public.dabbir_salon_waitlist_matches(uuid,uuid) from public,anon;
grant execute on function public.dabbir_salon_quick_book(uuid,text,text,uuid,uuid,timestamptz,numeric,text,text) to authenticated;
grant execute on function public.dabbir_salon_transition_appointment(uuid,uuid,text) to authenticated;
grant execute on function public.dabbir_salon_rebook(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.dabbir_salon_customer_360(uuid,uuid) to authenticated;
grant execute on function public.dabbir_salon_today(uuid,date) to authenticated;
grant execute on function public.dabbir_salon_waitlist_matches(uuid,uuid) to authenticated;

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
  update public.dabbir_workflow_notifications
  set status='ambiguous',last_error='STALE_PROCESSING_REQUIRES_RECONCILIATION',updated_at=now()
  where status='processing' and updated_at<now()-interval '15 minutes';

  return query
  with candidates as (
    select n.id
    from public.dabbir_workflow_notifications n
    where n.status='pending' and n.scheduled_for<=now() and n.scheduled_for>now()-interval '2 days'
    order by n.scheduled_for,n.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  ), claimed as (
    update public.dabbir_workflow_notifications n
    set status='processing',updated_at=now(),last_error=null
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
declare v_business_id uuid;v_updated boolean;
begin
  if p_status not in ('sent','failed','ambiguous') then raise exception 'INVALID_NOTIFICATION_FINAL_STATUS'; end if;
  update public.dabbir_workflow_notifications
  set status=p_status,provider_message_id=left(nullif(p_provider_message_id,''),320),
      sent_at=case when p_status='sent' then now() else sent_at end,
      last_error=left(nullif(p_error,''),500),updated_at=now()
  where id=p_notification_id and status='processing'
  returning business_id into v_business_id;
  v_updated:=found;
  if v_updated then
    insert into public.dabbir_workflow_audit(business_id,action,entity_type,entity_id,after_data)
    values(v_business_id,'notification.'||p_status,'workflow_notification',p_notification_id,
      jsonb_build_object('status',p_status,'provider_message_id',p_provider_message_id,'error',p_error));
  end if;
  return v_updated;
end;
$$;

revoke all on function public.dabbir_claim_workflow_notifications(integer) from public,anon,authenticated;
revoke all on function public.dabbir_finalize_workflow_notification(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_claim_workflow_notifications(integer) to service_role;
grant execute on function public.dabbir_finalize_workflow_notification(uuid,text,text,text) to service_role;

commit;
