-- The salon booking migration tightens EXECUTE on the private RLS helper.
-- RLS policies on dabbir_appointments invoke this helper as authenticated users,
-- so authenticated must retain EXECUTE while anon/public remain blocked.
revoke execute on function dabbir_private.salon_member_scope(uuid,uuid,boolean) from public, anon;
grant execute on function dabbir_private.salon_member_scope(uuid,uuid,boolean) to authenticated, service_role;
