create or replace function public.dabbir_whatsapp_branch_operational_evidence(p_business_id uuid,p_branch_id uuid)
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
      where c.business_id=p_business_id and c.branch_id=p_branch_id
        and c.channel_type='whatsapp' and c.demo_mode=false
    ),
    exists(
      select 1
      from public.dabbir_whatsapp_event_ledger e
      join public.dabbir_conversations c on c.id=e.conversation_id and c.business_id=e.business_id
      where e.business_id=p_business_id and c.branch_id=p_branch_id
        and e.direction='inbound' and e.event_type='message' and e.message_id is not null
    ),
    exists(
      select 1
      from public.dabbir_whatsapp_outbound_reservations r
      join public.dabbir_conversations c on c.id=r.conversation_id and c.business_id=r.business_id
      where r.business_id=p_business_id and c.branch_id=p_branch_id
        and r.message_id is not null and r.provider_message_id is not null
        and r.state in ('PROVIDER_ACCEPTED','SENT','DELIVERED','READ')
    ),
    exists(
      select 1
      from public.dabbir_whatsapp_outbound_reservations r
      join public.dabbir_conversations c on c.id=r.conversation_id and c.business_id=r.business_id
      where r.business_id=p_business_id and c.branch_id=p_branch_id
        and r.provider_verified=true and r.state in ('DELIVERED','READ')
    );
$$;

revoke all on function public.dabbir_whatsapp_branch_operational_evidence(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_branch_operational_evidence(uuid,uuid) to service_role;
