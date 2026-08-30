begin;

create or replace function dabbir_private.prevent_appointment_calendar_conflict()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_end timestamptz;
begin
  if new.starts_at is null or new.status in ('cancelled','completed','no_show') then
    return new;
  end if;

  v_end := new.starts_at + interval '60 minutes';

  if exists (
    select 1
    from public.dabbir_calendar_busy_blocks b
    where b.business_id = new.business_id
      and b.starts_at < v_end
      and b.ends_at > new.starts_at
  ) then
    raise exception 'APPOINTMENT_CALENDAR_CONFLICT';
  end if;

  if exists (
    select 1
    from public.dabbir_appointments a
    where a.business_id = new.business_id
      and a.id <> coalesce(new.id, gen_random_uuid())
      and a.starts_at is not null
      and a.status not in ('cancelled','completed','no_show')
      and a.starts_at < v_end
      and (a.starts_at + interval '60 minutes') > new.starts_at
  ) then
    raise exception 'APPOINTMENT_TIME_CONFLICT';
  end if;

  return new;
end;
$$;

revoke all on function dabbir_private.prevent_appointment_calendar_conflict() from public,anon,authenticated;

drop trigger if exists dabbir_appointment_calendar_conflict_guard on public.dabbir_appointments;
create trigger dabbir_appointment_calendar_conflict_guard
before insert or update of starts_at,status on public.dabbir_appointments
for each row execute function dabbir_private.prevent_appointment_calendar_conflict();

commit;
