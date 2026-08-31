-- DABBIR mobile-car-wash operations extension.
-- This migration extends the existing car-wash booking model; it does not create a parallel booking system.

alter table public.dabbir_car_wash_booking_requests
  add column if not exists customer_id uuid,
  add column if not exists vehicle_id uuid,
  add column if not exists service_notes text not null default '',
  add column if not exists quoted_price_aed numeric(10,2),
  add column if not exists maps_url text;

alter table public.dabbir_car_wash_booking_requests
  drop constraint if exists dabbir_car_wash_booking_requests_status_check;
update public.dabbir_car_wash_booking_requests set status = 'new' where status = 'requested';
alter table public.dabbir_car_wash_booking_requests
  add constraint dabbir_car_wash_booking_requests_status_check
  check (status in ('new','confirmed','en_route','arrived','washing','completed','paid','cancelled','declined'));
alter table public.dabbir_car_wash_booking_requests
  alter column status set default 'new';
alter table public.dabbir_car_wash_booking_requests
  drop constraint if exists dabbir_car_wash_booking_requests_source_check;
alter table public.dabbir_car_wash_booking_requests
  add constraint dabbir_car_wash_booking_requests_source_check
  check (source in ('public_booking','operations','recurring'));

create table if not exists public.dabbir_car_wash_vehicles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  customer_id uuid not null,
  vehicle_type text not null check (char_length(vehicle_type) between 2 and 80),
  model text not null check (char_length(model) between 2 and 120),
  color text not null default '' check (char_length(color) <= 60),
  plate_number text not null default '' check (char_length(plate_number) <= 40),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, customer_id) references public.dabbir_customers(business_id, id) on delete cascade
);

alter table public.dabbir_car_wash_booking_requests
  add constraint dabbir_car_wash_booking_customer_fk foreign key (business_id, customer_id) references public.dabbir_customers(business_id, id) on delete set null,
  add constraint dabbir_car_wash_booking_vehicle_fk foreign key (vehicle_id) references public.dabbir_car_wash_vehicles(id) on delete set null;

create table if not exists public.dabbir_car_wash_booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.dabbir_car_wash_booking_requests(id) on delete cascade,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  from_status text,
  to_status text not null check (to_status in ('new','confirmed','en_route','arrived','washing','completed','paid','cancelled','declined')),
  note text not null default '' check (char_length(note) <= 1000),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.dabbir_car_wash_booking_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.dabbir_car_wash_booking_requests(id) on delete cascade,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  vehicle_id uuid references public.dabbir_car_wash_vehicles(id) on delete set null,
  phase text not null check (phase in ('before','after')),
  storage_path text not null unique,
  filename text not null check (char_length(filename) between 1 and 180),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.dabbir_car_wash_recurring_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  customer_id uuid not null,
  vehicle_id uuid not null references public.dabbir_car_wash_vehicles(id) on delete cascade,
  offer_id uuid not null references public.dabbir_car_wash_offers(id) on delete restrict,
  frequency text not null check (frequency in ('weekly','biweekly','monthly')),
  washes_per_month integer check (washes_per_month between 1 and 31),
  starts_on date not null,
  renewal_on date not null,
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, customer_id) references public.dabbir_customers(business_id, id) on delete cascade
);

create index if not exists dabbir_car_wash_vehicles_customer_idx on public.dabbir_car_wash_vehicles(business_id, customer_id, created_at desc);
create index if not exists dabbir_car_wash_booking_operations_idx on public.dabbir_car_wash_booking_requests(business_id, starts_at, status);
create index if not exists dabbir_car_wash_history_booking_idx on public.dabbir_car_wash_booking_status_history(booking_id, created_at desc);
create index if not exists dabbir_car_wash_photos_booking_idx on public.dabbir_car_wash_booking_photos(booking_id, created_at desc);
create index if not exists dabbir_car_wash_recurring_renewal_idx on public.dabbir_car_wash_recurring_plans(business_id, renewal_on) where status = 'active';

drop policy if exists dabbir_car_wash_booking_owner_update on public.dabbir_car_wash_booking_requests;
create policy dabbir_car_wash_booking_operations_update on public.dabbir_car_wash_booking_requests
for update to authenticated using (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_booking_requests.business_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
) with check (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_booking_requests.business_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
);

insert into storage.buckets (id, name, public) values ('dabbir-car-wash-evidence', 'dabbir-car-wash-evidence', false)
on conflict (id) do update set public = false;

alter table public.dabbir_car_wash_vehicles enable row level security;
alter table public.dabbir_car_wash_booking_status_history enable row level security;
alter table public.dabbir_car_wash_booking_photos enable row level security;
alter table public.dabbir_car_wash_recurring_plans enable row level security;

create policy dabbir_car_wash_vehicles_member on public.dabbir_car_wash_vehicles for all to authenticated using (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_vehicles.business_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
) with check (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_vehicles.business_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
);

create policy dabbir_car_wash_history_member on public.dabbir_car_wash_booking_status_history for select to authenticated using (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_booking_status_history.business_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
);
create policy dabbir_car_wash_history_write on public.dabbir_car_wash_booking_status_history for insert to authenticated with check (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_booking_status_history.business_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
);
create policy dabbir_car_wash_photos_member on public.dabbir_car_wash_booking_photos for all to authenticated using (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_booking_photos.business_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
) with check (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_booking_photos.business_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
);
create policy dabbir_car_wash_recurring_member on public.dabbir_car_wash_recurring_plans for all to authenticated using (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_recurring_plans.business_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
) with check (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_recurring_plans.business_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
);
create policy dabbir_car_wash_evidence_member on storage.objects for all to authenticated using (
  bucket_id = 'dabbir-car-wash-evidence' and exists (select 1 from public.dabbir_memberships m where m.business_id::text = split_part(name, '/', 1) and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
) with check (
  bucket_id = 'dabbir-car-wash-evidence' and exists (select 1 from public.dabbir_memberships m where m.business_id::text = split_part(name, '/', 1) and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
);
