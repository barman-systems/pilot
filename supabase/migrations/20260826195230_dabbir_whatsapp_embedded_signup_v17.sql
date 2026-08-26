-- DABBIR WhatsApp Embedded Signup v17
-- Stores one Meta WhatsApp connection per business. Access tokens are never stored in plaintext;
-- application code seals them with AES-GCM before the row is written.

create table if not exists public.dabbir_whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.dabbir_businesses(id) on delete cascade,
  provider text not null default 'meta' check (provider = 'meta'),
  status text not null default 'connected' check (status in ('connected','verification_required','disconnected','error')),
  meta_app_id text,
  waba_id text not null,
  phone_number_id text not null unique,
  display_phone_number text,
  verified_name text,
  access_token_ciphertext text not null,
  access_token_iv text not null,
  access_token_tag text not null,
  token_expires_at timestamptz,
  token_key_version text not null default 'whatsapp_v1',
  connected_by uuid not null,
  connected_at timestamptz not null default now(),
  last_verified_at timestamptz,
  last_provider_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dabbir_whatsapp_connections_business_idx
  on public.dabbir_whatsapp_connections(business_id);
create index if not exists dabbir_whatsapp_connections_phone_idx
  on public.dabbir_whatsapp_connections(phone_number_id);

alter table public.dabbir_whatsapp_connections enable row level security;

revoke all on table public.dabbir_whatsapp_connections from anon;
grant select, insert, update, delete on table public.dabbir_whatsapp_connections to authenticated;

drop policy if exists dabbir_whatsapp_connections_owner_select on public.dabbir_whatsapp_connections;
create policy dabbir_whatsapp_connections_owner_select
on public.dabbir_whatsapp_connections
for select
to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_whatsapp_connections.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin')
  )
);

drop policy if exists dabbir_whatsapp_connections_owner_insert on public.dabbir_whatsapp_connections;
create policy dabbir_whatsapp_connections_owner_insert
on public.dabbir_whatsapp_connections
for insert
to authenticated
with check (
  connected_by = (select auth.uid())
  and exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_whatsapp_connections.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin')
  )
);

drop policy if exists dabbir_whatsapp_connections_owner_update on public.dabbir_whatsapp_connections;
create policy dabbir_whatsapp_connections_owner_update
on public.dabbir_whatsapp_connections
for update
to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_whatsapp_connections.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin')
  )
)
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_whatsapp_connections.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin')
  )
);

drop policy if exists dabbir_whatsapp_connections_owner_delete on public.dabbir_whatsapp_connections;
create policy dabbir_whatsapp_connections_owner_delete
on public.dabbir_whatsapp_connections
for delete
to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_whatsapp_connections.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin')
  )
);

create or replace function public.dabbir_touch_whatsapp_connection_updated_at()
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

revoke all on function public.dabbir_touch_whatsapp_connection_updated_at() from public;
revoke all on function public.dabbir_touch_whatsapp_connection_updated_at() from anon;
revoke all on function public.dabbir_touch_whatsapp_connection_updated_at() from authenticated;

drop trigger if exists dabbir_whatsapp_connection_touch on public.dabbir_whatsapp_connections;
create trigger dabbir_whatsapp_connection_touch
before update on public.dabbir_whatsapp_connections
for each row execute function public.dabbir_touch_whatsapp_connection_updated_at();
