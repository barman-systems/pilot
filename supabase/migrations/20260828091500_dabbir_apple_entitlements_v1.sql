-- Apple IAP entitlement ledger for DABBIR iOS.
-- The App Store transaction is verified server-side before service_role writes here.

create table if not exists public.dabbir_apple_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_account_token uuid not null,
  bundle_id text not null check (length(bundle_id) between 3 and 255),
  product_id text not null check (length(product_id) between 3 and 255),
  original_transaction_id text not null check (length(original_transaction_id) between 1 and 128),
  latest_transaction_id text not null unique check (length(latest_transaction_id) between 1 and 128),
  environment text not null check (environment in ('Sandbox','Production')),
  status text not null check (status in ('active','expired','revoked')),
  purchased_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  signed_at timestamptz,
  storefront text check (storefront is null or length(storefront) <= 16),
  ownership_type text check (ownership_type is null or length(ownership_type) <= 64),
  transaction_reason text check (transaction_reason is null or length(transaction_reason) <= 64),
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_apple_entitlements_identity_match check (app_account_token = user_id),
  constraint dabbir_apple_entitlements_expiry_order check (purchased_at is null or expires_at >= purchased_at)
);

alter table public.dabbir_apple_entitlements enable row level security;
alter table public.dabbir_apple_entitlements force row level security;
revoke all on public.dabbir_apple_entitlements from anon, authenticated;
grant select on public.dabbir_apple_entitlements to authenticated;

drop policy if exists dabbir_apple_entitlements_select_self on public.dabbir_apple_entitlements;
create policy dabbir_apple_entitlements_select_self
on public.dabbir_apple_entitlements
for select
to authenticated
using (
  user_id = (select auth.uid())
  and dabbir_private.account_active()
);

create or replace function dabbir_private.apple_entitlement_touch()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
revoke all on function dabbir_private.apple_entitlement_touch() from public, anon, authenticated;

drop trigger if exists dabbir_apple_entitlements_touch on public.dabbir_apple_entitlements;
create trigger dabbir_apple_entitlements_touch
before update on public.dabbir_apple_entitlements
for each row execute function dabbir_private.apple_entitlement_touch();

comment on table public.dabbir_apple_entitlements is
  'Server-verified StoreKit entitlement state for DABBIR iOS. Client roles can only read their own row; writes require trusted backend service role after Apple JWS verification.';
