-- Fail closed around the internal ROOT_OWNER assertion helper.
-- SECURITY DEFINER helpers must never inherit PostgreSQL's default PUBLIC EXECUTE.
-- Trusted server-side wrappers remain service_role-only and can continue to invoke it.
revoke execute on function dabbir_private.platform_assert_root(uuid) from public;
revoke execute on function dabbir_private.platform_assert_root(uuid) from anon;
revoke execute on function dabbir_private.platform_assert_root(uuid) from authenticated;
grant execute on function dabbir_private.platform_assert_root(uuid) to service_role;
