begin;

create table if not exists dabbir_private.owner_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

alter table dabbir_private.owner_sessions enable row level security;
alter table dabbir_private.owner_sessions force row level security;

revoke all on table dabbir_private.owner_sessions from public;
revoke all on table dabbir_private.owner_sessions from anon;
revoke all on table dabbir_private.owner_sessions from authenticated;
grant select, insert, update, delete on table dabbir_private.owner_sessions to service_role;

create index if not exists dabbir_owner_sessions_expiry_idx
  on dabbir_private.owner_sessions (expires_at)
  where revoked_at is null;

commit;
