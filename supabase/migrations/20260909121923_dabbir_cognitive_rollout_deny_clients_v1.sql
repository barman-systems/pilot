-- Explicit deny documents the private control plane's default-deny policy.
-- postgres-owned batch loader reads it; client roles have neither ACL nor rows.
create policy cognitive_rollouts_deny_clients on dabbir_private.cognitive_rollouts
 as restrictive for all to public using (false) with check (false);
