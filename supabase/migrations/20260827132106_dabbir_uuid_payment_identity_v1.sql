-- DABBIR UUID + creator offer/payment identity v1
-- Canonical DABBIR user_id remains auth.users.id (UUID).
-- Adds immutable UUID identities for creator, offer, payment account, payment and webhook event.

comment on column public.dabbir_memberships.user_id is
  'Canonical DABBIR user_id UUID. References auth.users.id. Never substitute email, phone, Stripe IDs or other external identifiers.';
comment on column public.dabbir_businesses.owner_id is
  'Canonical owner user UUID. References auth.users.id; external provider IDs must stay in provider-specific columns/tables.';

create table if not exists public.dabbir_creator_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.dabbir_businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_creator_profiles_id_business_key unique (id,business_id)
);

comment on column public.dabbir_creator_profiles.id is
  'Canonical celebrity_id / creator_id UUID inside DABBIR.';
comment on column public.dabbir_creator_profiles.user_id is
  'Registered DABBIR user UUID when the creator has a login; references auth.users.id.';

create table if not exists public.dabbir_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,
  business_id uuid not null,
  provider text not null default 'stripe' check (provider = 'stripe'),
  environment text not null default 'test' check (environment in ('test','live')),
  external_account_id text not null,
  status text not null default 'pending' check (status in ('pending','restricted','ready','disabled')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_payment_accounts_creator_business_fkey
    foreign key (creator_id,business_id)
    references public.dabbir_creator_profiles(id,business_id)
    on delete restrict,
  constraint dabbir_payment_accounts_business_environment_key
    unique (provider,environment,business_id),
  constraint dabbir_payment_accounts_external_key
    unique (provider,environment,external_account_id),
  constraint dabbir_payment_accounts_route_key
    unique (id,creator_id,business_id,provider,environment)
);

comment on column public.dabbir_payment_accounts.id is
  'Internal payment_account_id UUID. The Stripe acct_* identifier is external_account_id and is never used as the DABBIR primary key.';

