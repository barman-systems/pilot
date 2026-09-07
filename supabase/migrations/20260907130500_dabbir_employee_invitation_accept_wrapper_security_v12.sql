-- Keep the public acceptance RPC as a SECURITY INVOKER boundary while
-- restoring the bounded private implementation grant required by authenticated invitees.
alter function public.dabbir_accept_employee_invitation(text)
  security invoker;

revoke all on function dabbir_private.dabbir_accept_employee_invitation(text)
  from public, anon;
grant execute on function dabbir_private.dabbir_accept_employee_invitation(text)
  to authenticated, service_role;

revoke all on function public.dabbir_accept_employee_invitation(text)
  from public, anon;
grant execute on function public.dabbir_accept_employee_invitation(text)
  to authenticated, service_role;
