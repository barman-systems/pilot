-- A delivered read-only menu remains a valid referent after its batch is
-- superseded. Recover evidence during a NEW authorized load, never old authority.
do $migration$
declare definition text;
  pending_anchor text := $old$  if p_action='choose_slot' then$old$;
  load_anchor text := $old$return jsonb_build_object('cognitive_policy',$old$;
  field_anchor text := $old$'booking_confirmation','request')$old$;
begin
  select pg_get_functiondef('public.dabbir_semantic_set_pending_v2(uuid,uuid,bigint,text,jsonb)'::regprocedure) into definition;
  if position(pending_anchor in definition)=0 then raise exception 'SERVICE_PRESENTATION_PENDING_CONTRACT_DRIFT'; end if;
  execute replace(definition,pending_anchor,$new$  if p_action='choose_service' then
    p_payload:=p_payload||jsonb_build_object('presentation_batch_id',b.id,'presentation_version',p_version,
      'presentation_branch_id',(select branch_id from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id));
    if octet_length(p_payload::text)>8192 then raise exception 'SEMANTIC_PENDING_TOO_LARGE'; end if;
  end if;
  if p_action='choose_slot' then$new$);

  select pg_get_functiondef('public.dabbir_semantic_load_v2(uuid,uuid)'::regprocedure) into definition;
  if position(load_anchor in definition)=0 then raise exception 'SERVICE_PRESENTATION_LOAD_CONTRACT_DRIFT'; end if;
  execute replace(definition,load_anchor,$new$return jsonb_build_object('verified_service_presentation',(
    select jsonb_build_object('pending_action','choose_service','expires_at',s.expires_at,
      'payload',s.payload||jsonb_build_object('presented',true,'provider_message_id',r.provider_message_id))
    from public.dabbir_whatsapp_outbound_reservations r
    join public.dabbir_message_batches source_batch on source_batch.id::text=s.payload->>'presentation_batch_id'
      and source_batch.business_id=b.business_id and source_batch.conversation_id=b.conversation_id and source_batch.customer_id=b.customer_id
    where s.pending_action='choose_service' and s.payload->>'presented'='false' and s.expires_at>now()
      and s.payload->>'presentation_branch_id'=c.branch_id::text
      and jsonb_typeof(s.payload->'services')='array'
      and r.business_id=b.business_id and r.conversation_id=b.conversation_id
      and r.idempotency_key='wa-understanding:'||source_batch.id::text||':reply'
      and length(r.provider_message_id)>0
      and (r.state='SENT' or (r.state in ('DELIVERED','READ') and r.provider_verified=true))
    limit 1),'cognitive_policy',$new$);

  select pg_get_functiondef('public.dabbir_cognitive_record_delivery_v1(uuid,uuid,bigint,text,text)'::regprocedure) into definition;
  if position(field_anchor in definition)=0 then raise exception 'SERVICE_QUESTION_PRESENTATION_CONTRACT_DRIFT'; end if;
  execute replace(definition,field_anchor,$new$'booking_confirmation','request','service_question_target')$new$);
end $migration$;
