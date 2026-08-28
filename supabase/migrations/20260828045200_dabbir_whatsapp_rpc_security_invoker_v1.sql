-- DABBIR WhatsApp RPC privilege hardening.
-- Live WhatsApp mutation/evidence RPCs are server-only and called with the
-- Supabase service role from DABBIR server functions. They do not need to run
-- with the function owner's privileges. Keep them in the exposed RPC schema for
-- PostgREST service access, but make execution SECURITY INVOKER and service-role
-- only. This removes an unnecessary SECURITY DEFINER privilege boundary.

alter function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) security invoker;
alter function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text) security invoker;
alter function public.dabbir_whatsapp_finalize_outbound(uuid,uuid,text,text,uuid,timestamptz) security invoker;
alter function public.dabbir_whatsapp_mark_outbound_ambiguous(uuid,uuid,text) security invoker;
alter function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) security invoker;
alter function public.dabbir_whatsapp_operational_evidence(uuid) security invoker;

revoke all on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_finalize_outbound(uuid,uuid,text,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_mark_outbound_ambiguous(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_operational_evidence(uuid) from public,anon,authenticated;

grant execute on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.dabbir_whatsapp_finalize_outbound(uuid,uuid,text,text,uuid,timestamptz) to service_role;
grant execute on function public.dabbir_whatsapp_mark_outbound_ambiguous(uuid,uuid,text) to service_role;
grant execute on function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) to service_role;
grant execute on function public.dabbir_whatsapp_operational_evidence(uuid) to service_role;
