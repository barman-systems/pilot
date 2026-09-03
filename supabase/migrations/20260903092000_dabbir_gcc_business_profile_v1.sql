-- DABBIR GCC business profile v1
-- Country is authoritative. Currency, timezone, phone prefix and the country-level
-- standard VAT default are derived server-side and cannot drift independently.

alter table public.dabbir_businesses
  add column if not exists country_code text,
  add column if not exists currency_code text,
  add column if not exists timezone text,
  add column if not exists phone_country_prefix text,
  add column if not exists vat_status text,
  add column if not exists default_vat_rate numeric(5,2);

update public.dabbir_businesses
set country_code = coalesce(nullif(upper(trim(country_code)), ''), 'AE'),
    currency_code = coalesce(nullif(upper(trim(currency_code)), ''), 'AED'),
    timezone = coalesce(nullif(trim(timezone), ''), 'Asia/Dubai'),
    phone_country_prefix = coalesce(nullif(trim(phone_country_prefix), ''), '+971'),
    vat_status = coalesce(nullif(lower(trim(vat_status)), ''), 'implemented'),
    default_vat_rate = coalesce(default_vat_rate, 5.00)
where country_code is null
   or currency_code is null
   or timezone is null
   or phone_country_prefix is null
   or vat_status is null
   or default_vat_rate is null;

alter table public.dabbir_businesses
  alter column country_code set default 'AE',
  alter column country_code set not null,
  alter column currency_code set default 'AED',
  alter column currency_code set not null,
  alter column timezone set default 'Asia/Dubai',
  alter column timezone set not null,
  alter column phone_country_prefix set default '+971',
  alter column phone_country_prefix set not null,
  alter column vat_status set default 'implemented',
  alter column vat_status set not null,
  alter column default_vat_rate set default 5.00;

alter table public.dabbir_businesses drop constraint if exists dabbir_businesses_country_code_check;
alter table public.dabbir_businesses add constraint dabbir_businesses_country_code_check
  check (country_code in ('AE','SA','KW','QA','BH','OM'));

alter table public.dabbir_businesses drop constraint if exists dabbir_businesses_gcc_profile_check;
alter table public.dabbir_businesses add constraint dabbir_businesses_gcc_profile_check check (
  (country_code='AE' and currency_code='AED' and timezone='Asia/Dubai' and phone_country_prefix='+971' and vat_status='implemented' and default_vat_rate=5.00)
  or (country_code='SA' and currency_code='SAR' and timezone='Asia/Riyadh' and phone_country_prefix='+966' and vat_status='implemented' and default_vat_rate=15.00)
  or (country_code='KW' and currency_code='KWD' and timezone='Asia/Kuwait' and phone_country_prefix='+965' and vat_status='not_implemented' and default_vat_rate is null)
  or (country_code='QA' and currency_code='QAR' and timezone='Asia/Qatar' and phone_country_prefix='+974' and vat_status='not_implemented' and default_vat_rate is null)
  or (country_code='BH' and currency_code='BHD' and timezone='Asia/Bahrain' and phone_country_prefix='+973' and vat_status='implemented' and default_vat_rate=10.00)
  or (country_code='OM' and currency_code='OMR' and timezone='Asia/Muscat' and phone_country_prefix='+968' and vat_status='implemented' and default_vat_rate=5.00)
);

create or replace function dabbir_private.sync_gcc_business_profile()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'dabbir_private', 'pg_temp'
as $function$
begin
  new.country_code := upper(trim(coalesce(new.country_code, 'AE')));

  case new.country_code
    when 'AE' then
      new.currency_code := 'AED'; new.timezone := 'Asia/Dubai'; new.phone_country_prefix := '+971'; new.vat_status := 'implemented'; new.default_vat_rate := 5.00;
    when 'SA' then
      new.currency_code := 'SAR'; new.timezone := 'Asia/Riyadh'; new.phone_country_prefix := '+966'; new.vat_status := 'implemented'; new.default_vat_rate := 15.00;
    when 'KW' then
      new.currency_code := 'KWD'; new.timezone := 'Asia/Kuwait'; new.phone_country_prefix := '+965'; new.vat_status := 'not_implemented'; new.default_vat_rate := null;
    when 'QA' then
      new.currency_code := 'QAR'; new.timezone := 'Asia/Qatar'; new.phone_country_prefix := '+974'; new.vat_status := 'not_implemented'; new.default_vat_rate := null;
    when 'BH' then
      new.currency_code := 'BHD'; new.timezone := 'Asia/Bahrain'; new.phone_country_prefix := '+973'; new.vat_status := 'implemented'; new.default_vat_rate := 10.00;
    when 'OM' then
      new.currency_code := 'OMR'; new.timezone := 'Asia/Muscat'; new.phone_country_prefix := '+968'; new.vat_status := 'implemented'; new.default_vat_rate := 5.00;
    else
      raise exception 'UNSUPPORTED_GCC_COUNTRY';
  end case;

  return new;
