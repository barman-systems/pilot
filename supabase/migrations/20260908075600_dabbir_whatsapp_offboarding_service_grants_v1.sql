-- The signed account_update RPC is SECURITY INVOKER and service-role-only.
-- Grant only the private-schema capability it actually needs to persist the
-- privacy-minimized receipt; no authenticated client gets access.
grant usage on schema dabbir_private to service_role;
grant insert on table dabbir_private.whatsapp_offboarding_receipts to service_role;

revoke all on table dabbir_private.whatsapp_offboarding_receipts from public, anon, authenticated;
