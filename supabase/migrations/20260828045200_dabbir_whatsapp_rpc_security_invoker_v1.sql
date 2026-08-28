-- DABBIR WhatsApp RPC privilege hardening aligned to BAR-13 v2.
-- Server-side mutation RPCs are invoked only with the Supabase service role and
-- therefore do not need function-owner privilege. The authenticated evidence
-- RPC remains SECURITY DEFINER because it performs its own fail-closed
-- has_permission(view_integrations) check and must read the service-only ledger.

alter function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) security invoker;
alter function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) security invoker;
alter function public.dabbir_whatsapp_finalize_outbound(uuid,text) security invoker;
alter function public.dabbir_whatsapp_mark_outbound_result(uuid,text,text) security invoker;
alter function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) security invoker;

revoke all on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_finalize_outbound(uuid,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_mark_outbound_result(uuid,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) from public,anon,authenticated;

grant execute on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.dabbir_whatsapp_finalize_outbound(uuid,text) to service_role;
grant execute on function public.dabbir_whatsapp_mark_outbound_result(uuid,text,text) to service_role;
grant execute on function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) to service_role;

-- Evidence is intentionally callable only by authenticated DABBIR users and
-- is tenant-authorized inside the function with has_permission().
revoke all on function public.dabbir_whatsapp_operational_evidence(uuid) from public,anon;
grant execute on function public.dabbir_whatsapp_operational_evidence(uuid) to authenticated;
