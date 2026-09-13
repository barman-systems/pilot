-- P1 #750: restore the existing authenticated privacy RPC chain without changing
-- the public wrapper's SECURITY INVOKER contract or weakening tenant checks.
-- The private executor already enforces auth.uid(), active owner membership,
-- request scope/status, legal hold, explicit delete confirmation, and verified deletion.

do $$
declare
  v_oid oid:=to_regprocedure('dabbir_private.dabbir_execute_customer_privacy_request(uuid,text)');
begin
  if v_oid is null then raise exception 'DABBIR_PRIVACY_EXECUTOR_NOT_FOUND'; end if;
  if not (select p.prosecdef from pg_proc p where p.oid=v_oid) then
    raise exception 'DABBIR_PRIVACY_EXECUTOR_AUTHORITY_DRIFT';
  end if;
  if not has_schema_privilege('authenticated','dabbir_private','USAGE') then
    raise exception 'DABBIR_PRIVACY_EXECUTOR_SCHEMA_USAGE_MISSING';
  end if;
end $$;

revoke execute on function dabbir_private.dabbir_execute_customer_privacy_request(uuid,text) from public,anon,service_role;
grant execute on function dabbir_private.dabbir_execute_customer_privacy_request(uuid,text) to authenticated;
