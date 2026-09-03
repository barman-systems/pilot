-- Live Production migration 20260903192355.
-- Commission rounding follows the business market minor units instead of forcing 2 decimals.

create or replace function dabbir_private.business_currency_minor_units(p_business_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select m.currency_minor_units::integer
  from public.dabbir_businesses b
  join public.dabbir_markets m
    on m.country_code=b.country_code
   and m.currency_code=b.currency_code
   and m.is_active=true
  where b.id=p_business_id
$$;

revoke all on function dabbir_private.business_currency_minor_units(uuid) from public, anon, authenticated;

do $$
declare
  v_def text;
  v_count integer;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='dabbir_private'
    and p.proname='capture_appointment_workflow'
    and p.prokind='f'
  limit 1;

  if v_def is null then
    raise exception 'CAPTURE_APPOINTMENT_WORKFLOW_NOT_FOUND';
  end if;

  v_count := (length(v_def)-length(replace(v_def,'end,2)','')))/length('end,2)');
  if v_count <> 2 then
    raise exception 'COMMISSION_ROUNDING_SOURCE_DRIFT:%',v_count;
  end if;

  v_def := replace(
    v_def,
    'end,2)',
    'end,dabbir_private.business_currency_minor_units(new.business_id))'
  );
  execute v_def;
end
$$;
