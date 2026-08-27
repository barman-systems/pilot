-- DABBIR Stripe event ledger explicit deny v2.
-- Client roles have no table privileges already; this policy makes the fail-closed
-- intent explicit to security tooling while service_role remains the only writer.

drop policy if exists dabbir_stripe_events_explicit_deny on public.dabbir_stripe_events;
create policy dabbir_stripe_events_explicit_deny
on public.dabbir_stripe_events
for all
to anon, authenticated
using (false)
with check (false);
