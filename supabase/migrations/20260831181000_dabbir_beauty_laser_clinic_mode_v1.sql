begin;

-- DABBIR Beauty & Laser Clinic Mode v1
-- Extends the reusable booking engine with clinic-specific operational records.
-- Deliberately excludes all photo/image storage.

create table if not exists public.dabbir_clinic_settings (
  business_id uuid primary key references public.dabbir_businesses(id) on delete cascade,
  timezone text not null default 'Asia/Dubai',
  default_next_session_days integer not null default 28 check (default_next_session_days between 1 and 365),
  next_session_reminder_days_before integer not null default 1 check (next_session_reminder_days_before between 0 and 30),
  require_service_consent boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.dabbir_clinic_settings(business_id)
select id from public.dabbir_businesses where business_type='clinic'
on conflict (business_id) do nothing;

create table if not exists public.dabbir_clinic_devices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  model text not null default '' check (char_length(model) <= 120),
  device_type text not null default 'laser' check (device_type in ('laser','aesthetic','other')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (octet_length(metadata::text) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id)
);
create index if not exists dabbir_clinic_devices_business_active_idx
  on public.dabbir_clinic_devices(business_id,active,name);

create table if not exists public.dabbir_clinic_packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  customer_id uuid not null,
  service_id uuid not null,
  package_name text not null check (char_length(package_name) between 2 and 160),
  total_sessions integer not null check (total_sessions between 1 and 100),
  used_sessions integer not null default 0 check (used_sessions between 0 and 100),
  price_aed numeric(12,2) not null default 0 check (price_aed between 0 and 10000000),
  status text not null default 'active' check (status in ('active','completed','expired','cancelled')),
  starts_at date not null default current_date,
  expires_at date,
  metadata jsonb not null default '{}'::jsonb check (octet_length(metadata::text) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id,customer_id) references public.dabbir_customers(business_id,id) on delete cascade,
  foreign key (business_id,service_id) references public.dabbir_services(business_id,id) on delete restrict,
  unique (business_id,id),
  check (used_sessions <= total_sessions),
  check (expires_at is null or expires_at >= starts_at)
);
create index if not exists dabbir_clinic_packages_customer_status_idx
  on public.dabbir_clinic_packages(business_id,customer_id,status,expires_at);

create table if not exists public.dabbir_clinic_consent_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  title_ar text not null check (char_length(title_ar) between 2 and 160),
  title_en text not null default '' check (char_length(title_en) <= 160),
  body_ar text not null check (char_length(body_ar) between 10 and 12000),
  body_en text not null default '' check (char_length(body_en) <= 12000),
  version text not null default '1.0' check (char_length(version) between 1 and 32),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id)
);
create index if not exists dabbir_clinic_consent_templates_active_idx
  on public.dabbir_clinic_consent_templates(business_id,active,updated_at desc);

create table if not exists public.dabbir_clinic_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  appointment_id uuid not null,
  customer_id uuid not null,
  service_id uuid not null,
  worker_id uuid,
  device_id uuid,
  package_id uuid,
  session_type text not null default 'treatment' check (session_type in ('consultation','test_patch','treatment','follow_up','maintenance','other')),
  treatment_area text not null default '' check (char_length(treatment_area) <= 240),
  session_number integer check (session_number is null or session_number between 1 and 100),
  device_settings jsonb not null default '{}'::jsonb check (octet_length(device_settings::text) <= 8192),
  notes_before text not null default '' check (char_length(notes_before) <= 4000),
  notes_after text not null default '' check (char_length(notes_after) <= 4000),
  next_session_at timestamptz,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id,appointment_id) references public.dabbir_appointments(business_id,id) on delete cascade,
  foreign key (business_id,customer_id) references public.dabbir_customers(business_id,id) on delete cascade,
  foreign key (business_id,service_id) references public.dabbir_services(business_id,id) on delete restrict,
  foreign key (business_id,worker_id) references public.dabbir_workers(business_id,id) on delete restrict,
  foreign key (business_id,device_id) references public.dabbir_clinic_devices(business_id,id) on delete set null,
  foreign key (business_id,package_id) references public.dabbir_clinic_packages(business_id,id) on delete set null,
  unique (business_id,appointment_id),
  unique (business_id,id)
);
create index if not exists dabbir_clinic_sessions_customer_date_idx
  on public.dabbir_clinic_sessions(business_id,customer_id,created_at desc);
create index if not exists dabbir_clinic_sessions_package_status_idx
  on public.dabbir_clinic_sessions(business_id,package_id,status,created_at);

create or replace function dabbir_private.clinic_session_guard()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_type text;
  v_simulated boolean := false;
  v_allowed boolean := false;
