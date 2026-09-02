create table if not exists public.dabbir_ceo_commands (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null,
  command_text text not null check (char_length(btrim(command_text)) between 4 and 4000),
  priority text not null default 'P1' check (priority in ('P0','P1','P2','P3')),
  status text not null default 'QUEUED' check (status in ('QUEUED','ACCEPTED','IN_PROGRESS','BLOCKED','DONE','CANCELLED')),
  source text not null default 'owner_command_center' check (source = 'owner_command_center'),
  result_summary text,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array')
);

alter table public.dabbir_ceo_commands enable row level security;
revoke all on table public.dabbir_ceo_commands from anon, authenticated;
grant select, insert, update on table public.dabbir_ceo_commands to service_role;

create index if not exists dabbir_ceo_commands_created_at_idx on public.dabbir_ceo_commands (created_at desc);
create index if not exists dabbir_ceo_commands_status_priority_idx on public.dabbir_ceo_commands (status, priority, created_at desc);

comment on table public.dabbir_ceo_commands is 'Owner-issued durable command queue for BARMAN Executive OS. Access is broker-only via service_role after platform-owner session verification.';