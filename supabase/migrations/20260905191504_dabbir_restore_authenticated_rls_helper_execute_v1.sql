-- Incident 2026-09-05: password login succeeds but session membership read
-- fails with SQLSTATE 42501 (permission denied for function account_active).
-- Restore only the six reviewed, caller-scoped boolean RLS helpers.
-- No table data, RLS policy, service-role RPC, or function body is changed.
-- Pre-change ACLs and exact rollback are captured in the incident evidence.
-- The migration runner owns the transaction; no explicit transaction control.
grant execute on function dabbir_private.account_active() to authenticated;
grant execute on function dabbir_private.branch_access_allowed(uuid,uuid) to authenticated;
grant execute on function dabbir_private.has_permission(uuid,text) to authenticated;
grant execute on function dabbir_private.is_active_member(uuid) to authenticated;
grant execute on function dabbir_private.salon_customer_scope(uuid,uuid,boolean) to authenticated;
grant execute on function dabbir_private.salon_member_scope(uuid,uuid,boolean) to authenticated;
do $verify$
declare signature text;
begin
  foreach signature in array array[
    'dabbir_private.account_active()',
    'dabbir_private.branch_access_allowed(uuid,uuid)',
    'dabbir_private.has_permission(uuid,text)',
    'dabbir_private.is_active_member(uuid)',
    'dabbir_private.salon_customer_scope(uuid,uuid,boolean)',
    'dabbir_private.salon_member_scope(uuid,uuid,boolean)'
  ] loop
    if not has_function_privilege('authenticated',signature,'EXECUTE') then
      raise exception 'RLS_HELPER_EXECUTE_MISSING: %', signature;
    end if;
    if has_function_privilege('anon',signature,'EXECUTE') then
      raise exception 'RLS_HELPER_ANONYMOUS_EXPOSURE: %', signature;
    end if;
  end loop;
  if has_function_privilege('authenticated','public.dabbir_owner_session_verify_v1(text)','EXECUTE') then
    raise exception 'OWNER_SESSION_RPC_MUST_REMAIN_SERVER_ONLY';
  end if;
end
$verify$;
