-- Restore the least-privilege EXECUTE grant required by authenticated DML
-- trigger WHEN clauses such as:
--   when (not dabbir_private.recovery_is_active())
--
-- Anonymous clients do not need this private helper. Service-role access is
-- retained for trusted server-side recovery tooling.
revoke execute on function dabbir_private.recovery_is_active() from public, anon;
grant execute on function dabbir_private.recovery_is_active() to authenticated, service_role;

do $$
begin
  if not has_function_privilege('authenticated','dabbir_private.recovery_is_active()','EXECUTE') then
    raise exception 'RECOVERY_IS_ACTIVE_AUTHENTICATED_EXECUTE_MISSING';
  end if;
  if has_function_privilege('anon','dabbir_private.recovery_is_active()','EXECUTE') then
    raise exception 'RECOVERY_IS_ACTIVE_ANON_EXECUTE_MUST_BE_REVOKED';
  end if;
  if not has_function_privilege('service_role','dabbir_private.recovery_is_active()','EXECUTE') then
    raise exception 'RECOVERY_IS_ACTIVE_SERVICE_ROLE_EXECUTE_MISSING';
  end if;
end
$$;
