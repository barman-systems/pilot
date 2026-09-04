-- DABBIR subscription catalog v1.
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
values(
  'owner_monthly_v1', 'DABBIR Owner Monthly', 2999, 'AED', 'month', 14,
  null, null, true, now()
)
on conflict (plan_code) do update
set display_name=excluded.display_name,
    amount_minor=excluded.amount_minor,
    currency=excluded.currency,
    interval=excluded.interval,
    trial_days=excluded.trial_days,
    active=excluded.active,
    updated_at=now();

comment on table public.dabbir_billing_plans is
  'Server-only DABBIR subscription catalog. owner_monthly_v1 is AED 29.99/month with a 14-day trial. Stripe price IDs are configured only after provider-side price verification.';
comment on column public.dabbir_billing_plans.stripe_test_price_id is
  'Stripe Sandbox recurring Price ID. Null means checkout must fail closed as BILLING_PRICE_NOT_CONFIGURED.';
comment on column public.dabbir_billing_plans.stripe_live_price_id is
  'Reserved Stripe Live recurring Price ID. Live billing remains disabled until a separate release gate.';
