create or replace function dabbir_private.prevent_past_appointment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.starts_at is null then
    return new;
  end if;

  -- DABBIR's booking UI works at minute precision. The current minute is valid;
  -- any earlier minute is rejected at the database boundary.
  if new.starts_at < date_trunc('minute', now()) then
    raise exception 'APPOINTMENT_TIME_IN_PAST'
      using errcode = '22007';
  end if;

  return new;
end;
$$;

drop trigger if exists dabbir_appointment_past_time_guard on public.dabbir_appointments;
create trigger dabbir_appointment_past_time_guard
before insert or update of starts_at on public.dabbir_appointments
for each row
execute function dabbir_private.prevent_past_appointment();
