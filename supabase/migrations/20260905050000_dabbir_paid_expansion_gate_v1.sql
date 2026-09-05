-- DABBIR paid expansion gate v1.
-- Commercial rule: no additional business/activity or non-primary branch may be created
-- until Stripe webhook truth grants the corresponding paid recurring entitlement.

create or replace function dabbir_private.owner_paid_expansion_capacity(p_user uuid default auth.uid())
returns table(additional_businesses integer, additional_branches integer)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  with owned as (
    select m.business_id, m.accepted_at
    from public.dabbir_memberships m
    where m.user_id = p_user
      and m.status = 'active'
      and m.role = 'owner'
  ), root as (
    select business_id
    from owned
    order by accepted_at nulls last, business_id
    limit 1
  )
  select
    coalesce(a.additional_businesses, 0)::integer,
    coalesce(a.additional_branches, 0)::integer
  from root r
  left join public.dabbir_billing_accounts a
    on a.business_id = r.business_id
   and a.status = 'active';
$function$;

revoke all on function dabbir_private.owner_paid_expansion_capacity(uuid) from public, anon;
grant execute on function dabbir_private.owner_paid_expansion_capacity(uuid) to authenticated, service_role;

create or replace function dabbir_private.owner_can_add_business(p_user uuid default auth.uid())
returns boolean
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  with current_owned as (
    select count(*)::integer as n
    from public.dabbir_memberships m
    where m.user_id = p_user
      and m.status = 'active'
      and m.role = 'owner'
  ), cap as (
    select * from dabbir_private.owner_paid_expansion_capacity(p_user)
  )
  select coalesce((select additional_businesses from cap),0) >= greatest(0,(select n from current_owned));
$function$;

revoke all on function dabbir_private.owner_can_add_business(uuid) from public, anon;
grant execute on function dabbir_private.owner_can_add_business(uuid) to authenticated, service_role;

create or replace function dabbir_private.owner_can_add_branch(p_user uuid default auth.uid())
returns boolean
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  with owned as (
    select m.business_id
    from public.dabbir_memberships m
    where m.user_id = p_user
      and m.status = 'active'
      and m.role = 'owner'
  ), current_extra as (
    select count(*)::integer as n
    from public.dabbir_business_branches b
    where b.business_id in (select business_id from owned)
      and b.status = 'active'
      and b.is_primary = false
  ), cap as (
    select * from dabbir_private.owner_paid_expansion_capacity(p_user)
  )
  select coalesce((select additional_branches from cap),0) > coalesce((select n from current_extra),0);
$function$;

revoke all on function dabbir_private.owner_can_add_branch(uuid) from public, anon;
grant execute on function dabbir_private.owner_can_add_branch(uuid) to authenticated, service_role;

-- Additional branches are blocked at the database policy boundary until the
-- signed Stripe webhook has increased the paid branch entitlement.
drop policy if exists dabbir_business_branches_insert on public.dabbir_business_branches;
create policy dabbir_business_branches_insert
on public.dabbir_business_branches
for insert
to authenticated
with check (
  dabbir_private.account_active()
  and dabbir_private.has_permission(business_id, 'manage_business'::text)
  and created_by = (select auth.uid())
  and (
    is_primary = true
    or dabbir_private.owner_can_add_branch((select auth.uid()))
  )
);

-- Replace onboarding RPC so the first business remains available, but every
-- subsequent business requires a paid additional-business entitlement first.
create or replace function public.dabbir_create_business(
  p_name text,
  p_business_type text,
  p_locale text default 'ar-AE'::text
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
  v_owned_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select count(*)::integer into v_owned_count
  from public.dabbir_memberships m
  where m.user_id=v_user and m.status='active' and m.role='owner';

  if v_owned_count > 0 and not dabbir_private.owner_can_add_business(v_user) then
    raise exception 'PAID_ADDITIONAL_BUSINESS_REQUIRED';
  end if;

  v_name := left(trim(p_name),120);
  if nullif(v_name,'') is null then raise exception 'BUSINESS_NAME_REQUIRED'; end if;
  if p_business_type not in ('store','laundry','car_wash','clinic','creator','salon','real_estate','services','other') then
    raise exception 'UNSUPPORTED_BUSINESS_TYPE';
  end if;

  v_slug := 'dabbir-' || substr(replace(v_id::text,'-',''),1,16);
  insert into public.dabbir_businesses(id,slug,name,business_type,owner_id,locale,demo_mode)
  values(v_id,v_slug,v_name,p_business_type,v_user,coalesce(nullif(trim(p_locale),''),'ar-AE'),false);

  insert into public.dabbir_memberships(business_id,user_id,role,status,accepted_at)
  values(v_id,v_user,'owner','active',now());

  insert into public.dabbir_business_branches(business_id,name,status,timezone,is_primary,created_by)
  values(v_id,v_name,'active','Asia/Dubai',true,v_user);

  return query select v_id,v_slug;
end;
$function$;

revoke all on function public.dabbir_create_business(text,text,text) from public, anon;
grant execute on function public.dabbir_create_business(text,text,text) to authenticated, service_role;

comment on function dabbir_private.owner_can_add_business(uuid) is
  'Fail-closed paid entitlement gate. Additional businesses require active Stripe-mirrored entitlement before creation.';
comment on function dabbir_private.owner_can_add_branch(uuid) is
  'Fail-closed paid entitlement gate. Additional non-primary branches require active Stripe-mirrored entitlement before creation.';