create table if not exists public.dabbir_offers (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,
  creator_business_id uuid not null,
  advertiser_business_id uuid references public.dabbir_businesses(id) on delete set null,
  payer_user_id uuid references auth.users(id) on delete set null,
  payer_customer_id uuid references public.dabbir_customers(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  title text,
  description text,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','payment_pending','paid','expired','cancelled')),
  expires_at timestamptz,
  accepted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_offers_creator_business_fkey
    foreign key (creator_id,creator_business_id)
    references public.dabbir_creator_profiles(id,business_id)
    on delete restrict
);

comment on column public.dabbir_offers.id is
  'Canonical offer_id UUID. One commercial offer has one stable DABBIR identifier independent of Stripe.';
comment on column public.dabbir_offers.payer_user_id is
  'Canonical DABBIR user_id of the payer when the payer is registered. Stripe customer IDs remain external identifiers.';

create table if not exists public.dabbir_payments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.dabbir_offers(id) on delete restrict,
  creator_id uuid not null,
  recipient_business_id uuid not null,
  payer_business_id uuid references public.dabbir_businesses(id) on delete set null,
  payer_user_id uuid references auth.users(id) on delete set null,
  payer_customer_id uuid references public.dabbir_customers(id) on delete set null,
  payment_account_id uuid not null,
  provider text not null default 'stripe' check (provider = 'stripe'),
  environment text not null default 'test' check (environment in ('test','live')),
  gross_amount_minor bigint not null check (gross_amount_minor > 0),
  platform_fee_minor bigint not null default 0 check (platform_fee_minor >= 0),
  creator_amount_minor bigint not null check (creator_amount_minor >= 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'created' check (status in ('created','checkout_open','processing','paid','failed','expired','cancelled','refunded','partially_refunded')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  checkout_expires_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_payments_amount_split_check
    check (platform_fee_minor + creator_amount_minor <= gross_amount_minor),
  constraint dabbir_payments_account_route_fkey
    foreign key (payment_account_id,creator_id,recipient_business_id,provider,environment)
    references public.dabbir_payment_accounts(id,creator_id,business_id,provider,environment)
    on delete restrict
);

comment on column public.dabbir_payments.id is
  'Canonical payment_id UUID. This is the internal payment identity and should be sent to Stripe as client/reference metadata.';
comment on column public.dabbir_payments.stripe_checkout_session_id is
  'External Stripe Checkout Session ID. Never used as the DABBIR primary key.';
comment on column public.dabbir_payments.stripe_payment_intent_id is
  'External Stripe PaymentIntent ID. Never used as the DABBIR primary key.';
comment on column public.dabbir_payments.stripe_customer_id is
  'External Stripe Customer ID for reconciliation; payer_user_id is the canonical registered DABBIR identity.';

create table if not exists public.dabbir_payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.dabbir_payments(id) on delete set null,
  provider text not null default 'stripe' check (provider = 'stripe'),
  environment text not null default 'test' check (environment in ('test','live')),
  provider_event_id text not null,
  event_type text not null,
  payload_sha256 text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  constraint dabbir_payment_events_provider_event_key unique (provider,environment,provider_event_id)
);

comment on column public.dabbir_payment_events.id is
  'Canonical webhook event UUID inside DABBIR; provider_event_id stores Stripe evt_* for idempotency.';

create index if not exists dabbir_creator_profiles_user_idx on public.dabbir_creator_profiles(user_id);
create index if not exists dabbir_payment_accounts_creator_idx on public.dabbir_payment_accounts(creator_id);
create index if not exists dabbir_offers_creator_idx on public.dabbir_offers(creator_id,created_at desc);
create index if not exists dabbir_offers_creator_business_idx on public.dabbir_offers(creator_business_id,created_at desc);
create index if not exists dabbir_offers_advertiser_business_idx on public.dabbir_offers(advertiser_business_id,created_at desc) where advertiser_business_id is not null;
create index if not exists dabbir_offers_payer_user_idx on public.dabbir_offers(payer_user_id,created_at desc) where payer_user_id is not null;
create index if not exists dabbir_offers_payer_customer_idx on public.dabbir_offers(payer_customer_id,created_at desc) where payer_customer_id is not null;
create index if not exists dabbir_payments_offer_idx on public.dabbir_payments(offer_id,created_at desc);
create index if not exists dabbir_payments_creator_idx on public.dabbir_payments(creator_id,created_at desc);
create index if not exists dabbir_payments_recipient_business_idx on public.dabbir_payments(recipient_business_id,created_at desc);
create index if not exists dabbir_payments_payer_user_idx on public.dabbir_payments(payer_user_id,created_at desc) where payer_user_id is not null;
create index if not exists dabbir_payments_payer_business_idx on public.dabbir_payments(payer_business_id,created_at desc) where payer_business_id is not null;
create index if not exists dabbir_payments_status_idx on public.dabbir_payments(status,created_at desc);
create unique index if not exists dabbir_payments_checkout_session_uidx
  on public.dabbir_payments(provider,environment,stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create unique index if not exists dabbir_payments_payment_intent_uidx
  on public.dabbir_payments(provider,environment,stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists dabbir_payment_events_payment_idx on public.dabbir_payment_events(payment_id,received_at desc);

-- Keep creator profile identity synchronized with creator businesses.
create or replace function dabbir_private.sync_creator_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.business_type = 'creator' then
    insert into public.dabbir_creator_profiles(business_id,user_id,status)
    values(new.id,new.owner_id,'active')
    on conflict (business_id) do update
      set user_id = excluded.user_id,
          status = 'active',
          updated_at = now();
  elsif tg_op = 'UPDATE' and old.business_type = 'creator' and new.business_type <> 'creator' then
    update public.dabbir_creator_profiles
       set status = 'inactive', updated_at = now()
     where business_id = new.id;
  end if;
  return new;
end;
$function$;
revoke all on function dabbir_private.sync_creator_profile() from public, anon, authenticated;

drop trigger if exists dabbir_sync_creator_profile on public.dabbir_businesses;
create trigger dabbir_sync_creator_profile
after insert or update of business_type,owner_id on public.dabbir_businesses
for each row execute function dabbir_private.sync_creator_profile();

-- Backfill a stable creator_id for creator businesses that already exist.
insert into public.dabbir_creator_profiles(business_id,user_id,status)
select b.id,b.owner_id,'active'
from public.dabbir_businesses b
where b.business_type='creator'
on conflict (business_id) do update
set user_id=excluded.user_id,
    status='active',
    updated_at=now();

-- Freeze payment routing identity after a payment is created and validate it against its offer/account.
create or replace function dabbir_private.validate_payment_identity_route()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_offer public.dabbir_offers%rowtype;
  v_account public.dabbir_payment_accounts%rowtype;
begin
  if tg_op='UPDATE' and (
       new.offer_id is distinct from old.offer_id
    or new.creator_id is distinct from old.creator_id
    or new.recipient_business_id is distinct from old.recipient_business_id
    or new.payer_business_id is distinct from old.payer_business_id
    or new.payer_user_id is distinct from old.payer_user_id
    or new.payer_customer_id is distinct from old.payer_customer_id
    or new.payment_account_id is distinct from old.payment_account_id
    or new.provider is distinct from old.provider
    or new.environment is distinct from old.environment
    or new.gross_amount_minor is distinct from old.gross_amount_minor
    or new.platform_fee_minor is distinct from old.platform_fee_minor
    or new.creator_amount_minor is distinct from old.creator_amount_minor
    or new.currency is distinct from old.currency
  ) then
    raise exception 'DABBIR_PAYMENT_IDENTITY_ROUTE_IMMUTABLE';
  end if;

  select * into v_offer from public.dabbir_offers where id=new.offer_id;
  if not found then raise exception 'DABBIR_OFFER_NOT_FOUND'; end if;

  if new.creator_id <> v_offer.creator_id
     or new.recipient_business_id <> v_offer.creator_business_id
     or new.gross_amount_minor <> v_offer.amount_minor
     or upper(new.currency) <> upper(v_offer.currency) then
    raise exception 'DABBIR_PAYMENT_OFFER_ROUTE_MISMATCH';
  end if;

  if v_offer.advertiser_business_id is not null
     and new.payer_business_id is distinct from v_offer.advertiser_business_id then
    raise exception 'DABBIR_PAYMENT_PAYER_BUSINESS_MISMATCH';
  end if;
  if v_offer.payer_user_id is not null
     and new.payer_user_id is distinct from v_offer.payer_user_id then
    raise exception 'DABBIR_PAYMENT_PAYER_USER_MISMATCH';
  end if;
  if v_offer.payer_customer_id is not null
     and new.payer_customer_id is distinct from v_offer.payer_customer_id then
    raise exception 'DABBIR_PAYMENT_PAYER_CUSTOMER_MISMATCH';
  end if;

  select * into v_account from public.dabbir_payment_accounts where id=new.payment_account_id;
  if not found then raise exception 'DABBIR_PAYMENT_ACCOUNT_NOT_FOUND'; end if;

  if v_account.creator_id <> new.creator_id
     or v_account.business_id <> new.recipient_business_id
     or v_account.provider <> new.provider
     or v_account.environment <> new.environment then
    raise exception 'DABBIR_PAYMENT_ACCOUNT_ROUTE_MISMATCH';
  end if;

  new.currency := upper(new.currency);
  return new;
end;
$function$;
revoke all on function dabbir_private.validate_payment_identity_route() from public, anon, authenticated;

drop trigger if exists dabbir_validate_payment_identity_route on public.dabbir_payments;
create trigger dabbir_validate_payment_identity_route
before insert or update on public.dabbir_payments
for each row execute function dabbir_private.validate_payment_identity_route();

-- Once an offer leaves draft, its identity and commercial terms are immutable.
create or replace function dabbir_private.guard_offer_identity_terms()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op='UPDATE' and old.status <> 'draft' and (
       new.creator_id is distinct from old.creator_id
    or new.creator_business_id is distinct from old.creator_business_id
    or new.advertiser_business_id is distinct from old.advertiser_business_id
    or new.payer_user_id is distinct from old.payer_user_id
    or new.payer_customer_id is distinct from old.payer_customer_id
    or new.amount_minor is distinct from old.amount_minor
    or new.currency is distinct from old.currency
  ) then
    raise exception 'DABBIR_OFFER_IDENTITY_TERMS_IMMUTABLE';
  end if;
  new.currency := upper(new.currency);
  return new;
end;
$function$;
revoke all on function dabbir_private.guard_offer_identity_terms() from public, anon, authenticated;

drop trigger if exists dabbir_guard_offer_identity_terms on public.dabbir_offers;
create trigger dabbir_guard_offer_identity_terms
before update on public.dabbir_offers
for each row execute function dabbir_private.guard_offer_identity_terms();

-- Standard updated_at handling.
drop trigger if exists dabbir_creator_profiles_set_updated_at on public.dabbir_creator_profiles;
create trigger dabbir_creator_profiles_set_updated_at before update on public.dabbir_creator_profiles
for each row execute function dabbir_private.set_updated_at();
drop trigger if exists dabbir_payment_accounts_set_updated_at on public.dabbir_payment_accounts;
create trigger dabbir_payment_accounts_set_updated_at before update on public.dabbir_payment_accounts
for each row execute function dabbir_private.set_updated_at();
drop trigger if exists dabbir_offers_set_updated_at on public.dabbir_offers;
create trigger dabbir_offers_set_updated_at before update on public.dabbir_offers
for each row execute function dabbir_private.set_updated_at();
drop trigger if exists dabbir_payments_set_updated_at on public.dabbir_payments;
create trigger dabbir_payments_set_updated_at before update on public.dabbir_payments
for each row execute function dabbir_private.set_updated_at();

-- RLS: no anonymous access. Authenticated users get only read access to rows they are entitled to see.
alter table public.dabbir_creator_profiles enable row level security;
alter table public.dabbir_creator_profiles force row level security;
alter table public.dabbir_payment_accounts enable row level security;
alter table public.dabbir_payment_accounts force row level security;
alter table public.dabbir_offers enable row level security;
alter table public.dabbir_offers force row level security;
alter table public.dabbir_payments enable row level security;
alter table public.dabbir_payments force row level security;
alter table public.dabbir_payment_events enable row level security;
alter table public.dabbir_payment_events force row level security;

revoke all on public.dabbir_creator_profiles from anon, authenticated;
revoke all on public.dabbir_payment_accounts from anon, authenticated;
revoke all on public.dabbir_offers from anon, authenticated;
revoke all on public.dabbir_payments from anon, authenticated;
revoke all on public.dabbir_payment_events from anon, authenticated;

grant select on public.dabbir_creator_profiles to authenticated;
grant select on public.dabbir_payment_accounts to authenticated;
grant select on public.dabbir_offers to authenticated;
grant select on public.dabbir_payments to authenticated;
grant select,insert,update,delete on public.dabbir_creator_profiles, public.dabbir_payment_accounts, public.dabbir_offers, public.dabbir_payments, public.dabbir_payment_events to service_role;

drop policy if exists dabbir_creator_profiles_select on public.dabbir_creator_profiles;
create policy dabbir_creator_profiles_select
on public.dabbir_creator_profiles for select to authenticated
using (dabbir_private.has_permission(business_id,'view_business'));

drop policy if exists dabbir_payment_accounts_select on public.dabbir_payment_accounts;
create policy dabbir_payment_accounts_select
on public.dabbir_payment_accounts for select to authenticated
using (dabbir_private.has_permission(business_id,'manage_billing'));

drop policy if exists dabbir_offers_select on public.dabbir_offers;
create policy dabbir_offers_select
on public.dabbir_offers for select to authenticated
using (
  dabbir_private.has_permission(creator_business_id,'view_business')
  or (advertiser_business_id is not null and dabbir_private.has_permission(advertiser_business_id,'view_business'))
  or payer_user_id = (select auth.uid())
  or created_by_user_id = (select auth.uid())
);

drop policy if exists dabbir_payments_select on public.dabbir_payments;
create policy dabbir_payments_select
on public.dabbir_payments for select to authenticated
using (
  dabbir_private.has_permission(recipient_business_id,'manage_billing')
  or (payer_business_id is not null and dabbir_private.has_permission(payer_business_id,'manage_billing'))
  or payer_user_id = (select auth.uid())
);

-- payment_events intentionally has no authenticated policy; webhook processing stays server-side/service_role only.
