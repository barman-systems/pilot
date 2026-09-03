-- Public tracking remains available only through the bounded Vercel capability endpoint.
-- The raw privileged RPC must never be callable directly by browser roles.
revoke all on function public.dabbir_public_order_status(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_public_order_status(uuid) to service_role;
