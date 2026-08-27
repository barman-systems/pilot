-- Defense in depth for internal Customer 360 support data.
-- Even if table grants are accidentally widened later, anon/authenticated remain denied by RLS.

create policy platform_customer_support_cases_client_deny
on dabbir_private.platform_customer_support_cases
for all
to anon, authenticated
using (false)
with check (false);

create policy platform_customer_support_notes_client_deny
on dabbir_private.platform_customer_support_notes
for all
to anon, authenticated
using (false)
with check (false);