begin
  select business_type into v_type from public.dabbir_businesses where id=new.business_id;
  if v_type is distinct from 'clinic' then
    raise exception 'CLINIC_MODE_REQUIRED';
  end if;

  select coalesce(a.simulated,false)
    into v_simulated
  from public.dabbir_appointments a
  where a.business_id=new.business_id and a.id=new.appointment_id;

  select coalesce(g.production_patient_data_allowed,false)
    into v_allowed
  from public.dabbir_patient_data_gate g
  where g.business_id=new.business_id;

  if not coalesce(v_simulated,false) and not coalesce(v_allowed,false) then
    raise exception 'PATIENT_DATA_GATE_CLOSED';
  end if;

  if new.package_id is not null and new.session_number is null then
    select least(p.total_sessions, coalesce(count(s.id),0)::integer + 1)
      into new.session_number
    from public.dabbir_clinic_packages p
    left join public.dabbir_clinic_sessions s
      on s.business_id=p.business_id and s.package_id=p.id and s.status='completed'
    where p.business_id=new.business_id and p.id=new.package_id
    group by p.total_sessions;
  end if;

  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists dabbir_clinic_session_guard_trg on public.dabbir_clinic_sessions;
create trigger dabbir_clinic_session_guard_trg
before insert or update on public.dabbir_clinic_sessions
for each row execute function dabbir_private.clinic_session_guard();

create or replace function dabbir_private.clinic_package_recount()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  v_old := case when tg_op in ('UPDATE','DELETE') then old.package_id else null end;
  v_new := case when tg_op in ('INSERT','UPDATE') then new.package_id else null end;

  if v_old is not null then
    update public.dabbir_clinic_packages p
    set used_sessions=least(p.total_sessions,(
          select count(*) from public.dabbir_clinic_sessions s
          where s.business_id=p.business_id and s.package_id=p.id and s.status='completed'
        )),
        status=case
          when p.status='cancelled' then p.status
          when (
            select count(*) from public.dabbir_clinic_sessions s
            where s.business_id=p.business_id and s.package_id=p.id and s.status='completed'
          ) >= p.total_sessions then 'completed'
          else 'active'
        end,
        updated_at=now()
    where p.business_id=coalesce(old.business_id,new.business_id) and p.id=v_old;
  end if;

  if v_new is not null and v_new is distinct from v_old then
    update public.dabbir_clinic_packages p
    set used_sessions=least(p.total_sessions,(
          select count(*) from public.dabbir_clinic_sessions s
          where s.business_id=p.business_id and s.package_id=p.id and s.status='completed'
        )),
        status=case
          when p.status='cancelled' then p.status
          when (
            select count(*) from public.dabbir_clinic_sessions s
            where s.business_id=p.business_id and s.package_id=p.id and s.status='completed'
          ) >= p.total_sessions then 'completed'
          else 'active'
        end,
        updated_at=now()
    where p.business_id=coalesce(new.business_id,old.business_id) and p.id=v_new;
  elsif v_new is not null then
    update public.dabbir_clinic_packages p
    set used_sessions=least(p.total_sessions,(
          select count(*) from public.dabbir_clinic_sessions s
          where s.business_id=p.business_id and s.package_id=p.id and s.status='completed'
        )),
        status=case
          when p.status='cancelled' then p.status
          when (
            select count(*) from public.dabbir_clinic_sessions s
            where s.business_id=p.business_id and s.package_id=p.id and s.status='completed'
          ) >= p.total_sessions then 'completed'
          else 'active'
        end,
        updated_at=now()
    where p.business_id=coalesce(new.business_id,old.business_id) and p.id=v_new;
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists dabbir_clinic_package_recount_trg on public.dabbir_clinic_sessions;
create trigger dabbir_clinic_package_recount_trg
after insert or update or delete on public.dabbir_clinic_sessions
for each row execute function dabbir_private.clinic_package_recount();

alter table public.dabbir_clinic_settings enable row level security;
alter table public.dabbir_clinic_devices enable row level security;
alter table public.dabbir_clinic_packages enable row level security;
alter table public.dabbir_clinic_consent_templates enable row level security;
alter table public.dabbir_clinic_sessions enable row level security;

revoke all on public.dabbir_clinic_settings from anon;
revoke all on public.dabbir_clinic_devices from anon;
revoke all on public.dabbir_clinic_packages from anon;
revoke all on public.dabbir_clinic_consent_templates from anon;
revoke all on public.dabbir_clinic_sessions from anon;

grant select,insert,update,delete on public.dabbir_clinic_settings to authenticated;
grant select,insert,update,delete on public.dabbir_clinic_devices to authenticated;
grant select,insert,update,delete on public.dabbir_clinic_packages to authenticated;
grant select,insert,update,delete on public.dabbir_clinic_consent_templates to authenticated;
grant select,insert,update,delete on public.dabbir_clinic_sessions to authenticated;

drop policy if exists dabbir_clinic_settings_select on public.dabbir_clinic_settings;
create policy dabbir_clinic_settings_select on public.dabbir_clinic_settings
for select to authenticated
using (dabbir_private.has_permission(business_id,'view_business'));

drop policy if exists dabbir_clinic_settings_insert on public.dabbir_clinic_settings;
create policy dabbir_clinic_settings_insert on public.dabbir_clinic_settings
for insert to authenticated
with check (dabbir_private.has_permission(business_id,'manage_business'));

