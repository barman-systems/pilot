-- Prevent concurrent booking/calendar writes for the same business from bypassing
-- the existing appointment conflict checks. The lock is transaction-scoped and
-- shared by appointments, external busy blocks, worker schedules, and time off.

create or replace function dabbir_private.lock_booking_calendar_business()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_new_business uuid;
  v_old_business uuid;
  v_first text;
  v_second text;
begin
  if tg_op <> 'DELETE' then v_new_business := new.business_id; end if;
  if tg_op <> 'INSERT' then v_old_business := old.business_id; end if;

  if v_new_business is not null and v_old_business is not null and v_new_business <> v_old_business then
    v_first := least(v_new_business::text, v_old_business::text);
    v_second := greatest(v_new_business::text, v_old_business::text);
    perform pg_advisory_xact_lock(hashtextextended('dabbir:booking-calendar:' || v_first, 0));
    perform pg_advisory_xact_lock(hashtextextended('dabbir:booking-calendar:' || v_second, 0));
  elsif coalesce(v_new_business,v_old_business) is not null then
    perform pg_advisory_xact_lock(hashtextextended('dabbir:booking-calendar:' || coalesce(v_new_business,v_old_business)::text, 0));
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function dabbir_private.lock_booking_calendar_business() from public,anon,authenticated;

drop trigger if exists dabbir_00_booking_calendar_lock on public.dabbir_appointments;
create trigger dabbir_00_booking_calendar_lock
before insert or update or delete on public.dabbir_appointments
for each row execute function dabbir_private.lock_booking_calendar_business();

drop trigger if exists dabbir_00_booking_calendar_lock on public.dabbir_calendar_busy_blocks;
create trigger dabbir_00_booking_calendar_lock
before insert or update or delete on public.dabbir_calendar_busy_blocks
for each row execute function dabbir_private.lock_booking_calendar_business();

drop trigger if exists dabbir_00_booking_calendar_lock on public.dabbir_worker_schedules;
create trigger dabbir_00_booking_calendar_lock
before insert or update or delete on public.dabbir_worker_schedules
for each row execute function dabbir_private.lock_booking_calendar_business();

drop trigger if exists dabbir_00_booking_calendar_lock on public.dabbir_worker_time_off;
create trigger dabbir_00_booking_calendar_lock
before insert or update or delete on public.dabbir_worker_time_off
for each row execute function dabbir_private.lock_booking_calendar_business();

comment on function dabbir_private.lock_booking_calendar_business() is
  'Serializes booking-calendar writes per business so concurrent appointment, busy-block, schedule, and time-off transactions cannot bypass conflict checks.';
