-- Finalized API acceptance is a durable reply receipt, distinct from delivery.
-- The provider state label alone never proves it.
create function dabbir_private.understanding_outbound_receipt_verified_v1(p_reservation_id uuid)
returns boolean language sql stable set search_path=pg_catalog,public as $function$
 select exists(select 1 from public.dabbir_whatsapp_outbound_reservations r where r.id=p_reservation_id
  and length(r.provider_message_id)>0 and (
   r.state='SENT' or (r.state in ('DELIVERED','READ') and r.provider_verified=true)
   or (r.state='PROVIDER_ACCEPTED' and r.message_id is not null and r.finalized_at is not null
    and exists(select 1 from public.dabbir_whatsapp_event_ledger e
     where e.business_id=r.business_id and e.conversation_id=r.conversation_id
      and e.connection_id is not distinct from r.connection_id
      and e.message_id=r.message_id and e.provider_message_id=r.provider_message_id
      and e.event_key='outbound:'||r.provider_message_id and e.direction='outbound' and e.event_type='message'
      and e.evidence->>'source'='meta_messages_api' and e.evidence->>'provider_accepted'='true'
      and e.evidence->>'reservation_id'=r.id::text)
    and exists(select 1 from public.dabbir_messages m where m.id=r.message_id and m.business_id=r.business_id and m.conversation_id=r.conversation_id and m.simulated=false))
  ));
$function$;
revoke all on function dabbir_private.understanding_outbound_receipt_verified_v1(uuid) from public,anon,authenticated;

do $migration$
declare definition text; target regprocedure;
 anchor text := $old$(r.state='SENT' or (r.state in ('DELIVERED','READ') and r.provider_verified=true))$old$;
 question_anchor text := $old$coalesce(cognition->'pending_question','{}'::jsonb)$old$;
begin
 foreach target in array array['public.dabbir_cognitive_record_delivery_v1(uuid,uuid,bigint,text,text)'::regprocedure,'public.dabbir_semantic_load_v2(uuid,uuid)'::regprocedure] loop
  select pg_get_functiondef(target) into definition;
  if position(anchor in definition)=0 then raise exception 'FINALIZED_ACCEPTANCE_CONTRACT_DRIFT: %',target; end if;
  definition:=replace(definition,anchor,'dabbir_private.understanding_outbound_receipt_verified_v1(r.id)');
  if target='public.dabbir_cognitive_record_delivery_v1(uuid,uuid,bigint,text,text)'::regprocedure then
   if position(question_anchor in definition)=0 then raise exception 'COGNITIVE_QUESTION_OBJECT_CONTRACT_DRIFT'; end if;
   definition:=replace(definition,question_anchor,$new$(case when jsonb_typeof(cognition->'pending_question')='object' then cognition->'pending_question' else '{}'::jsonb end)$new$);
  end if;
  execute definition;
 end loop;
end $migration$;
