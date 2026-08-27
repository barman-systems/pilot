-- BAR-16 explicit client deny for internal source-control run ledger.
-- The table is service-only already; this policy makes the fail-closed intent explicit
-- and removes ambiguity from the Supabase RLS advisor without granting client access.

alter table barman_control.dabbir_source_control_runs enable row level security;
alter table barman_control.dabbir_source_control_runs force row level security;
revoke all on barman_control.dabbir_source_control_runs from anon, authenticated;

drop policy if exists dabbir_source_control_runs_client_deny on barman_control.dabbir_source_control_runs;
create policy dabbir_source_control_runs_client_deny
on barman_control.dabbir_source_control_runs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

comment on policy dabbir_source_control_runs_client_deny on barman_control.dabbir_source_control_runs is
'BAR-16: explicit deny-all for client roles. Internal service-role operations remain server-side.';
