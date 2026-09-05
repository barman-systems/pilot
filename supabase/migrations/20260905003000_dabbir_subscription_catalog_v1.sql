-- DABBIR subscription catalog v2.
-- Server-authoritative commercial contract for DABBIR SaaS billing.
-- Price IDs are provider references only; no card data or payment credentials are stored here.

create table if not exists public.dabbir_billing_plans (
  plan_code text primary key,
  display_name text not null,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  interval text not null check (interval in ('month','year')),
  trial_days integer not null default 0 check (trial_days between 0 and 60),
  stripe_test_price_id text,
  stripe_live_price_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_billing_plans_test_price_format check (stripe_test_price_id is null or stripe_test_price_id ~ '^price_[A-Za-z0-9]+$'),
  constraint dabbir_billing_plans_live_price_format check (stripe_live_price_id is null or stripe_live_price_id ~ '^price_[A-Za-z0-9]+$')
);

create unique index if not exists dabbir_billing_plans_test_price_uidx
  on public.dabbir_billing_plans(stripe_test_price_id)
  where stripe_test_price_id is not null;

create unique index if not exists dabbir_billing_plans_live_price_uidx
  on public.dabbir_billing_plans(stripe_live_price_id)
  where stripe_live_price_id is not null;

alter table public.dabbir_billing_plans enable row level security;
alter table public.dabbir_billing_plans force row level security;
revoke all on table public.dabbir_billing_plans from public, anon, authenticated;
grant select, insert, update, delete on table public.dabbir_billing_plans to service_role;

insert into public.dabbir_billing_plans(
  plan_code, display_name, amount_minor, currency, interval, trial_days,
  stripe_test_price_id, stripe_live_price_id, active, updated_at
)
values
  ('owner_monthly_v1', 'DABBIR Owner Base', 3999, 'AED', 'month', 14, null, null, true, now()),
  ('owner_extra_business_v1', 'DABBIR Additional Business', 2999, 'AED', 'month', 0, null, null, true, now()),
  ('owner_extra_branch_v1', 'DABBIR Additional Branch', 1999, 'AED', 'month', 0, null, null, true, now())
on conflict (plan_code) do update
set display_name=excluded.display_name,
    amount_minor=excluded.amount_minor,
    currency=excluded.currency,
    interval=excluded.interval,
    trial_days=excluded.trial_days,
    active=excluded.active,
    updated_at=now();

alter table public.dabbir_billing_accounts
  add column if not exists additional_businesses integer not null default 0,
  add column if not exists additional_branches integer not null default 0,
  add column if not exists monthly_amount_minor integer,
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb;

do $body$
begin
  if not exists (
    select 1 from pg_constraint where conname='dabbir_billing_accounts_additional_businesses_check'
  ) then
    alter table public.dabbir_billing_accounts
      add constraint dabbir_billing_accounts_additional_businesses_check check (additional_businesses >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname='dabbir_billing_accounts_additional_branches_check'
  ) then
    alter table public.dabbir_billing_accounts
      add constraint dabbir_billing_accounts_additional_branches_check check (additional_branches >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname='dabbir_billing_accounts_monthly_amount_minor_check'
  ) then
    alter table public.dabbir_billing_accounts
      add constraint dabbir_billing_accounts_monthly_amount_minor_check check (monthly_amount_minor is null or monthly_amount_minor > 0);
  end if;
end
$body$;

comment on table public.dabbir_billing_plans is
  'Server-only DABBIR subscription catalog: AED 39.99 base, AED 29.99 per additional business, AED 19.99 per additional active non-primary branch.';
comment on column public.dabbir_billing_plans.stripe_test_price_id is
  'Stripe Sandbox recurring Price ID. Null means checkout must fail closed as BILLING_PRICE_NOT_CONFIGURED.';
comment on column public.dabbir_billing_plans.stripe_live_price_id is
  'Reserved Stripe Live recurring Price ID. Live billing remains disabled until a separate release gate.';
comment on column public.dabbir_billing_accounts.pricing_snapshot is
  'Server-verified portfolio pricing quantities mirrored from Stripe subscription items; contains no card data.';
