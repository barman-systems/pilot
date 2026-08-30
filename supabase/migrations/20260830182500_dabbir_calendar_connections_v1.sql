begin;

create table if not exists public.dabbir_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  provider text not null check (provider in ('google','outlook')),
  provider_account_id text not null,
  provider_email text,
  provider_display_name text,
  calendar_id text not null default 'primary',
  sync_direction text not null default 'two_way' check (sync_direction in ('two_way','dabbir_to_provider','provider_to_dabbir')),
  sync_enabled boolean not null default true,
  status text not null default 'active' check (status in ('active','error','disconnected')),
  last_sync_at timestamptz,
  last_error text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider, provider_account_id)
);

create table if not exists public.dabbir_calendar_credentials (
  connection_id uuid primary key references public.dabbir_calendar_connections(id) on delete cascade,
  token_ciphertext text not null,
  token_iv text not null,
  token_tag text not null,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists dabbir_calendar_connections_business_idx
  on public.dabbir_calendar_connections (business_id, provider, status);

alter table public.dabbir_calendar_connections enable row level security;
alter table public.dabbir_calendar_credentials enable row level security;

create policy "calendar connections visible to active members"
on public.dabbir_calendar_connections
for select
to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_calendar_connections.business_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

-- Credentials intentionally have no authenticated policies. They are readable/writable
-- only by trusted server code using the Supabase service-role key.

commit;
