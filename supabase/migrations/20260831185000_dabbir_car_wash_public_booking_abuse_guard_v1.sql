begin;

create index if not exists dabbir_car_wash_public_booking_phone_window_idx
  on public.dabbir_car_wash_booking_requests (
    business_id,
    (pg_catalog.regexp_replace(customer_phone, '[^0-9]'::text, ''::text, 'g'::text)),
    created_at
  )
  where source = 'public_booking';

create or replace function public.dabbir_car_wash_public_booking_abuse_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone_key text;
  v_recent_count integer;
  v_daily_count integer;
begin
  if new.source is distinct from 'public_booking' then
    return new;
  end if;

  v_phone_key := pg_catalog.regexp_replace(pg_catalog.coalesce(new.customer_phone, ''), '[^0-9]'::text, ''::text, 'g'::text);
  if pg_catalog.length(v_phone_key) < 6 then
    raise exception 'INVALID_CUSTOMER_PHONE' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.business_id::text || ':' || v_phone_key, 0)
  );

  select pg_catalog.count(*)::integer
    into v_recent_count
    from public.dabbir_car_wash_booking_requests r
   where r.business_id = new.business_id
     and r.source = 'public_booking'
     and r.created_at >= pg_catalog.now() - interval '10 minutes'
     and pg_catalog.regexp_replace(r.customer_phone, '[^0-9]'::text, ''::text, 'g'::text) = v_phone_key;

  if v_recent_count >= 5 then
    raise exception 'BOOKING_RATE_LIMITED' using errcode = 'P0001';
  end if;

  select pg_catalog.count(*)::integer
    into v_daily_count
    from public.dabbir_car_wash_booking_requests r
   where r.business_id = new.business_id
     and r.source = 'public_booking'
     and r.created_at >= pg_catalog.now() - interval '24 hours'
     and pg_catalog.regexp_replace(r.customer_phone, '[^0-9]'::text, ''::text, 'g'::text) = v_phone_key;

  if v_daily_count >= 20 then
    raise exception 'BOOKING_RATE_LIMITED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.dabbir_car_wash_public_booking_abuse_guard() from public, anon, authenticated;

drop trigger if exists dabbir_car_wash_public_booking_abuse_guard on public.dabbir_car_wash_booking_requests;
create trigger dabbir_car_wash_public_booking_abuse_guard
before insert on public.dabbir_car_wash_booking_requests
for each row
execute function public.dabbir_car_wash_public_booking_abuse_guard();

commit;