drop policy if exists dabbir_clinic_settings_update on public.dabbir_clinic_settings;
create policy dabbir_clinic_settings_update on public.dabbir_clinic_settings
for update to authenticated
using (dabbir_private.has_permission(business_id,'manage_business'))
with check (dabbir_private.has_permission(business_id,'manage_business'));

drop policy if exists dabbir_clinic_settings_delete on public.dabbir_clinic_settings;
create policy dabbir_clinic_settings_delete on public.dabbir_clinic_settings
for delete to authenticated
using (dabbir_private.has_permission(business_id,'manage_business'));

drop policy if exists dabbir_clinic_devices_select on public.dabbir_clinic_devices;
create policy dabbir_clinic_devices_select on public.dabbir_clinic_devices
for select to authenticated
using (dabbir_private.has_permission(business_id,'view_appointments'));

drop policy if exists dabbir_clinic_devices_insert on public.dabbir_clinic_devices;
create policy dabbir_clinic_devices_insert on public.dabbir_clinic_devices
for insert to authenticated
with check (dabbir_private.has_permission(business_id,'manage_team'));

drop policy if exists dabbir_clinic_devices_update on public.dabbir_clinic_devices;
create policy dabbir_clinic_devices_update on public.dabbir_clinic_devices
for update to authenticated
using (dabbir_private.has_permission(business_id,'manage_team'))
with check (dabbir_private.has_permission(business_id,'manage_team'));

drop policy if exists dabbir_clinic_devices_delete on public.dabbir_clinic_devices;
create policy dabbir_clinic_devices_delete on public.dabbir_clinic_devices
for delete to authenticated
using (dabbir_private.has_permission(business_id,'manage_team'));

drop policy if exists dabbir_clinic_packages_select on public.dabbir_clinic_packages;
create policy dabbir_clinic_packages_select on public.dabbir_clinic_packages
for select to authenticated
using (dabbir_private.has_permission(business_id,'view_appointments'));

drop policy if exists dabbir_clinic_packages_insert on public.dabbir_clinic_packages;
create policy dabbir_clinic_packages_insert on public.dabbir_clinic_packages
for insert to authenticated
with check (dabbir_private.has_permission(business_id,'manage_appointments'));

drop policy if exists dabbir_clinic_packages_update on public.dabbir_clinic_packages;
create policy dabbir_clinic_packages_update on public.dabbir_clinic_packages
for update to authenticated
using (dabbir_private.has_permission(business_id,'manage_appointments'))
with check (dabbir_private.has_permission(business_id,'manage_appointments'));

drop policy if exists dabbir_clinic_packages_delete on public.dabbir_clinic_packages;
create policy dabbir_clinic_packages_delete on public.dabbir_clinic_packages
for delete to authenticated
using (dabbir_private.has_permission(business_id,'manage_appointments'));

drop policy if exists dabbir_clinic_consent_templates_select on public.dabbir_clinic_consent_templates;
create policy dabbir_clinic_consent_templates_select on public.dabbir_clinic_consent_templates
for select to authenticated
using (dabbir_private.has_permission(business_id,'view_customers'));

drop policy if exists dabbir_clinic_consent_templates_insert on public.dabbir_clinic_consent_templates;
create policy dabbir_clinic_consent_templates_insert on public.dabbir_clinic_consent_templates
for insert to authenticated
with check (dabbir_private.has_permission(business_id,'manage_business'));

drop policy if exists dabbir_clinic_consent_templates_update on public.dabbir_clinic_consent_templates;
create policy dabbir_clinic_consent_templates_update on public.dabbir_clinic_consent_templates
for update to authenticated
using (dabbir_private.has_permission(business_id,'manage_business'))
with check (dabbir_private.has_permission(business_id,'manage_business'));

drop policy if exists dabbir_clinic_consent_templates_delete on public.dabbir_clinic_consent_templates;
create policy dabbir_clinic_consent_templates_delete on public.dabbir_clinic_consent_templates
for delete to authenticated
using (dabbir_private.has_permission(business_id,'manage_business'));

drop policy if exists dabbir_clinic_sessions_select on public.dabbir_clinic_sessions;
create policy dabbir_clinic_sessions_select on public.dabbir_clinic_sessions
for select to authenticated
using (dabbir_private.has_permission(business_id,'view_appointments'));

drop policy if exists dabbir_clinic_sessions_insert on public.dabbir_clinic_sessions;
create policy dabbir_clinic_sessions_insert on public.dabbir_clinic_sessions
for insert to authenticated
with check (dabbir_private.has_permission(business_id,'manage_appointments'));

drop policy if exists dabbir_clinic_sessions_update on public.dabbir_clinic_sessions;
create policy dabbir_clinic_sessions_update on public.dabbir_clinic_sessions
for update to authenticated
using (dabbir_private.has_permission(business_id,'manage_appointments'))
with check (dabbir_private.has_permission(business_id,'manage_appointments'));

drop policy if exists dabbir_clinic_sessions_delete on public.dabbir_clinic_sessions;
create policy dabbir_clinic_sessions_delete on public.dabbir_clinic_sessions
for delete to authenticated
using (dabbir_private.has_permission(business_id,'manage_appointments'));

commit;
