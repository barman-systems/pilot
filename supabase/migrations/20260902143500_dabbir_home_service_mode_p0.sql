begin;

-- DABBIR Home Service Mode P0.
-- This stays vertical-neutral so salons, clinics, mobile car wash, maintenance,
-- cleaning and other service businesses can use the same appointment workflow.

alter table public.dabbir_appointments
  add column if not exists location_type text not null default 'business',
  add column if not exists service_address text not null default '',
  add column if not exists service_latitude double precision,
  add column if not exists service_longitude double precision,
  add column if not exists travel_minutes integer not null default 0,
  add column if not exists visit_fee_aed numeric(12,2) not null default 0,
  add column if not exists field_status text not null default 'scheduled',
  add column if not exists location_updated_at timestamptz;

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_location_type_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_location_type_check
  check (location_type in ('business','customer'));

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_service_coordinates_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_service_coordinates_check
  check (
    (service_latitude is null and service_longitude is null)
    or (
      service_latitude between -90 and 90
      and service_longitude between -180 and 180
    )
  );

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_travel_minutes_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_travel_minutes_check
  check (travel_minutes between 0 and 720);

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_visit_fee_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_visit_fee_check
  check (visit_fee_aed between 0 and 10000000);

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_field_status_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_field_status_check
  check (field_status in ('scheduled','in_route','arrived','in_service','completed','cancelled'));

create index if not exists dabbir_appointments_home_service_upcoming_idx
  on public.dabbir_appointments(business_id,starts_at,field_status)
  where location_type='customer';

create table if not exists public.dabbir_home_service_settings (
  business_id uuid primary key references public.dabbir_businesses(id) on delete cascade,
  enabled boolean not null default false,
  default_visit_fee_aed numeric(12,2) not null default 0
    check (default_visit_fee_aed between 0 and 10000000),
  default_travel_minutes integer not null default 0
    check (default_travel_minutes between 0 and 720),
  require_customer_address boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.dabbir_home_service_settings enable row level security;
revoke all on public.dabbir_home_service_settings from public,anon,authenticated;
grant select,insert,update on public.dabbir_home_service_settings to authenticated;

create policy dabbir_home_service_settings_select
on public.dabbir_home_service_settings
for select to authenticated
using (dabbir_private.has_permission(business_id,'view_business'));

create policy dabbir_home_service_settings_insert
on public.dabbir_home_service_settings
for insert to authenticated
with check (dabbir_private.has_permission(business_id,'manage_business'));

create policy dabbir_home_service_settings_update
on public.dabbir_home_service_settings
for update to authenticated
using (dabbir_private.has_permission(business_id,'manage_business'))
with check (dabbir_private.has_permission(business_id,'manage_business'));

comment on table public.dabbir_home_service_settings is
  'Vertical-neutral DABBIR home/field service settings; disabled by default per business.';
comment on column public.dabbir_appointments.location_type is
  'business = served at business location; customer = staff travels to customer.';
comment on column public.dabbir_appointments.field_status is
  'Field execution state for customer-location appointments.';

commit;
