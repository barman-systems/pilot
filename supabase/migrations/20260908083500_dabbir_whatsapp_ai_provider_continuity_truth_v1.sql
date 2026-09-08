-- DABBIR WhatsApp AI provider-continuity truth repair.
-- External AI degradation must not impersonate a customer human request.

create or replace function public.dabbir_whatsapp_ai_handoff(
  p_business_id uuid,
  p_conversation_id uuid,
  p_route_class text default 'SUPPORT',
  p_reason text default 'Customer requested human assistance',
  p_summary text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth'
as $function$
declare
  v_conversation public.dabbir_conversations%rowtype;
  v_handoff public.dabbir_handoffs%rowtype;
  v_route text:=upper(trim(coalesce(p_route_class,'SUPPORT')));
  v_reason text:=left(coalesce(p_reason,'Customer requested human assistance'),500);
  v_customer_requested boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_route not in ('SALES','SUPPORT','BOOKING','RETURNS','COMPLAINT','OWNER_DECISION') then v_route:='SUPPORT'; end if;
  v_customer_requested := upper(trim(v_reason))='CUSTOMER_REQUESTED_HUMAN'
    or lower(trim(v_reason))='customer requested human assistance';

  select * into v_conversation
  from public.dabbir_conversations c
  where c.business_id=p_business_id and c.id=p_conversation_id
    and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed'
  for update;
  if not found then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;

  select * into v_handoff
  from public.dabbir_handoffs h
  where h.business_id=p_business_id and h.conversation_id=p_conversation_id
    and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  order by h.created_at desc limit 1 for update;

  if not found then
    insert into public.dabbir_handoffs(
      business_id,conversation_id,customer_id,route_class,reason,state,priority,
      routing_strategy,summary,attempted_actions,unresolved_items,metadata
    ) values(
      p_business_id,p_conversation_id,v_conversation.customer_id,v_route,v_reason,
      'QUEUED',70,'least_open',left(coalesce(p_summary,''),1200),'[]'::jsonb,'[]'::jsonb,
      jsonb_build_object(
        'source','dabbir_whatsapp_ai',
        'customer_requested_human',v_customer_requested,
        'reason_code',case when v_customer_requested then 'CUSTOMER_REQUESTED_HUMAN' else upper(left(regexp_replace(v_reason,'[^A-Za-z0-9_]+','_','g'),120)) end
      )
    ) returning * into v_handoff;
  end if;

  update public.dabbir_conversations
     set state='action_required',updated_at=now()
   where business_id=p_business_id and id=p_conversation_id;
  perform public.dabbir_whatsapp_ai_set_state(
    p_business_id,p_conversation_id,'handoff',
    jsonb_build_object('handoff_id',v_handoff.id,'route_class',v_handoff.route_class),3600
  );
  return jsonb_build_object('ok',true,'verified',true,'handoff_id',v_handoff.id,'state',v_handoff.state,'route_class',v_handoff.route_class,'customer_requested_human',v_customer_requested);
end;
$function$;

revoke all on function public.dabbir_whatsapp_ai_handoff(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_handoff(uuid,uuid,text,text,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_provider_failover(p_dispatch_token uuid,p_error text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_customer_body text;
  v_error text:=left(trim(coalesce(p_error,'')),240);
  v_effective_error text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;

  select b.* into v_batch
  from public.dabbir_message_batches b
  where b.dispatch_token=p_dispatch_token and b.channel_type='whatsapp'
  for update;
  if not found then return jsonb_build_object('ok',true,'handled',false,'state','NOT_FOUND'); end if;

  v_effective_error:=left(coalesce(nullif(trim(v_batch.last_error),''),nullif(v_error,''),'AI_PROVIDER_CHAIN_UNAVAILABLE'),240);
  if v_effective_error !~* '^(gateway_|gemini_|groq_|cloudflare_|ai_planner_unavailable|ai_planner_contract_invalid|empty_ai_response)' then
    return jsonb_build_object('ok',true,'handled',false,'state','NOT_AI_FAILURE');
  end if;

  -- A human-owned or already terminal batch is never silently reclaimed by provider recovery.
  if v_batch.state='HUMAN_REQUIRED' then
    return jsonb_build_object('ok',true,'handled',false,'state','HUMAN_REQUIRED');
  end if;
  if v_batch.state<>'RETRY' then
    return jsonb_build_object('ok',true,'handled',false,'state',v_batch.state);
  end if;

  if exists (
    select 1 from public.dabbir_messages m
    where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id
      and m.sender_type='customer' and m.created_at>v_batch.last_message_at
  ) then
    update public.dabbir_message_batches
       set state='CANCELLED',processed_at=now(),next_attempt_at=null,lock_token=null,locked_until=null,
           last_error='SUPERSEDED_BY_NEW_CUSTOMER_MESSAGE',updated_at=now()
     where id=v_batch.id and state='RETRY';
    return jsonb_build_object('ok',true,'handled',false,'state','SUPERSEDED');
  end if;

  select m.body into v_customer_body
  from public.dabbir_messages m
  where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id and m.sender_type='customer'
  order by m.created_at desc limit 1;

  -- No handoff and no conversation action_required transition for a provider-only outage.
  return jsonb_build_object(
    'ok',true,'handled',true,'state','DEGRADED_PENDING','batch_id',v_batch.id,
    'business_id',v_batch.business_id,'conversation_id',v_batch.conversation_id,
    'customer_body',left(coalesce(v_customer_body,''),500),'failure_code',v_effective_error
  );
end;
$function$;

revoke all on function public.dabbir_whatsapp_ai_provider_failover(uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_provider_failover(uuid,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_provider_degraded_complete(
  p_dispatch_token uuid,
  p_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_reservation public.dabbir_whatsapp_outbound_reservations%rowtype;
  v_error text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if nullif(trim(coalesce(p_provider_message_id,'')),'') is null then raise exception 'PROVIDER_MESSAGE_ID_REQUIRED'; end if;

  select b.* into v_batch
  from public.dabbir_message_batches b
  where b.dispatch_token=p_dispatch_token and b.channel_type='whatsapp'
  for update;
  if not found then return jsonb_build_object('ok',true,'processed',false,'state','NOT_FOUND'); end if;
  if v_batch.state<>'RETRY' then return jsonb_build_object('ok',true,'processed',false,'state',v_batch.state); end if;
  if coalesce(v_batch.last_error,'') !~* '^(gateway_|gemini_|groq_|cloudflare_|ai_planner_unavailable|ai_planner_contract_invalid|empty_ai_response)' then
    return jsonb_build_object('ok',true,'processed',false,'state','NOT_AI_FAILURE');
  end if;

  select r.* into v_reservation
  from public.dabbir_whatsapp_outbound_reservations r
  where r.business_id=v_batch.business_id and r.conversation_id=v_batch.conversation_id
    and r.idempotency_key='wa-ai-provider-failover:'||v_batch.id::text
    and r.sender_type='ai' and r.provider_message_id=p_provider_message_id
    and r.state in ('PROVIDER_ACCEPTED','SENT','DELIVERED','READ')
  limit 1;
  if not found then raise exception 'PROVIDER_CONTINUITY_DELIVERY_UNVERIFIED'; end if;

  if exists (
    select 1 from public.dabbir_handoffs h
    where h.business_id=v_batch.business_id and h.conversation_id=v_batch.conversation_id
      and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  ) then
    return jsonb_build_object('ok',true,'processed',false,'state','HUMAN_REQUIRED');
  end if;

  v_error:=left(v_batch.last_error,240);
  if exists (
    select 1 from public.dabbir_messages m
    where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id
      and m.sender_type='customer' and m.created_at>v_batch.last_message_at
  ) then
    update public.dabbir_message_batches
       set state='CANCELLED',processed_at=now(),next_attempt_at=null,lock_token=null,locked_until=null,
           last_error='SUPERSEDED_AFTER_PROVIDER_CONTINUITY',updated_at=now()
     where id=v_batch.id;
    return jsonb_build_object('ok',true,'processed',true,'state','CANCELLED','superseded',true);
  end if;

  insert into public.dabbir_ai_operator_events(
    business_id,conversation_id,batch_id,source_kind,source_id,event_key,stage,event_type,status,
    action,risk_level,confidence,provider_reference,provider_verified,metadata,occurred_at
  ) values(
    v_batch.business_id,v_batch.conversation_id,v_batch.id,'batch',v_batch.id,
    'provider-degraded:'||v_batch.id::text,'OUTCOME','AI_PROVIDER_DEGRADED_CONTINUITY','PROCESSED',
    'REPLY','LOW',1,p_provider_message_id,v_reservation.state in ('DELIVERED','READ'),
    jsonb_build_object('failure_code',v_error,'delivery_state',v_reservation.state,'customer_handoff',false),now()
  ) on conflict (business_id,event_key) do nothing;

  update public.dabbir_message_batches
     set state='PROCESSED',processed_at=now(),next_attempt_at=null,lock_token=null,locked_until=null,last_error=null,updated_at=now()
   where id=v_batch.id and state='RETRY';

  return jsonb_build_object('ok',true,'processed',true,'state','PROCESSED','batch_id',v_batch.id);
end;
$function$;

revoke all on function public.dabbir_whatsapp_ai_provider_degraded_complete(uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_provider_degraded_complete(uuid,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_provider_degraded_handoff(
  p_dispatch_token uuid,
  p_reason text default 'PROVIDER_CONTINUITY_DELIVERY_FAILED'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_handoff jsonb;
  v_reason text:=upper(left(trim(coalesce(p_reason,'PROVIDER_CONTINUITY_DELIVERY_FAILED')),120));
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select b.* into v_batch
  from public.dabbir_message_batches b
  where b.dispatch_token=p_dispatch_token and b.channel_type='whatsapp'
  for update;
  if not found then return jsonb_build_object('ok',true,'state','NOT_FOUND'); end if;
  if v_batch.state not in ('RETRY','HUMAN_REQUIRED') then return jsonb_build_object('ok',true,'state',v_batch.state); end if;

  v_handoff:=public.dabbir_whatsapp_ai_handoff(
    v_batch.business_id,v_batch.conversation_id,'SUPPORT',v_reason,
    left(coalesce(v_batch.last_error,'provider continuity delivery could not be verified'),1200)
  );
  update public.dabbir_message_batches
     set state='HUMAN_REQUIRED',processed_at=coalesce(processed_at,now()),next_attempt_at=null,
         lock_token=null,locked_until=null,last_error=v_reason,updated_at=now()
   where id=v_batch.id;
  return jsonb_build_object('ok',true,'state','HUMAN_REQUIRED','handoff_id',v_handoff->>'handoff_id');
end;
$function$;

revoke all on function public.dabbir_whatsapp_ai_provider_degraded_handoff(uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_provider_degraded_handoff(uuid,text) to service_role;

comment on function public.dabbir_whatsapp_ai_provider_failover(uuid,text) is
'Prepares an idempotent customer continuity reply for AI provider degradation without creating a human handoff.';
comment on function public.dabbir_whatsapp_ai_provider_degraded_complete(uuid,text) is
'Closes a provider-degraded WhatsApp batch only after an accepted durable outbound reservation is verified.';
comment on function public.dabbir_whatsapp_ai_provider_degraded_handoff(uuid,text) is
'Escalates only when the degraded continuity delivery itself is unsafe or unverifiable.';
