-- The public RPC is deliberately SECURITY INVOKER. Restore the authenticated
-- execution grant on the bounded private implementation that the wrapper calls.
-- The private function performs the tenant and permission checks itself.
alter function public.dabbir_create_employee_invitation(uuid,text,text,text,text[],text,timestamptz)
  security invoker;

revoke all on function dabbir_private.dabbir_create_employee_invitation(uuid,text,text,text,text[],text,timestamptz)
  from public, anon;
grant execute on function dabbir_private.dabbir_create_employee_invitation(uuid,text,text,text,text[],text,timestamptz)
  to authenticated, service_role;

revoke all on function public.dabbir_create_employee_invitation(uuid,text,text,text,text[],text,timestamptz)
  from public, anon;
grant execute on function public.dabbir_create_employee_invitation(uuid,text,text,text,text[],text,timestamptz)
  to authenticated, service_role;
