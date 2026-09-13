-- Repair the remaining authenticated team wrapper contract as one unit.
-- Public wrappers stay SECURITY INVOKER; tenant, role and permission checks remain
-- inside the bounded private implementations.
alter function public.dabbir_list_team(uuid) security invoker;
alter function public.dabbir_update_employee_access(uuid,uuid,text,text[]) security invoker;
alter function public.dabbir_set_employee_status(uuid,uuid,text) security invoker;

revoke all on function dabbir_private.dabbir_list_team(uuid) from public, anon;
revoke all on function dabbir_private.dabbir_update_employee_access(uuid,uuid,text,text[]) from public, anon;
revoke all on function dabbir_private.dabbir_set_employee_status(uuid,uuid,text) from public, anon;

grant execute on function dabbir_private.dabbir_list_team(uuid) to authenticated, service_role;
grant execute on function dabbir_private.dabbir_update_employee_access(uuid,uuid,text,text[]) to authenticated, service_role;
grant execute on function dabbir_private.dabbir_set_employee_status(uuid,uuid,text) to authenticated, service_role;

revoke all on function public.dabbir_list_team(uuid) from public, anon;
revoke all on function public.dabbir_update_employee_access(uuid,uuid,text,text[]) from public, anon;
revoke all on function public.dabbir_set_employee_status(uuid,uuid,text) from public, anon;

grant execute on function public.dabbir_list_team(uuid) to authenticated, service_role;
grant execute on function public.dabbir_update_employee_access(uuid,uuid,text,text[]) to authenticated, service_role;
grant execute on function public.dabbir_set_employee_status(uuid,uuid,text) to authenticated, service_role;
