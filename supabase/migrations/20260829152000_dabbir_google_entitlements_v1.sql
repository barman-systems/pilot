-- Google Play subscription entitlement ledger for DABBIR Android.
-- Purchase tokens are server-only and are never granted to anon/authenticated roles.

create table if not exists public.dabbir_google_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  package_name text not null check (length(package_name) between 3 and 255),
  product_id text not null check (length(product_id) between 3 and 255),
  purchase_token text not null unique check (length(purchase_token) between 16 and 8192),
  order_id text check (order_id is null or length(order_id) <= 128),
  subscription_state text not null check (length(subscription_state) between 1 and 80),
  status text not null check (status in ('active','grace','canceled','pending','paused','on_hold','expired')),
  acknowledgement_state text not null check (length(acknowledgement_state) between 1 and 80),
  auto_renew_enabled boolean not null default false,
  start_at timestamptz,
  expires_at timestamptz not null,
  region_code text check (region_code is null or length(region_code) <= 8),
  environment text not null check (environment in ('Test','Production')),
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dabbir_google_entitlements enable row level security;
alter table public.dabbir_google_entitlements force row level security;
revoke all on public.dabbir_google_entitlements from anon, authenticated;

create or replace function dabbir_private.google_entitlement_touch()
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
revoke all on function dabbir_private.google_entitlement_touch() from public, anon, authenticated;

drop trigger if exists dabbir_google_entitlements_touch on public.dabbir_google_entitlements;
create trigger dabbir_google_entitlements_touch
before update on public.dabbir_google_entitlements
for each row execute function dabbir_private.google_entitlement_touch();

comment on table public.dabbir_google_entitlements is
  'Server-only Google Play subscription verification state for DABBIR Android. Purchase tokens are intentionally inaccessible to app/client roles.';
