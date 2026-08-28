-- DABBIR WhatsApp RPC privilege hardening aligned to BAR-13 v2.
-- Every live WhatsApp RPC is server-only and invoked with the Supabase service
-- role from DABBIR server functions. No live ledger/reservation function needs
-- function-owner privilege or direct authenticated-client EXECUTE.

alter function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) security invoker;
alter function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) security invoker;
alter function public.dabbir_whatsapp_finalize_outbound(uuid,text) security invoker;
alter function public.dabbir_whatsapp_mark_outbound_result(uuid,text,text) security invoker;
alter function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) security invoker;

-- Evidence moved behind the authenticated DABBIR server endpoint. Because this
-- RPC is service-role only, authorization is enforced before this call by
-- ownerContext()/tenant resolution and the function itself needs no auth.uid()
-- based SECURITY DEFINER bypass.
create or replace function public.dabbir_whatsapp_operational_evidence(p_business_id uuid)
returns table(
  available boolean,
  real_whatsapp_conversation boolean,
  real_inbound_message boolean,
  real_outbound_reply boolean,
  verified_external_result boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select true,
    exists(
      select 1 from public.dabbir_conversations c
      where c.business_id=p_business_id and c.channel_type='whatsapp' and c.demo_mode=false
    ),
    exists(
      select 1 from public.dabbir_whatsapp_event_ledger e
      where e.business_id=p_business_id and e.direction='inbound'
        and e.event_type='message' and e.message_id is not null
    ),
    exists(
      select 1 from public.dabbir_whatsapp_outbound_reservations r
      where r.business_id=p_business_id and r.message_id is not null
        and r.provider_message_id is not null
        and r.state in ('PROVIDER_ACCEPTED','SENT','DELIVERED','READ')
    ),
    exists(
      select 1 from public.dabbir_whatsapp_outbound_reservations r
      where r.business_id=p_business_id and r.provider_verified=true
        and r.state in ('DELIVERED','READ')
    );
$$;

revoke all on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_finalize_outbound(uuid,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_mark_outbound_result(uuid,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_operational_evidence(uuid) from public,anon,authenticated;

grant execute on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.dabbir_whatsapp_reserve_outbound(uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.dabbir_whatsapp_finalize_outbound(uuid,text) to service_role;
grant execute on function public.dabbir_whatsapp_mark_outbound_result(uuid,text,text) to service_role;
grant execute on function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) to service_role;
grant execute on function public.dabbir_whatsapp_operational_evidence(uuid) to service_role;
