begin;

-- Preserve compatibility with the currently deployed generic appointment writer while
-- Salon Mode rolls out. Salon Mode itself writes the canonical new/confirmed states.
alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_status_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_status_check
  check (status in ('requested','rescheduled','new','confirmed','arrived','in_progress','completed','cancelled','no_show'));

create or replace function public.dabbir_salon_transition_appointment(p_business_id uuid,p_appointment_id uuid,p_status text)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_current public.dabbir_appointments%rowtype;v_allowed boolean;v_from text;
begin
  if not dabbir_private.has_permission(p_business_id,'manage_appointments') then raise exception 'APPOINTMENT_MANAGEMENT_REQUIRED'; end if;
  select * into v_current from public.dabbir_appointments where business_id=p_business_id and id=p_appointment_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_from:=case v_current.status when 'requested' then 'new' when 'rescheduled' then 'confirmed' else v_current.status end;
  v_allowed:=case v_from
    when 'new' then p_status in ('confirmed','cancelled','no_show')
    when 'confirmed' then p_status in ('arrived','cancelled','no_show')
    when 'arrived' then p_status in ('in_progress','cancelled','no_show')
    when 'in_progress' then p_status in ('completed','cancelled')
    else false end;
  if not v_allowed then raise exception 'INVALID_STATUS_TRANSITION'; end if;
  update public.dabbir_appointments set status=p_status,updated_at=now() where business_id=p_business_id and id=p_appointment_id;
  return jsonb_build_object('appointment_id',p_appointment_id,'from_status',v_current.status,'to_status',p_status);
end;
$$;

create or replace function public.dabbir_salon_today(p_business_id uuid,p_day date default current_date)
returns jsonb
language sql
security invoker
stable
set search_path=public,pg_temp
as $$
with settings as (select coalesce((select timezone from public.dabbir_salon_settings where business_id=p_business_id),'Asia/Dubai') tz),
bounds as (select p_day::timestamp at time zone tz as s,(p_day+1)::timestamp at time zone tz as e from settings),
a as (select x.* from public.dabbir_appointments x,bounds b where x.business_id=p_business_id and x.starts_at>=b.s and x.starts_at<b.e),
c as (select coalesce(sum(revenue_aed),0) revenue,coalesce(sum(commission_aed),0) commission from public.dabbir_commissions,bounds b where business_id=p_business_id and status='earned' and generated_at>=b.s and generated_at<b.e)
select jsonb_build_object(
  'day',p_day,
  'bookings',count(*),
  'new',count(*) filter(where status in ('new','requested')),
  'confirmed',count(*) filter(where status in ('confirmed','rescheduled')),
  'arrived',count(*) filter(where status='arrived'),
  'in_progress',count(*) filter(where status='in_progress'),
  'completed',count(*) filter(where status='completed'),
  'cancelled',count(*) filter(where status='cancelled'),
  'no_show',count(*) filter(where status='no_show'),
  'expected_revenue_aed',coalesce(sum(greatest(0,quoted_price_aed-discount_aed)) filter(where status not in ('cancelled','no_show')),0),
  'realized_revenue_aed',(select revenue from c),
  'commissions_aed',(select commission from c),
  'unconfirmed',count(*) filter(where status in ('new','requested')),
  'appointments',coalesce(jsonb_agg(to_jsonb(a) order by starts_at) filter(where a.id is not null),'[]'::jsonb)
) from a;
$$;

revoke all on function public.dabbir_salon_transition_appointment(uuid,uuid,text) from public,anon;
revoke all on function public.dabbir_salon_today(uuid,date) from public,anon;
grant execute on function public.dabbir_salon_transition_appointment(uuid,uuid,text) to authenticated;
grant execute on function public.dabbir_salon_today(uuid,date) to authenticated;

commit;
