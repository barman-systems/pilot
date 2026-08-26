create or replace function public.dabbir_guard_appointment_business_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  select lower(coalesce(business_type,'other')) into v_type
  from public.dabbir_businesses
  where id = new.business_id;

  if v_type = 'store' then
    raise exception 'APPOINTMENTS_NOT_ALLOWED_FOR_STORE';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_dabbir_guard_appointment_business_type on public.dabbir_appointments;
create trigger trg_dabbir_guard_appointment_business_type
before insert or update of business_id on public.dabbir_appointments
for each row execute function public.dabbir_guard_appointment_business_type();
