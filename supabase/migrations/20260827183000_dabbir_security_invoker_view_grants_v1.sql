-- DABBIR security-invoker view grant hardening v1
-- These views are read models only. Their underlying tables enforce tenant/RBAC
-- access through RLS because each view is security_invoker=true.

revoke all on table public.dabbir_business_outcomes from public, anon, authenticated;
grant select on table public.dabbir_business_outcomes to authenticated;

revoke all on table public.dabbir_patient_data_gate from public, anon, authenticated;
grant select on table public.dabbir_patient_data_gate to authenticated;
