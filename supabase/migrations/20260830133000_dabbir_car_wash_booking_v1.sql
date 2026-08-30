begin;

create table if not exists public.dabbir_car_wash_settings (
  business_id uuid primary key references public.dabbir_businesses(id) on delete cascade,
  public_booking_enabled boolean not null default true,
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes in (15,30,45,60)),
  booking_horizon_days integer not null default 14 check (booking_horizon_days between 1 and 60),
  open_time time not null default '08:00',
  close_time time not null default '20:00',
  working_days smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  updated_at timestamptz not null default now(),
  check (close_time > open_time),
  check (working_days <@ array[0,1,2,3,4,5,6]::smallint[])
);

create table if not exists public.dabbir_car_wash_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  sort_order integer not null check (sort_order between 1 and 6),
  name_ar text not null check (char_length(name_ar) between 2 and 120),
  name_en text not null check (char_length(name_en) between 2 and 120),
  description_ar text not null default '' check (char_length(description_ar) <= 500),
  description_en text not null default '' check (char_length(description_en) <= 500),
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  saloon_price_aed numeric(10,2) not null check (saloon_price_aed >= 0),
  station_price_aed numeric(10,2) not null check (station_price_aed >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, sort_order)
);

create table if not exists public.dabbir_car_wash_booking_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  offer_id uuid not null references public.dabbir_car_wash_offers(id) on delete restrict,
  vehicle_type text not null check (vehicle_type in ('saloon','station')),
  starts_at timestamptz not null,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  customer_phone text not null check (char_length(customer_phone) between 7 and 30),
  location_lat numeric(9,6) not null check (location_lat between -90 and 90),
  location_lng numeric(9,6) not null check (location_lng between -180 and 180),
  location_label text not null default '' check (char_length(location_label) <= 240),
  status text not null default 'requested' check (status in ('requested','confirmed','declined','completed','cancelled')),
  source text not null default 'public_booking' check (source = 'public_booking'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dabbir_car_wash_offers_business_order_idx
  on public.dabbir_car_wash_offers(business_id, sort_order)
  where active = true;
create index if not exists dabbir_car_wash_booking_business_start_idx
  on public.dabbir_car_wash_booking_requests(business_id, starts_at);
create index if not exists dabbir_car_wash_booking_offer_start_idx
  on public.dabbir_car_wash_booking_requests(offer_id, starts_at);

alter table public.dabbir_car_wash_settings enable row level security;
alter table public.dabbir_car_wash_offers enable row level security;
alter table public.dabbir_car_wash_booking_requests enable row level security;

revoke all on public.dabbir_car_wash_settings, public.dabbir_car_wash_offers, public.dabbir_car_wash_booking_requests from public, anon, authenticated;
grant select, insert, update on public.dabbir_car_wash_settings, public.dabbir_car_wash_offers to authenticated;
grant select, update on public.dabbir_car_wash_booking_requests to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists dabbir_car_wash_settings_member on public.dabbir_car_wash_settings;
create policy dabbir_car_wash_settings_member on public.dabbir_car_wash_settings
for all to authenticated using (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_settings.business_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner','admin'))
) with check (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_settings.business_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner','admin'))
);

drop policy if exists dabbir_car_wash_offers_member on public.dabbir_car_wash_offers;
create policy dabbir_car_wash_offers_member on public.dabbir_car_wash_offers
for all to authenticated using (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_offers.business_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner','admin'))
) with check (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_offers.business_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner','admin'))
);

drop policy if exists dabbir_car_wash_booking_owner_read on public.dabbir_car_wash_booking_requests;
create policy dabbir_car_wash_booking_owner_read on public.dabbir_car_wash_booking_requests
for select to authenticated using (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_booking_requests.business_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner','admin','manager','employee','staff'))
);

drop policy if exists dabbir_car_wash_booking_owner_update on public.dabbir_car_wash_booking_requests;
create policy dabbir_car_wash_booking_owner_update on public.dabbir_car_wash_booking_requests
for update to authenticated using (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_booking_requests.business_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner','admin'))
) with check (
  exists (select 1 from public.dabbir_memberships m where m.business_id = dabbir_car_wash_booking_requests.business_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner','admin'))
);

create or replace function public.dabbir_public_car_wash_catalog(p_slug text)
returns jsonb
language sql
security definer
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'business', jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name),
    'settings', jsonb_build_object(
      'slot_interval_minutes', s.slot_interval_minutes,
      'booking_horizon_days', s.booking_horizon_days,
      'working_days', s.working_days,
      'open_time', s.open_time,
      'close_time', s.close_time
    ),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'sort_order', o.sort_order,
        'name_ar', o.name_ar,
        'name_en', o.name_en,
        'description_ar', o.description_ar,
        'description_en', o.description_en,
        'duration_minutes', o.duration_minutes,
        'saloon_price_aed', o.saloon_price_aed,
        'station_price_aed', o.station_price_aed
      ) order by o.sort_order)
      from public.dabbir_car_wash_offers o
      where o.business_id = b.id and o.active = true
    ), '[]'::jsonb)
  )
  from public.dabbir_businesses b
  join public.dabbir_car_wash_settings s on s.business_id = b.id
  where lower(b.slug) = lower(trim(p_slug))
    and b.business_type = 'car_wash'
    and s.public_booking_enabled = true
  limit 1;
$$;

create or replace function public.dabbir_public_car_wash_slots(
  p_slug text,
  p_offer_id uuid,
  p_from_date date default current_date,
  p_to_date date default null
)
returns table(slot_at timestamptz)
language plpgsql
security definer
stable
set search_path = public, extensions
as $$
declare
  v_business_id uuid;
  v_duration integer;
  v_interval integer;
  v_horizon integer;
  v_open time;
  v_close time;
  v_days smallint[];
  v_from date := greatest(coalesce(p_from_date, current_date), current_date);
  v_to date;
