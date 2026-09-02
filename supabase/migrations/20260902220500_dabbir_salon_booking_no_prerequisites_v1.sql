-- Quick booking must always be available. Customer, employee and service are
-- optional; a missing time falls back to 30 minutes from now.
create or replace function dabbir_private.salon_member_scope(p_business_id uuid,p_worker_id uuid,p_manage boolean default false)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select case
    when not dabbir_private.has_permission(p_business_id,case when p_manage then 'manage_appointments' else 'view_appointments' end) then false
    when not exists(select 1 from public.dabbir_businesses b where b.id=p_business_id and b.business_type='salon') then true
    when p_worker_id is null then true
    when exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','manager')) then true
    else exists(select 1 from public.dabbir_workers w where w.business_id=p_business_id and w.id=p_worker_id and w.membership_user_id=(select auth.uid()) and w.status='active')
  end;
$$;
revoke all on function dabbir_private.salon_member_scope(uuid,uuid,boolean) from public,anon,authenticated;

create or replace function dabbir_private.prevent_appointment_calendar_conflict()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_end timestamptz;
  v_timezone text := 'Asia/Dubai';
  v_local_start timestamp;
  v_local_end timestamp;
  v_weekday smallint;
  v_has_schedule boolean;
begin
  if new.starts_at is null or new.status in ('cancelled','completed','no_show') then return new; end if;
  v_end := coalesce(new.ends_at,new.starts_at+interval '60 minutes');
  if v_end <= new.starts_at then raise exception 'INVALID_APPOINTMENT_RANGE'; end if;

  select coalesce(s.timezone,'Asia/Dubai') into v_timezone
  from public.dabbir_salon_settings s where s.business_id=new.business_id;
  v_local_start := new.starts_at at time zone v_timezone;
  v_local_end := v_end at time zone v_timezone;
  v_weekday := extract(dow from v_local_start)::smallint;

  if new.worker_id is not null then
    select exists(select 1 from public.dabbir_worker_schedules s where s.business_id=new.business_id and s.worker_id=new.worker_id and s.active and s.schedule_type='work') into v_has_schedule;
    if v_has_schedule and not exists(
      select 1 from public.dabbir_worker_schedules s
      where s.business_id=new.business_id and s.worker_id=new.worker_id and s.weekday=v_weekday
        and s.active and s.schedule_type='work'
        and s.starts_at <= v_local_start::time and s.ends_at >= v_local_end::time
    ) then raise exception 'WORKER_OUTSIDE_SCHEDULE'; end if;

    if exists(
      select 1 from public.dabbir_worker_schedules s
      where s.business_id=new.business_id and s.worker_id=new.worker_id and s.weekday=v_weekday
        and s.active and s.schedule_type in ('break','unavailable')
        and s.starts_at < v_local_end::time and s.ends_at > v_local_start::time
    ) then raise exception 'WORKER_UNAVAILABLE'; end if;

    if exists(
      select 1 from public.dabbir_worker_time_off t
      where t.business_id=new.business_id and t.worker_id=new.worker_id
        and t.starts_at < v_end and t.ends_at > new.starts_at
    ) then raise exception 'WORKER_TIME_OFF'; end if;
  end if;

  if exists(
    select 1 from public.dabbir_calendar_busy_blocks b
    where b.business_id=new.business_id and b.starts_at < v_end and b.ends_at > new.starts_at
  ) then raise exception 'APPOINTMENT_CALENDAR_CONFLICT'; end if;

  if new.worker_id is not null and exists(
    select 1 from public.dabbir_appointments a
    where a.business_id=new.business_id
      and a.id <> coalesce(new.id,gen_random_uuid())
      and a.starts_at is not null
      and a.status not in ('cancelled','completed','no_show')
      and a.worker_id=new.worker_id
      and a.starts_at < v_end
      and coalesce(a.ends_at,a.starts_at+interval '60 minutes') > new.starts_at
  ) then raise exception 'APPOINTMENT_TIME_CONFLICT'; end if;
  return new;
end;
$$;
revoke all on function dabbir_private.prevent_appointment_calendar_conflict() from public,anon,authenticated;

