-- dabbir_whatsapp_reserve_outbound is callable only by service_role, but as SECURITY INVOKER
-- it inherited service_role table privileges and failed while checking auth.users.
-- Run as the function owner (postgres), with an empty search_path, while keeping EXECUTE
-- restricted to service_role. The function body already schema-qualifies database objects.
alter function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) security definer;
alter function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) set search_path = '';

revoke all on function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) to service_role;
