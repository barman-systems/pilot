-- Isolated PostgreSQL fixture for the unchanged live range/conflict trigger.
-- Snapshot observed on Production 67429bab, 2026-09-10. No production DDL.
create schema dabbir_private;
create table public.dabbir_businesses(id uuid primary key,timezone text);
create table public.dabbir_appointments(id uuid primary key,business_id uuid,worker_id uuid,starts_at timestamptz,ends_at timestamptz,status text,
 constraint dabbir_appointments_time_range_check check(starts_at is null or ends_at is null or ends_at>starts_at));
create table public.dabbir_worker_schedules(business_id uuid,worker_id uuid,active boolean,schedule_type text,weekday smallint,starts_at time,ends_at time);
create table public.dabbir_worker_time_off(business_id uuid,worker_id uuid,starts_at timestamptz,ends_at timestamptz);
create table public.dabbir_calendar_busy_blocks(business_id uuid,starts_at timestamptz,ends_at timestamptz);
CREATE OR REPLACE FUNCTION dabbir_private.prevent_appointment_calendar_conflict()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_end timestamptz;v_timezone text;v_local_start timestamp;v_local_end timestamp;v_weekday smallint;v_has_schedule boolean;
begin
  if new.starts_at is null or new.status in ('cancelled','completed','no_show') then return new; end if;
  v_end := coalesce(new.ends_at,new.starts_at+interval '60 minutes');
  if v_end <= new.starts_at then raise exception 'INVALID_APPOINTMENT_RANGE'; end if;
  select b.timezone into v_timezone from public.dabbir_businesses b where b.id=new.business_id;
  if nullif(v_timezone,'') is null then raise exception 'BUSINESS_TIMEZONE_NOT_CONFIGURED'; end if;
  v_local_start := new.starts_at at time zone v_timezone;v_local_end := v_end at time zone v_timezone;v_weekday := extract(dow from v_local_start)::smallint;
  if new.worker_id is not null then
    select exists(select 1 from public.dabbir_worker_schedules s where s.business_id=new.business_id and s.worker_id=new.worker_id and s.active and s.schedule_type='work') into v_has_schedule;
    if v_has_schedule and not exists(select 1 from public.dabbir_worker_schedules s where s.business_id=new.business_id and s.worker_id=new.worker_id and s.weekday=v_weekday and s.active and s.schedule_type='work' and s.starts_at <= v_local_start::time and s.ends_at >= v_local_end::time) then raise exception 'WORKER_OUTSIDE_SCHEDULE'; end if;
    if exists(select 1 from public.dabbir_worker_schedules s where s.business_id=new.business_id and s.worker_id=new.worker_id and s.weekday=v_weekday and s.active and s.schedule_type in ('break','unavailable') and s.starts_at < v_local_end::time and s.ends_at > v_local_start::time) then raise exception 'WORKER_UNAVAILABLE'; end if;
    if exists(select 1 from public.dabbir_worker_time_off t where t.business_id=new.business_id and t.worker_id=new.worker_id and t.starts_at < v_end and t.ends_at > new.starts_at) then raise exception 'WORKER_TIME_OFF'; end if;
  end if;
  if exists(select 1 from public.dabbir_calendar_busy_blocks b where b.business_id=new.business_id and b.starts_at < v_end and b.ends_at > new.starts_at) then raise exception 'APPOINTMENT_CALENDAR_CONFLICT'; end if;
  if new.worker_id is not null and exists(select 1 from public.dabbir_appointments a where a.business_id=new.business_id and a.id <> coalesce(new.id,gen_random_uuid()) and a.starts_at is not null and a.status not in ('cancelled','completed','no_show') and a.worker_id=new.worker_id and a.starts_at < v_end and coalesce(a.ends_at,a.starts_at+interval '60 minutes') > new.starts_at) then raise exception 'APPOINTMENT_TIME_CONFLICT'; end if;
  if new.worker_id is null and exists(select 1 from public.dabbir_appointments a where a.business_id=new.business_id and a.id <> coalesce(new.id,gen_random_uuid()) and a.starts_at is not null and a.status not in ('cancelled','completed','no_show') and a.worker_id is null and a.starts_at < v_end and coalesce(a.ends_at,a.starts_at+interval '60 minutes') > new.starts_at) then raise exception 'APPOINTMENT_TIME_CONFLICT'; end if;
  return new;
end;
$function$;

create trigger dabbir_appointment_calendar_conflict_guard before insert or update of starts_at,ends_at,status,worker_id on public.dabbir_appointments for each row execute function dabbir_private.prevent_appointment_calendar_conflict();