end;
$function$;

revoke all on function dabbir_private.sync_gcc_business_profile() from public, anon, authenticated;
grant execute on function dabbir_private.sync_gcc_business_profile() to service_role;

drop trigger if exists dabbir_sync_gcc_business_profile on public.dabbir_businesses;
create trigger dabbir_sync_gcc_business_profile
before insert or update of country_code, currency_code, timezone, phone_country_prefix, vat_status, default_vat_rate
on public.dabbir_businesses
for each row execute function dabbir_private.sync_gcc_business_profile();

-- New GCC-aware onboarding authority. No default on p_country_code so calls cannot
-- accidentally become ambiguous with the legacy three-argument function.
create or replace function public.dabbir_create_business(
  p_name text,
  p_business_type text,
  p_locale text,
  p_country_code text
)
returns table(business_id uuid, business_slug text)
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_slug text;
  v_name text;
  v_country text := upper(trim(coalesce(p_country_code, '')));
  v_timezone text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  v_name := left(trim(p_name), 120);
  if nullif(v_name, '') is null then raise exception 'BUSINESS_NAME_REQUIRED'; end if;
  if p_business_type not in ('store','laundry','car_wash','clinic','creator','salon','real_estate','services','other') then raise exception 'UNSUPPORTED_BUSINESS_TYPE'; end if;
  if v_country not in ('AE','SA','KW','QA','BH','OM') then raise exception 'UNSUPPORTED_GCC_COUNTRY'; end if;

  v_timezone := case v_country
    when 'AE' then 'Asia/Dubai'
    when 'SA' then 'Asia/Riyadh'
    when 'KW' then 'Asia/Kuwait'
    when 'QA' then 'Asia/Qatar'
    when 'BH' then 'Asia/Bahrain'
    when 'OM' then 'Asia/Muscat'
  end;
  v_slug := 'dabbir-' || substr(replace(v_id::text, '-', ''), 1, 16);

  insert into public.dabbir_businesses(id,slug,name,business_type,owner_id,locale,demo_mode,country_code)
  values(v_id,v_slug,v_name,p_business_type,v_user,coalesce(nullif(trim(p_locale),''),'ar-AE'),false,v_country);

  insert into public.dabbir_memberships(business_id,user_id,role,status,accepted_at)
  values(v_id,v_user,'owner','active',now());

  insert into public.dabbir_business_branches(business_id,name,status,timezone,is_primary,created_by)
  values(v_id,v_name,'active',v_timezone,true,v_user);

  return query select v_id, v_slug;
end;
$function$;

revoke all on function public.dabbir_create_business(text,text,text,text) from public, anon;
grant execute on function public.dabbir_create_business(text,text,text,text) to authenticated, service_role;

-- Backward compatibility for older native/web builds: they remain UAE until they
-- are upgraded to send an explicit country.
create or replace function public.dabbir_create_business(
  p_name text,
  p_business_type text,
  p_locale text default 'ar-AE'::text
)
returns table(business_id uuid, business_slug text)
language sql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  select * from public.dabbir_create_business(p_name,p_business_type,p_locale,'AE');
$function$;

revoke all on function public.dabbir_create_business(text,text,text) from public, anon;
grant execute on function public.dabbir_create_business(text,text,text) to authenticated, service_role;

create or replace function public.dabbir_set_business_country(p_business_id uuid, p_country_code text)
returns table(country_code text,currency_code text,timezone text,phone_country_prefix text,vat_status text,default_vat_rate numeric)
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_country text := upper(trim(coalesce(p_country_code,'')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_country not in ('AE','SA','KW','QA','BH','OM') then raise exception 'UNSUPPORTED_GCC_COUNTRY'; end if;

  update public.dabbir_businesses b
  set country_code=v_country, updated_at=now()
  where b.id=p_business_id;

  if not found then raise exception 'BUSINESS_ACCESS_DENIED'; end if;

  update public.dabbir_business_branches br
  set timezone=b.timezone, updated_at=now()
  from public.dabbir_businesses b
  where b.id=p_business_id and br.business_id=b.id and br.is_primary=true;

  return query
  select b.country_code,b.currency_code,b.timezone,b.phone_country_prefix,b.vat_status,b.default_vat_rate
  from public.dabbir_businesses b where b.id=p_business_id;
end;
$function$;

revoke all on function public.dabbir_set_business_country(uuid,text) from public, anon;
grant execute on function public.dabbir_set_business_country(uuid,text) to authenticated, service_role;

comment on column public.dabbir_businesses.country_code is 'ISO 3166-1 alpha-2 GCC country; authoritative source for currency/timezone/phone/VAT defaults.';
comment on column public.dabbir_businesses.currency_code is 'Derived ISO 4217 business currency. Not user-selectable independently of country.';
comment on column public.dabbir_businesses.default_vat_rate is 'Country-level standard VAT default for configuration; null where VAT is not implemented. Transaction taxability still depends on applicable law.';
