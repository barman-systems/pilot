-- DABBIR TikTok pilot v1
-- Adds TikTok as a first-class external channel and stores OAuth credentials encrypted.
-- Raw access/refresh tokens must never be stored in plaintext.

alter table public.dabbir_channels
  drop constraint if exists dabbir_channels_channel_type_check;

alter table public.dabbir_channels
  add constraint dabbir_channels_channel_type_check
  check (channel_type = any (array['whatsapp'::text, 'instagram'::text, 'web'::text, 'tiktok'::text]));

create table if not exists public.dabbir_tiktok_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.dabbir_businesses(id) on delete cascade,
  provider text not null default 'tiktok',
  status text not null default 'disconnected'
    check (status in ('disconnected','verifying','connected','degraded','failed')),
  open_id text,
  account_label text,
  granted_scopes text not null default '',
  access_token_ciphertext text,
  access_token_iv text,
  access_token_tag text,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  refresh_token_tag text,
  token_key_version text not null default 'tiktok_v1',
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  oauth_state_hash text,
  oauth_state_expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  last_verified_at timestamptz,
  last_provider_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_tiktok_provider_check check (provider = 'tiktok'),
  constraint dabbir_tiktok_open_id_bounded check (open_id is null or length(open_id) between 1 and 320),
  constraint dabbir_tiktok_state_hash_check check (oauth_state_hash is null or oauth_state_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists dabbir_tiktok_open_id_uq
  on public.dabbir_tiktok_connections(open_id)
  where open_id is not null;

create index if not exists dabbir_tiktok_status_idx
  on public.dabbir_tiktok_connections(status, updated_at desc);

alter table public.dabbir_tiktok_connections enable row level security;
alter table public.dabbir_tiktok_connections force row level security;

revoke all on public.dabbir_tiktok_connections from public, anon, authenticated;
grant select, insert, update, delete on public.dabbir_tiktok_connections to service_role;

comment on table public.dabbir_tiktok_connections is
  'Server-only TikTok Business OAuth connection state for DABBIR tenants. Tokens are AES-GCM ciphertext only.';