begin
  select b.id, s.slot_interval_minutes, s.booking_horizon_days, s.open_time, s.close_time, s.working_days
    into v_business_id, v_interval, v_horizon, v_open, v_close, v_days
  from public.dabbir_businesses b
  join public.dabbir_car_wash_settings s on s.business_id = b.id and s.public_booking_enabled = true
  where lower(b.slug) = lower(trim(p_slug)) and b.business_type = 'car_wash'
  limit 1;
  if v_business_id is null then return; end if;

  select o.duration_minutes into v_duration
  from public.dabbir_car_wash_offers o
  where o.id = p_offer_id and o.business_id = v_business_id and o.active = true;
  if v_duration is null then return; end if;

  v_to := least(coalesce(p_to_date, v_from + v_horizon), v_from + v_horizon);
  return query
  with days as (
    select g::date as service_day
    from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') g
    where extract(dow from g)::smallint = any(v_days)
  ), candidates as (
    select ((d.service_day + v_open) at time zone 'Asia/Dubai') + (n * make_interval(mins => v_interval)) as candidate
    from days d
    cross join lateral generate_series(
      0,
      greatest(0, floor(extract(epoch from (v_close - v_open)) / 60)::integer - v_duration),
      v_interval
    ) n
  )
  select c.candidate
  from candidates c
  where c.candidate > now() + interval '30 minutes'
    and not exists (
      select 1
      from public.dabbir_car_wash_booking_requests r
      join public.dabbir_car_wash_offers ro on ro.id = r.offer_id
      where r.business_id = v_business_id
        and r.status in ('requested','confirmed')
        and tstzrange(r.starts_at, r.starts_at + make_interval(mins => ro.duration_minutes), '[)')
            && tstzrange(c.candidate, c.candidate + make_interval(mins => v_duration), '[)')
    )
  order by c.candidate
  limit 200;
end;
$$;

create or replace function public.dabbir_public_car_wash_book(
  p_slug text,
  p_offer_id uuid,
  p_vehicle_type text,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_location_lat numeric,
  p_location_lng numeric,
  p_location_label text default ''
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_business_id uuid;
  v_offer record;
  v_id uuid;
  v_name text := left(trim(coalesce(p_customer_name, '')), 120);
  v_phone text := left(trim(coalesce(p_customer_phone, '')), 30);
  v_label text := left(trim(coalesce(p_location_label, '')), 240);
  v_vehicle text := lower(trim(coalesce(p_vehicle_type, '')));
begin
  if v_name !~ '^.{2,120}$' or v_phone !~ '^.{7,30}$' then raise exception 'INVALID_CUSTOMER_DETAILS' using errcode = '22023'; end if;
  if v_vehicle not in ('saloon','station') then raise exception 'INVALID_VEHICLE_TYPE' using errcode = '22023'; end if;
  if p_location_lat is null or p_location_lat < -90 or p_location_lat > 90 or p_location_lng is null or p_location_lng < -180 or p_location_lng > 180 then raise exception 'VALID_LOCATION_REQUIRED' using errcode = '22023'; end if;
  if p_starts_at is null or p_starts_at <= now() then raise exception 'INVALID_START_TIME' using errcode = '22023'; end if;

  select b.id into v_business_id
  from public.dabbir_businesses b
  join public.dabbir_car_wash_settings s on s.business_id = b.id and s.public_booking_enabled = true
  where lower(b.slug) = lower(trim(p_slug)) and b.business_type = 'car_wash'
  limit 1;
  if v_business_id is null then raise exception 'BOOKING_NOT_AVAILABLE' using errcode = '22023'; end if;

  select o.* into v_offer from public.dabbir_car_wash_offers o where o.id = p_offer_id and o.business_id = v_business_id and o.active = true;
  if not found then raise exception 'OFFER_NOT_AVAILABLE' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || date_trunc('minute', p_starts_at)::text, 0));
  if not exists (
    select 1 from public.dabbir_public_car_wash_slots(p_slug, p_offer_id, (p_starts_at at time zone 'Asia/Dubai')::date, (p_starts_at at time zone 'Asia/Dubai')::date) x
    where x.slot_at = date_trunc('minute', p_starts_at)
  ) then raise exception 'SLOT_NOT_AVAILABLE' using errcode = '23P01'; end if;

  insert into public.dabbir_car_wash_booking_requests (
    business_id, offer_id, vehicle_type, starts_at, customer_name, customer_phone,
    location_lat, location_lng, location_label
  ) values (
    v_business_id, v_offer.id, v_vehicle, date_trunc('minute', p_starts_at), v_name, v_phone,
    round(p_location_lat::numeric, 6), round(p_location_lng::numeric, 6), v_label
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'business_id', v_business_id,
    'offer_id', v_offer.id,
    'vehicle_type', v_vehicle,
    'starts_at', date_trunc('minute', p_starts_at),
    'status', 'requested'
  );
end;
$$;

revoke all on function public.dabbir_public_car_wash_catalog(text) from public;
revoke all on function public.dabbir_public_car_wash_slots(text, uuid, date, date) from public;
revoke all on function public.dabbir_public_car_wash_book(text, uuid, text, timestamptz, text, text, numeric, numeric, text) from public;
grant execute on function public.dabbir_public_car_wash_catalog(text) to anon, authenticated;
grant execute on function public.dabbir_public_car_wash_slots(text, uuid, date, date) to anon, authenticated;
grant execute on function public.dabbir_public_car_wash_book(text, uuid, text, timestamptz, text, text, numeric, numeric, text) to anon, authenticated;

commit;
