-- DABBIR least-privilege hardening for client-facing operational tables.
-- Keep application-required access only; remove inherited/default privileges that bypass intent.

alter table public.dabbir_tasks enable row level security;
alter table public.dabbir_tasks force row level security;
alter table public.dabbir_whatsapp_connections enable row level security;
alter table public.dabbir_whatsapp_connections force row level security;

revoke all on table public.dabbir_tasks from public, anon, authenticated;
grant select, update on table public.dabbir_tasks to authenticated;

revoke all on table public.dabbir_whatsapp_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.dabbir_whatsapp_connections to authenticated;

-- Task status mutation is authenticated-only and still executes as the caller,
-- so RLS + the function's manage_business guard both remain authoritative.
revoke execute on function public.dabbir_set_task_status(uuid, uuid, text) from public, anon;
grant execute on function public.dabbir_set_task_status(uuid, uuid, text) to authenticated;

-- Trigger functions do not need direct Data API execution grants.
revoke execute on function public.dabbir_validate_procedure_run_transition() from public, anon, authenticated;
