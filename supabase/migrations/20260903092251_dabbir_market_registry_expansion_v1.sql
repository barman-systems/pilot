create table if not exists public.dabbir_markets (
  country_code text primary key,
  region_group text not null default 'GCC',
  name_ar text not null,
  name_en text not null,
  currency_code text not null,
  currency_minor_units smallint not null default 2,
  timezone text not null,
  phone_country_prefix text not null,
  locale_region text not null,
  vat_status text not null,
  default_vat_rate numeric(5,2),
  is_active boolean not null default true,
  sort_order smallint not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_markets_country_code_format check (country_code ~ '^[A-Z]{2}$'),
  constraint dabbir_markets_currency_code_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint dabbir_markets_currency_minor_units_check check (currency_minor_units between 0 and 3),
  constraint dabbir_markets_vat_status_check check (vat_status in ('implemented','not_implemented')),
  constraint dabbir_markets_vat_shape_check check (
    (vat_status='implemented' and default_vat_rate is not null and default_vat_rate >= 0 and default_vat_rate <= 100)
    or (vat_status='not_implemented' and default_vat_rate is null)
  )
);

alter table public.dabbir_markets enable row level security;
revoke all on table public.dabbir_markets from public, anon, authenticated;
grant select on table public.dabbir_markets to anon, authenticated;
grant select, insert, update, delete on table public.dabbir_markets to service_role;
drop policy if exists dabbir_markets_public_read on public.dabbir_markets;
create policy dabbir_markets_public_read on public.dabbir_markets
for select to anon, authenticated using (is_active = true);

insert into public.dabbir_markets(
  country_code,region_group,name_ar,name_en,currency_code,currency_minor_units,timezone,phone_country_prefix,locale_region,vat_status,default_vat_rate,is_active,sort_order
) values
  ('AE','GCC','الإمارات العربية المتحدة','United Arab Emirates','AED',2,'Asia/Dubai','+971','AE','implemented',5.00,true,10),
  ('SA','GCC','السعودية','Saudi Arabia','SAR',2,'Asia/Riyadh','+966','SA','implemented',15.00,true,20),
  ('KW','GCC','الكويت','Kuwait','KWD',3,'Asia/Kuwait','+965','KW','not_implemented',null,true,30),
  ('QA','GCC','قطر','Qatar','QAR',2,'Asia/Qatar','+974','QA','not_implemented',null,true,40),
  ('BH','GCC','البحرين','Bahrain','BHD',3,'Asia/Bahrain','+973','BH','implemented',10.00,true,50),
  ('OM','GCC','عُمان','Oman','OMR',3,'Asia/Muscat','+968','OM','implemented',5.00,true,60)
on conflict (country_code) do update set
  region_group=excluded.region_group,
  name_ar=excluded.name_ar,
  name_en=excluded.name_en,
  currency_code=excluded.currency_code,
  currency_minor_units=excluded.currency_minor_units,
  timezone=excluded.timezone,
  phone_country_prefix=excluded.phone_country_prefix,
  locale_region=excluded.locale_region,
  vat_status=excluded.vat_status,
  default_vat_rate=excluded.default_vat_rate,
  is_active=excluded.is_active,
  sort_order=excluded.sort_order,
  updated_at=now();

alter table public.dabbir_businesses drop constraint if exists dabbir_businesses_country_code_check;
alter table public.dabbir_businesses drop constraint if exists dabbir_businesses_gcc_profile_check;
alter table public.dabbir_businesses drop constraint if exists dabbir_businesses_country_market_fkey;
alter table public.dabbir_businesses add constraint dabbir_businesses_country_market_fkey
  foreign key (country_code) references public.dabbir_markets(country_code) on update cascade on delete restrict not valid;
alter table public.dabbir_businesses validate constraint dabbir_businesses_country_market_fkey;

create or replace function dabbir_private.sync_gcc_business_profile()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'dabbir_private', 'pg_temp'
as $function$
declare
  v_market public.dabbir_markets%rowtype;
begin
  new.country_code := upper(trim(coalesce(new.country_code, 'AE')));

  select * into v_market
  from public.dabbir_markets
  where country_code = new.country_code and is_active = true;

  if not found then
    raise exception 'UNSUPPORTED_MARKET';
  end if;

  new.currency_code := v_market.currency_code;
  new.timezone := v_market.timezone;
  new.phone_country_prefix := v_market.phone_country_prefix;
  new.vat_status := v_market.vat_status;
  new.default_vat_rate := v_market.default_vat_rate;
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
  v_locale_region text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  v_name := left(trim(p_name), 120);
  if nullif(v_name, '') is null then raise exception 'BUSINESS_NAME_REQUIRED'; end if;
  if p_business_type not in ('store','laundry','car_wash','clinic','creator','salon','real_estate','services','other') then raise exception 'UNSUPPORTED_BUSINESS_TYPE'; end if;

  select timezone, locale_region into v_timezone, v_locale_region
  from public.dabbir_markets
  where country_code=v_country and is_active=true;
  if not found then raise exception 'UNSUPPORTED_MARKET'; end if;

  v_slug := 'dabbir-' || substr(replace(v_id::text, '-', ''), 1, 16);

  insert into public.dabbir_businesses(id,slug,name,business_type,owner_id,locale,demo_mode,country_code)
  values(v_id,v_slug,v_name,p_business_type,v_user,coalesce(nullif(trim(p_locale),''),'ar-'||v_locale_region),false,v_country);

  insert into public.dabbir_memberships(business_id,user_id,role,status,accepted_at)
  values(v_id,v_user,'owner','active',now());

  insert into public.dabbir_business_branches(business_id,name,status,timezone,is_primary,created_by)
  values(v_id,v_name,'active',v_timezone,true,v_user);

  return query select v_id, v_slug;
end;
$function$;

revoke all on function public.dabbir_create_business(text,text,text,text) from public, anon;
grant execute on function public.dabbir_create_business(text,text,text,text) to authenticated, service_role;

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
  if not exists(select 1 from public.dabbir_markets where country_code=v_country and is_active=true) then
    raise exception 'UNSUPPORTED_MARKET';
  end if;

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

comment on table public.dabbir_markets is 'DABBIR market registry. Add or disable markets here instead of duplicating country rules across product code.';
comment on column public.dabbir_markets.currency_minor_units is 'ISO currency minor-unit precision used for display and payment amount conversion.';
comment on column public.dabbir_businesses.country_code is 'ISO 3166-1 alpha-2 market code referencing dabbir_markets; authoritative source for derived business localization.';
