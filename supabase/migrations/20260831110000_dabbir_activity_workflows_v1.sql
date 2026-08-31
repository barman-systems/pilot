-- DABBIR activity workflows v1
-- Adds a business-facing workflow state separate from financial order status.
-- Also adds an unguessable public token for a privacy-minimized customer status page.

alter table public.dabbir_orders
  add column if not exists workflow_status text not null default 'new',
  add column if not exists workflow_updated_at timestamptz not null default now(),
  add column if not exists public_status_token uuid not null default gen_random_uuid();

alter table public.dabbir_orders
  drop constraint if exists dabbir_orders_workflow_status_check;

alter table public.dabbir_orders
  add constraint dabbir_orders_workflow_status_check
  check (workflow_status in (
    'new','confirmed','preparing','ready','received','washing','inspection',
    'waiting_approval','waiting_parts','in_progress','delivered','completed','cancelled'
  ));

create unique index if not exists dabbir_orders_public_status_token_uidx
  on public.dabbir_orders(public_status_token);

create index if not exists dabbir_orders_business_workflow_idx
  on public.dabbir_orders(business_id, workflow_status, workflow_updated_at desc);

create or replace function public.dabbir_public_order_status(p_token uuid)
returns table(
  order_id uuid,
  business_name text,
  workflow_status text,
  total_aed numeric,
  created_at timestamptz,
  workflow_updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    o.id,
    b.name,
    o.workflow_status,
    o.total_aed,
    o.created_at,
    o.workflow_updated_at
  from public.dabbir_orders o
  join public.dabbir_businesses b on b.id = o.business_id
  where o.public_status_token = p_token
    and o.simulated = false
  limit 1;
$$;

revoke all on function public.dabbir_public_order_status(uuid) from public;
grant execute on function public.dabbir_public_order_status(uuid) to anon, authenticated, service_role;
