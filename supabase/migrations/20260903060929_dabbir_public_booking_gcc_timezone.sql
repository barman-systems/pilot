-- Public car-wash booking follows the business GCC profile.
-- Country remains authoritative through dabbir_businesses.country_code; currency,
-- timezone and phone prefix are derived by the GCC business-profile trigger.

create or replace function public.dabbir_public_car_wash_catalog(p_slug text)
returns jsonb
language sql
security definer
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id,
      'slug', b.slug,
      'name', b.name,
      'country_code', b.country_code,
      'currency_code', b.currency_code,
      'timezone', b.timezone,
      'phone_country_prefix', b.phone_country_prefix
    ),
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
  p_from_date date default null,
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
  v_timezone text;
  v_duration integer;
  v_interval integer;
  v_horizon integer;
  v_open time;
  v_close time;
  v_days smallint[];
  v_today date;
  v_from date;
  v_to date;
begin
  select b.id, b.timezone, s.slot_interval_minutes, s.booking_horizon_days, s.open_time, s.close_time, s.working_days
    into v_business_id, v_timezone, v_interval, v_horizon, v_open, v_close, v_days
  from public.dabbir_businesses b
  join public.dabbir_car_wash_settings s on s.business_id = b.id and s.public_booking_enabled = true
  where lower(b.slug) = lower(trim(p_slug)) and b.business_type = 'car_wash'
  limit 1;
  if v_business_id is null then return; end if;

  v_today := (now() at time zone v_timezone)::date;
  v_from := greatest(coalesce(p_from_date, v_today), v_today);

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
    select ((d.service_day + v_open) at time zone v_timezone) + (n * make_interval(mins => v_interval)) as candidate
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
  v_timezone text;
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

  select b.id, b.timezone into v_business_id, v_timezone
  from public.dabbir_businesses b
  join public.dabbir_car_wash_settings s on s.business_id = b.id and s.public_booking_enabled = true
  where lower(b.slug) = lower(trim(p_slug)) and b.business_type = 'car_wash'
  limit 1;
  if v_business_id is null then raise exception 'BOOKING_NOT_AVAILABLE' using errcode = '22023'; end if;

  select o.* into v_offer from public.dabbir_car_wash_offers o where o.id = p_offer_id and o.business_id = v_business_id and o.active = true;
  if not found then raise exception 'OFFER_NOT_AVAILABLE' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || date_trunc('minute', p_starts_at)::text, 0));
  if not exists (
    select 1 from public.dabbir_public_car_wash_slots(
      p_slug,
      p_offer_id,
      (p_starts_at at time zone v_timezone)::date,
      (p_starts_at at time zone v_timezone)::date
    ) x
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
    'timezone', v_timezone,
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
