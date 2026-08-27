-- DABBIR evolution service-only policies v1
-- These barman_control tables are operated only by service_role. Client roles have
-- no schema USAGE and no table grants. Add explicit deny policies so the RLS
-- contract is documented and future grant drift cannot accidentally expose rows.

alter table barman_control.dabbir_evolution_objectives enable row level security;
alter table barman_control.dabbir_evolution_objectives force row level security;
drop policy if exists dabbir_evolution_objectives_client_deny on barman_control.dabbir_evolution_objectives;
create policy dabbir_evolution_objectives_client_deny
on barman_control.dabbir_evolution_objectives
for all to anon, authenticated
using (false)
with check (false);

alter table barman_control.dabbir_evolution_state enable row level security;
alter table barman_control.dabbir_evolution_state force row level security;
drop policy if exists dabbir_evolution_state_client_deny on barman_control.dabbir_evolution_state;
create policy dabbir_evolution_state_client_deny
on barman_control.dabbir_evolution_state
for all to anon, authenticated
using (false)
with check (false);
