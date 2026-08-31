-- Narrow the intentionally public, token-based order status lookup to anon only.
revoke all on function public.dabbir_public_order_status(uuid) from public;
revoke execute on function public.dabbir_public_order_status(uuid) from authenticated, service_role;
grant execute on function public.dabbir_public_order_status(uuid) to anon;
