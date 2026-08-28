-- DABBIR least-privilege hardening.
-- recovery_is_active() is required by authenticated DML trigger WHEN clauses,
-- but anonymous clients have no DABBIR table DML grants and do not need direct
-- EXECUTE on this private SECURITY DEFINER helper.
revoke execute on function dabbir_private.recovery_is_active() from anon;

do $$
begin
  if has_function_privilege('anon', 'dabbir_private.recovery_is_active()', 'EXECUTE') then
    raise exception 'DABBIR_RECOVERY_ANON_EXECUTE_STILL_GRANTED';
  end if;
  if not has_function_privilege('authenticated', 'dabbir_private.recovery_is_active()', 'EXECUTE') then
    raise exception 'DABBIR_RECOVERY_AUTHENTICATED_EXECUTE_REQUIRED';
  end if;
end
$$;
