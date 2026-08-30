begin;

create table if not exists public.dabbir_calendar_event_links (
  connection_id uuid not null references public.dabbir_calendar_connections(id) on delete cascade,
  appointment_id uuid not null references public.dabbir_appointments(id) on delete cascade,
  provider_event_id text not null,
  provider_etag text,
  sync_hash text,
  last_provider_start timestamptz,
  last_synced_at timestamptz not null default now(),
  primary key (connection_id, appointment_id),
  unique (connection_id, provider_event_id)
);

create table if not exists public.dabbir_calendar_busy_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  connection_id uuid not null references public.dabbir_calendar_connections(id) on delete cascade,
  provider_event_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  summary text,
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_event_id),
  check (ends_at > starts_at)
);

create index if not exists dabbir_calendar_busy_blocks_business_time_idx
  on public.dabbir_calendar_busy_blocks (business_id, starts_at, ends_at);

alter table public.dabbir_calendar_event_links enable row level security;
alter table public.dabbir_calendar_busy_blocks enable row level security;

create policy "calendar busy blocks visible to appointment viewers"
on public.dabbir_calendar_busy_blocks
for select
to authenticated
using (dabbir_private.has_permission(business_id,'view_appointments'));

-- Event links are server-maintained internal mapping state and intentionally expose
-- no authenticated policy. Service-role code performs all writes.

commit;
