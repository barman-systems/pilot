-- DABBIR Stripe Billing v19
-- One Stripe subscription per business. Customer-facing access is read-only and
-- owner-scoped; webhook writes use the server-only service role after signature verification.

create table if not exists public.dabbir_billing_accounts (
  business_id uuid primary key references public.dabbir_businesses(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'not_subscribed',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  latest_invoice_id text,
  last_invoice_status text,
  stripe_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dabbir_billing_accounts_status_idx
  on public.dabbir_billing_accounts(status);
create index if not exists dabbir_billing_accounts_period_end_idx
  on public.dabbir_billing_accounts(current_period_ends_at)
  where current_period_ends_at is not null;

alter table public.dabbir_billing_accounts enable row level security;
revoke all on table public.dabbir_billing_accounts from anon;
revoke all on table public.dabbir_billing_accounts from authenticated;
grant select on table public.dabbir_billing_accounts to authenticated;
grant select, insert, update, delete on table public.dabbir_billing_accounts to service_role;

drop policy if exists dabbir_billing_accounts_owner_select on public.dabbir_billing_accounts;
create policy dabbir_billing_accounts_owner_select
on public.dabbir_billing_accounts
for select
to authenticated
using (
  exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id = dabbir_billing_accounts.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = 'owner'
  )
);

create table if not exists public.dabbir_stripe_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  stripe_created_at timestamptz,
  status text not null check (status in ('processed','failed')),
  error_code text,
  attempt_count integer not null default 1 check (attempt_count > 0),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dabbir_stripe_events_created_idx
  on public.dabbir_stripe_events(stripe_created_at desc);
create index if not exists dabbir_stripe_events_failed_idx
  on public.dabbir_stripe_events(updated_at desc)
  where status = 'failed';

alter table public.dabbir_stripe_events enable row level security;
revoke all on table public.dabbir_stripe_events from public;
revoke all on table public.dabbir_stripe_events from anon;
revoke all on table public.dabbir_stripe_events from authenticated;
grant select, insert, update, delete on table public.dabbir_stripe_events to service_role;

create or replace function public.dabbir_touch_billing_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = 'public','pg_temp'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.dabbir_touch_billing_updated_at() from public;
revoke all on function public.dabbir_touch_billing_updated_at() from anon;
revoke all on function public.dabbir_touch_billing_updated_at() from authenticated;

drop trigger if exists dabbir_billing_accounts_touch on public.dabbir_billing_accounts;
create trigger dabbir_billing_accounts_touch
before update on public.dabbir_billing_accounts
for each row execute function public.dabbir_touch_billing_updated_at();

drop trigger if exists dabbir_stripe_events_touch on public.dabbir_stripe_events;
create trigger dabbir_stripe_events_touch
before update on public.dabbir_stripe_events
for each row execute function public.dabbir_touch_billing_updated_at();
