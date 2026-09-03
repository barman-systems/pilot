create or replace function dabbir_private.prevent_past_appointment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_now_minute timestamptz := date_trunc('minute', now());
begin
  if new.starts_at is null then
    return new;
  end if;

  -- New bookings and future bookings may never be moved into the past.
  if new.starts_at >= v_now_minute then
    return new;
  end if;

  -- Once an appointment is already historical, its owner may correct the
  -- historical timestamp or status without the booking-creation guard
  -- blocking the update. This preserves owner authority while keeping the
  -- no-new-past-booking invariant fail-closed.
  if tg_op = 'UPDATE'
     and old.starts_at is not null
     and old.starts_at < v_now_minute then
    return new;
  end if;

  raise exception 'APPOINTMENT_TIME_IN_PAST'
    using errcode = '22007';
end;
$$;

drop trigger if exists dabbir_appointment_past_time_guard on public.dabbir_appointments;
create trigger dabbir_appointment_past_time_guard
before insert or update of starts_at on public.dabbir_appointments
for each row
execute function dabbir_private.prevent_past_appointment();
