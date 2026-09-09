-- DABBIR operating-hours execution gate V1.
-- Owner-approved business hours are execution policy, not optional AI context.
-- Availability remains fail-closed for configured hours without weakening tenant/branch/worker gates.

create or replace function dabbir_private.business_operating_hours_window_v1(
  p_business_id uuid,
  p_local_start timestamp,
  p_duration_minutes integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','public','dabbir_private'
as $fn$
declare
  v_text text;
  v_duration integer:=greatest(0,coalesce(p_duration_minutes,0));
  v_offset integer;
  v_date date;
  v_day text;
  v_match text[];
  v_open time;
  v_close time;
  v_window_start timestamp;
  v_window_end timestamp;
  v_today_match text[];
  v_today_day text;
  v_today_open time;
  v_today_close time;
begin
  if p_business_id is null or p_local_start is null then
    return jsonb_build_object('configured',false,'allowed',false,'reason','INVALID_INPUT');
  end if;

  select k.value->>'text' into v_text
  from public.dabbir_business_knowledge k
  where k.business_id=p_business_id
    and k.knowledge_key='business_hours'
    and k.source='owner_approved'
    and k.status='approved'
    and nullif(trim(k.value->>'text'),'') is not null
  order by k.updated_at desc
  limit 1;

  if nullif(trim(v_text),'') is null then
    return jsonb_build_object('configured',false,'allowed',true,'reason','NO_OWNER_APPROVED_HOURS');
  end if;

  for v_offset in -1..0 loop
    v_date:=p_local_start::date+v_offset;
    v_day:=case extract(dow from v_date)::integer
      when 0 then 'Sunday' when 1 then 'Monday' when 2 then 'Tuesday'
      when 3 then 'Wednesday' when 4 then 'Thursday' when 5 then 'Friday'
      else 'Saturday' end;
    v_match:=regexp_match(v_text,'(?i)(?:^|;[[:space:]]*)'||v_day||'[[:space:]]+([0-2][0-9]:[0-5][0-9])[[:space:]]*-[[:space:]]*([0-2][0-9]:[0-5][0-9])(?:[[:space:]]*;|$)');
    if v_match is null then continue; end if;
    v_open:=v_match[1]::time;
    v_close:=v_match[2]::time;
    v_window_start:=v_date+v_open;
    v_window_end:=case when v_close>v_open then v_date+v_close else (v_date+1)+v_close end;
    if p_local_start>=v_window_start
       and p_local_start+make_interval(mins=>v_duration)<=v_window_end then
      return jsonb_build_object(
        'configured',true,'allowed',true,'reason','WITHIN_OWNER_APPROVED_HOURS',
        'day',v_day,'open_time',to_char(v_open,'HH24:MI'),'close_time',to_char(v_close,'HH24:MI'),
        'source','owner_approved','knowledge_key','business_hours'
      );
    end if;
  end loop;

  v_date:=p_local_start::date;
  v_today_day:=case extract(dow from v_date)::integer
    when 0 then 'Sunday' when 1 then 'Monday' when 2 then 'Tuesday'
    when 3 then 'Wednesday' when 4 then 'Thursday' when 5 then 'Friday'
    else 'Saturday' end;
  v_today_match:=regexp_match(v_text,'(?i)(?:^|;[[:space:]]*)'||v_today_day||'[[:space:]]+([0-2][0-9]:[0-5][0-9])[[:space:]]*-[[:space:]]*([0-2][0-9]:[0-5][0-9])(?:[[:space:]]*;|$)');
  if v_today_match is null then
    return jsonb_build_object(
      'configured',true,'allowed',false,'reason','CLOSED_OR_UNPARSEABLE_DAY',
      'day',v_today_day,'source','owner_approved','knowledge_key','business_hours'
    );
  end if;
  v_today_open:=v_today_match[1]::time;
  v_today_close:=v_today_match[2]::time;
  return jsonb_build_object(
    'configured',true,'allowed',false,'reason','OUTSIDE_OWNER_APPROVED_HOURS',
    'day',v_today_day,'open_time',to_char(v_today_open,'HH24:MI'),'close_time',to_char(v_today_close,'HH24:MI'),
    'source','owner_approved','knowledge_key','business_hours'
  );
end
$fn$;

revoke all on function dabbir_private.business_operating_hours_window_v1(uuid,timestamp,integer) from public,anon,authenticated;
grant execute on function dabbir_private.business_operating_hours_window_v1(uuid,timestamp,integer) to service_role;

create or replace function dabbir_private.whatsapp_ai_slot_available_branch(
  p_business_id uuid,p_branch_id uuid,p_worker_id uuid,p_starts_at timestamptz,p_ends_at timestamptz
) returns boolean
language plpgsql
stable
security definer
set search_path='pg_catalog','public','dabbir_private'
as $fn$
declare
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
  v_weekday smallint;
  v_has_schedule boolean:=false;
  v_hours jsonb;
  v_duration integer;
begin
  if p_business_id is null or p_branch_id is null or p_starts_at is null or p_ends_at is null
     or p_ends_at<=p_starts_at or p_starts_at<=now() then return false; end if;
  if not exists(
    select 1 from public.dabbir_business_branches b
    where b.business_id=p_business_id and b.id=p_branch_id and b.status='active'
  ) then return false; end if;

  select b.timezone into v_timezone from public.dabbir_businesses b where b.id=p_business_id;
  if nullif(v_timezone,'') is null then return false; end if;
  v_local_start:=p_starts_at at time zone v_timezone;
  v_local_end:=p_ends_at at time zone v_timezone;
  v_weekday:=extract(dow from v_local_start)::smallint;
  v_duration:=greatest(1,ceil(extract(epoch from (p_ends_at-p_starts_at))/60.0)::integer);
  v_hours:=dabbir_private.business_operating_hours_window_v1(p_business_id,v_local_start,v_duration);
  if coalesce((v_hours->>'configured')::boolean,false)
     and not coalesce((v_hours->>'allowed')::boolean,false) then return false; end if;

  if exists(
    select 1 from public.dabbir_calendar_busy_blocks b
    where b.business_id=p_business_id and b.starts_at<p_ends_at and b.ends_at>p_starts_at
  ) then return false; end if;

  if p_worker_id is null then
    if exists(
      select 1 from public.dabbir_appointments a
      where a.business_id=p_business_id and a.branch_id=p_branch_id and a.worker_id is null
        and a.starts_at is not null and a.status not in ('cancelled','completed','no_show')
        and a.starts_at<p_ends_at and coalesce(a.ends_at,a.starts_at+interval '60 minutes')>p_starts_at
    ) then return false; end if;
    return true;
  end if;

  if not exists(
    select 1
    from public.dabbir_workers w
    join public.dabbir_worker_branches wb
      on wb.business_id=w.business_id and wb.worker_id=w.id
     and wb.branch_id=p_branch_id and wb.active=true
    where w.business_id=p_business_id and w.id=p_worker_id and w.status='active'
  ) then return false; end if;

  select exists(
    select 1 from public.dabbir_worker_schedules s
    where s.business_id=p_business_id and s.worker_id=p_worker_id and s.active and s.schedule_type='work'
  ) into v_has_schedule;
  if v_has_schedule and not exists(
    select 1 from public.dabbir_worker_schedules s
    where s.business_id=p_business_id and s.worker_id=p_worker_id and s.weekday=v_weekday
      and s.active and s.schedule_type='work'
      and s.starts_at<=v_local_start::time and s.ends_at>=v_local_end::time
  ) then return false; end if;
  if exists(
    select 1 from public.dabbir_worker_schedules s
    where s.business_id=p_business_id and s.worker_id=p_worker_id and s.weekday=v_weekday
      and s.active and s.schedule_type in ('break','unavailable')
      and s.starts_at<v_local_end::time and s.ends_at>v_local_start::time
  ) then return false; end if;
  if exists(
    select 1 from public.dabbir_worker_time_off t
    where t.business_id=p_business_id and t.worker_id=p_worker_id
      and t.starts_at<p_ends_at and t.ends_at>p_starts_at
  ) then return false; end if;

  if exists(
    select 1 from public.dabbir_appointments a
    where a.business_id=p_business_id and a.worker_id=p_worker_id and a.starts_at is not null
      and a.status not in ('cancelled','completed','no_show')
      and a.starts_at<p_ends_at and coalesce(a.ends_at,a.starts_at+interval '60 minutes')>p_starts_at
  ) then return false; end if;
  return true;
end
$fn$;

revoke all on function dabbir_private.whatsapp_ai_slot_available_branch(uuid,uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function dabbir_private.whatsapp_ai_slot_available_branch(uuid,uuid,uuid,timestamptz,timestamptz) to service_role;

create or replace function public.dabbir_whatsapp_ai_check_availability_v2(
  p_business_id uuid,p_conversation_id uuid,p_service_id uuid,p_worker_id uuid,p_requested_local timestamp
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth','dabbir_private'
as $fn$
declare
  v_conversation public.dabbir_conversations%rowtype;
  v_service public.dabbir_services%rowtype;
  v_service_count integer:=0;
  v_hours jsonb;
  v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_conversation from public.dabbir_conversations c
  where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp'
    and c.demo_mode=false and c.state<>'closed';
  if not found or v_conversation.branch_id is null then
    return public.dabbir_whatsapp_ai_check_availability(p_business_id,p_conversation_id,p_service_id,p_worker_id,p_requested_local);
  end if;

  select count(*) into v_service_count
  from public.dabbir_services s
  join public.dabbir_branch_services bs on bs.business_id=s.business_id and bs.service_id=s.id
    and bs.branch_id=v_conversation.branch_id and bs.active=true
  where s.business_id=p_business_id and s.active=true;

  if p_service_id is not null then
    select s.* into v_service from public.dabbir_services s
    join public.dabbir_branch_services bs on bs.business_id=s.business_id and bs.service_id=s.id
      and bs.branch_id=v_conversation.branch_id and bs.active=true
    where s.business_id=p_business_id and s.id=p_service_id and s.active=true;
  elsif v_service_count=1 then
    select s.* into v_service from public.dabbir_services s
    join public.dabbir_branch_services bs on bs.business_id=s.business_id and bs.service_id=s.id
      and bs.branch_id=v_conversation.branch_id and bs.active=true
    where s.business_id=p_business_id and s.active=true limit 1;
  end if;

  if p_requested_local is not null and v_service.id is not null then
    v_hours:=dabbir_private.business_operating_hours_window_v1(
      p_business_id,p_requested_local,greatest(5,coalesce(v_service.duration_minutes,60))
    );
    if coalesce((v_hours->>'configured')::boolean,false)
       and not coalesce((v_hours->>'allowed')::boolean,false) then
      return jsonb_build_object(
        'ok',true,'state','OUTSIDE_OPERATING_HOURS','slots','[]'::jsonb,
        'branch_id',v_conversation.branch_id,'service_id',v_service.id,
        'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),
        'duration_minutes',greatest(5,coalesce(v_service.duration_minutes,60)),
        'timezone',(select b.timezone from public.dabbir_businesses b where b.id=p_business_id),
        'operating_hours',v_hours
      );
    end if;
  end if;

  v_result:=public.dabbir_whatsapp_ai_check_availability(
    p_business_id,p_conversation_id,p_service_id,p_worker_id,p_requested_local
  );
  return v_result||jsonb_build_object('operating_hours',coalesce(v_hours,'{}'::jsonb));
end
$fn$;

revoke all on function public.dabbir_whatsapp_ai_check_availability_v2(uuid,uuid,uuid,uuid,timestamp) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_check_availability_v2(uuid,uuid,uuid,uuid,timestamp) to service_role;

notify pgrst,'reload schema';
