-- DABBIR security hardening v18.
-- These functions are internal trigger/seed helpers and must not be public Data API RPCs.
-- Existing triggers continue to execute through their SECURITY DEFINER owner context.

revoke execute on function public.dabbir_guard_appointment_business_type() from public, anon, authenticated;
revoke execute on function public.dabbir_seed_activity_tasks(uuid) from public, anon, authenticated;
revoke execute on function public.dabbir_seed_activity_tasks_trigger() from public, anon, authenticated;

grant execute on function public.dabbir_guard_appointment_business_type() to service_role;
grant execute on function public.dabbir_seed_activity_tasks(uuid) to service_role;
grant execute on function public.dabbir_seed_activity_tasks_trigger() to service_role;