create or replace function public.dabbir_salon_quick_book(
  p_business_id uuid,
  p_customer_name text default '',
  p_customer_phone text default '',
  p_service_id uuid default null,
  p_worker_id uuid default null,
  p_starts_at timestamptz default null,
  p_discount_aed numeric default 0,
  p_notes text default '',
  p_source text default 'internal'
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_customer_id uuid;
  v_service_id uuid := p_service_id;
  v_worker_id uuid := p_worker_id;
  v_duration integer := 60;
  v_price numeric := 0;
  v_discount numeric := 0;
  v_name_ar text;
  v_name_en text;
  v_appointment_id uuid;
  v_start timestamptz := coalesce(p_starts_at,now()+interval '30 minutes');
  v_end timestamptz;
  v_customer_name text := nullif(left(trim(coalesce(p_customer_name,'')),120),'');
  v_customer_phone text := nullif(trim(coalesce(p_customer_phone,'')),'');
begin
  if not dabbir_private.has_permission(p_business_id,'manage_appointments') then raise exception 'APPOINTMENT_MANAGEMENT_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_businesses where id=p_business_id and business_type='salon') then raise exception 'SALON_MODE_REQUIRED'; end if;
  if v_start<=now() then raise exception 'INVALID_START_TIME'; end if;
  if coalesce(p_source,'internal') not in ('internal','web','whatsapp','phone','walk_in','rebook','waitlist','calendar_sync') then raise exception 'INVALID_BOOKING_SOURCE'; end if;

  if v_worker_id is not null and not exists(
    select 1 from public.dabbir_workers w
    where w.business_id=p_business_id and w.id=v_worker_id and w.status='active'
  ) then
    v_worker_id := null;
  end if;

  if v_service_id is not null then
    select coalesce(ws.duration_minutes,s.duration_minutes,60),
           coalesce(ws.price_aed,s.price_aed,0),
           coalesce(s.name_ar,s.name),
           coalesce(s.name_en,s.name)
      into v_duration,v_price,v_name_ar,v_name_en
    from public.dabbir_services s
    left join public.dabbir_worker_services ws
      on ws.business_id=s.business_id
     and ws.service_id=s.id
     and ws.worker_id=v_worker_id
     and ws.active
    where s.business_id=p_business_id and s.id=v_service_id and s.active;
    if not found then
      v_service_id := null;
      v_duration := 60;
      v_price := 0;
      v_name_ar := null;
      v_name_en := null;
    end if;
  end if;

  v_discount := least(greatest(coalesce(p_discount_aed,0),0),coalesce(v_price,0));
  v_end := v_start+make_interval(mins=>greatest(5,coalesce(v_duration,60)));

  if v_customer_phone is not null then
    select id into v_customer_id
    from public.dabbir_customers
    where business_id=p_business_id and phone_e164=v_customer_phone
    limit 1;
  end if;

  if v_customer_id is null and (v_customer_name is not null or v_customer_phone is not null)
     and dabbir_private.has_permission(p_business_id,'edit_customers') then
    insert into public.dabbir_customers(business_id,display_name,phone_e164,lead_status,metadata)
    values(p_business_id,coalesce(v_customer_name,'عميل'),v_customer_phone,'converted',jsonb_build_object('source','salon_quick_booking'))
    returning id into v_customer_id;
  elsif v_customer_id is not null and v_customer_name is not null
        and dabbir_private.has_permission(p_business_id,'edit_customers') then
    update public.dabbir_customers
    set display_name=v_customer_name,updated_at=now()
    where business_id=p_business_id and id=v_customer_id;
  end if;

  insert into public.dabbir_appointments(
    business_id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,
    quoted_price_aed,discount_aed,notes,booking_source,payment_status
  ) values(
    p_business_id,v_customer_id,v_service_id,v_worker_id,v_start,v_end,'new',false,
    coalesce(v_price,0),v_discount,left(coalesce(p_notes,''),2000),coalesce(p_source,'internal'),'unpaid'
  ) returning id into v_appointment_id;

  if v_service_id is not null then
    insert into public.dabbir_appointment_services(
      business_id,appointment_id,service_id,worker_id,service_name_ar,service_name_en,
      duration_minutes,unit_price_aed,discount_aed
    ) values(
      p_business_id,v_appointment_id,v_service_id,v_worker_id,
      coalesce(v_name_ar,'خدمة'),coalesce(v_name_en,'Service'),
      greatest(5,coalesce(v_duration,60)),coalesce(v_price,0),v_discount
    );
  end if;

  return jsonb_build_object(
    'appointment_id',v_appointment_id,
    'customer_id',v_customer_id,
    'service_id',v_service_id,
    'worker_id',v_worker_id,
    'starts_at',v_start,
    'ends_at',v_end,
    'status','new'
  );
end;
$$;

revoke all on function public.dabbir_salon_quick_book(uuid,text,text,uuid,uuid,timestamptz,numeric,text,text) from public,anon;
grant execute on function public.dabbir_salon_quick_book(uuid,text,text,uuid,uuid,timestamptz,numeric,text,text) to authenticated;
