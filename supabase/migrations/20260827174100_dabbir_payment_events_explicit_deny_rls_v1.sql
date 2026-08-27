-- DABBIR payment webhook event ledger is internal-only.
-- Keep Data API client roles explicitly denied while service_role retains its existing grant.

alter table public.dabbir_payment_events enable row level security;
alter table public.dabbir_payment_events force row level security;

revoke all on public.dabbir_payment_events from anon, authenticated;

drop policy if exists dabbir_payment_events_explicit_deny_all on public.dabbir_payment_events;
create policy dabbir_payment_events_explicit_deny_all
on public.dabbir_payment_events
for all
to anon, authenticated
using (false)
with check (false);
