-- DABBIR owner workspaces: one authenticated owner can operate multiple businesses,
-- while each business keeps its own branches and tenant-scoped data.
-- This migration is additive and preserves all existing business IDs and memberships.

create table if not exists public.dabbir_business_branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  timezone text not null default 'Asia/Dubai',
  phone_e164 text,
  address_text text,
  is_primary boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_business_branches_name_check check (char_length(trim(name)) between 1 and 120),
  constraint dabbir_business_branches_status_check check (status in ('active', 'inactive')),
  constraint dabbir_business_branches_timezone_check check (char_length(trim(timezone)) between 1 and 80),
  constraint dabbir_business_branches_business_pair_unique unique (id, business_id)
);

create index if not exists dabbir_business_branches_business_id_idx
  on public.dabbir_business_branches(business_id);

create index if not exists dabbir_business_branches_business_status_idx
  on public.dabbir_business_branches(business_id, status);

create unique index if not exists dabbir_business_branches_one_primary_idx
  on public.dabbir_business_branches(business_id)
  where is_primary = true;

alter table public.dabbir_business_branches enable row level security;

revoke all on table public.dabbir_business_branches from anon, authenticated;
grant select, insert, update, delete on table public.dabbir_business_branches to authenticated;
grant all on table public.dabbir_business_branches to service_role;

drop policy if exists dabbir_business_branches_select on public.dabbir_business_branches;
create policy dabbir_business_branches_select
on public.dabbir_business_branches
for select
to authenticated
using (
  dabbir_private.account_active()
  and dabbir_private.is_active_member(business_id)
);

drop policy if exists dabbir_business_branches_insert on public.dabbir_business_branches;
create policy dabbir_business_branches_insert
on public.dabbir_business_branches
for insert
to authenticated
with check (
  dabbir_private.account_active()
  and dabbir_private.has_permission(business_id, 'manage_business'::text)
  and created_by = (select auth.uid())
);

drop policy if exists dabbir_business_branches_update on public.dabbir_business_branches;
create policy dabbir_business_branches_update
on public.dabbir_business_branches
for update
to authenticated
using (
  dabbir_private.account_active()
  and dabbir_private.has_permission(business_id, 'manage_business'::text)
)
with check (
  dabbir_private.account_active()
  and dabbir_private.has_permission(business_id, 'manage_business'::text)
);

drop policy if exists dabbir_business_branches_delete on public.dabbir_business_branches;
create policy dabbir_business_branches_delete
on public.dabbir_business_branches
for delete
to authenticated
using (
  dabbir_private.account_active()
  and dabbir_private.has_permission(business_id, 'manage_business'::text)
  and is_primary = false
);

-- Every existing business receives one primary branch without changing its data model.
insert into public.dabbir_business_branches(
  business_id,
  name,
  status,
  timezone,
  is_primary,
  created_by
)
select
  b.id,
  b.name,
  'active',
  'Asia/Dubai',
  true,
  b.owner_id
from public.dabbir_businesses b
where not exists (
  select 1
  from public.dabbir_business_branches branch
  where branch.business_id = b.id
);

-- New activities get their own primary branch atomically during onboarding.
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
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_name := left(trim(p_name), 120);
  if nullif(v_name, '') is null then
    raise exception 'BUSINESS_NAME_REQUIRED';
  end if;

  if p_business_type not in (
    'store',
    'laundry',
    'car_wash',
    'clinic',
    'creator',
    'salon',
    'real_estate',
    'services',
    'other'
  ) then
    raise exception 'UNSUPPORTED_BUSINESS_TYPE';
  end if;

  v_slug := 'dabbir-' || substr(replace(v_id::text, '-', ''), 1, 16);

  insert into public.dabbir_businesses(
    id,
    slug,
    name,
    business_type,
    owner_id,
    locale,
    demo_mode
  ) values (
    v_id,
    v_slug,
    v_name,
    p_business_type,
    v_user,
    coalesce(nullif(trim(p_locale), ''), 'ar-AE'),
    false
  );

  insert into public.dabbir_memberships(
    business_id,
    user_id,
    role,
    status,
    accepted_at
  ) values (
    v_id,
    v_user,
    'owner',
    'active',
    now()
  );

  insert into public.dabbir_business_branches(
    business_id,
    name,
    status,
    timezone,
    is_primary,
    created_by
  ) values (
    v_id,
    v_name,
    'active',
    'Asia/Dubai',
    true,
    v_user
  );

  return query select v_id, v_slug;
end;
$function$;

revoke all on function public.dabbir_create_business(text, text, text) from public, anon;
grant execute on function public.dabbir_create_business(text, text, text) to authenticated, service_role;

-- One RLS-aware query supplies the owner portfolio without N queries per business.
create or replace function public.dabbir_owner_business_metrics()
returns table(
  business_id uuid,
  customers_total bigint,
  appointments_today bigint,
  orders_today bigint,
  revenue_today_aed numeric,
  branches_total bigint
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  with active_businesses as (
    select m.business_id
    from public.dabbir_memberships m
    where m.user_id = (select auth.uid())
      and m.status = 'active'
  ), bounds as (
    select
      ((now() at time zone 'Asia/Dubai')::date at time zone 'Asia/Dubai') as day_start,
      (((now() at time zone 'Asia/Dubai')::date + 1) at time zone 'Asia/Dubai') as day_end
  )
  select
    ab.business_id,
    (select count(*) from public.dabbir_customers c where c.business_id = ab.business_id) as customers_total,
    (select count(*) from public.dabbir_appointments a, bounds b
      where a.business_id = ab.business_id
        and a.simulated = false
        and a.starts_at >= b.day_start
        and a.starts_at < b.day_end) as appointments_today,
    (select count(*) from public.dabbir_orders o, bounds b
      where o.business_id = ab.business_id
        and o.simulated = false
        and o.created_at >= b.day_start
        and o.created_at < b.day_end) as orders_today,
    coalesce((select sum(o.total_aed) from public.dabbir_orders o, bounds b
      where o.business_id = ab.business_id
        and o.simulated = false
        and o.created_at >= b.day_start
        and o.created_at < b.day_end), 0)::numeric as revenue_today_aed,
    (select count(*) from public.dabbir_business_branches branch
      where branch.business_id = ab.business_id
        and branch.status = 'active') as branches_total
  from active_businesses ab;
$function$;

revoke all on function public.dabbir_owner_business_metrics() from public, anon;
grant execute on function public.dabbir_owner_business_metrics() to authenticated, service_role;

comment on table public.dabbir_business_branches is
  'Branches belonging to one DABBIR business. Business data remains tenant-scoped by business_id.';

comment on function public.dabbir_create_business(text, text, text) is
  'Creates a DABBIR business, active owner membership, and primary branch in one transaction.';

comment on function public.dabbir_owner_business_metrics() is
  'RLS-aware owner portfolio metrics across the authenticated users active DABBIR memberships.';
