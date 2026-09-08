-- DABBIR WhatsApp AI provider continuity v3.
-- Retry one failed processing attempt; after the second provider/planner failure,
-- move ownership to a human without pretending the customer requested it.

create or replace function public.dabbir_whatsapp_ai_provider_failover(
  p_dispatch_token uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_error text:=left(trim(coalesce(p_error,'')),240);
  v_effective_error text;
  v_handoff jsonb;
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

  if v_batch.state='HUMAN_REQUIRED' then
    return jsonb_build_object('ok',true,'handled',false,'state','HUMAN_REQUIRED');
  end if;
  if v_batch.state<>'RETRY' then
    return jsonb_build_object('ok',true,'handled',false,'state',v_batch.state);
  end if;

  select c.* into v_conversation
  from public.dabbir_conversations c
  where c.business_id=v_batch.business_id and c.id=v_batch.conversation_id
    and c.channel_type='whatsapp' and c.demo_mode=false
  for update;
  if not found then return jsonb_build_object('ok',true,'handled',false,'state','CONVERSATION_NOT_FOUND'); end if;

  if v_conversation.state in ('human_active','action_required','closed')
     or exists (
       select 1 from public.dabbir_handoffs h
       where h.business_id=v_batch.business_id and h.conversation_id=v_batch.conversation_id
         and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
     ) then
    return jsonb_build_object('ok',true,'handled',false,'state','HUMAN_REQUIRED');
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

  -- attempt_count is incremented atomically when the worker claims a processing attempt.
  -- First failed attempt remains RETRY so recovery can make exactly one more AI attempt.
  if v_batch.attempt_count < 2 then
    return jsonb_build_object(
      'ok',true,'handled',false,'state','RETRY','retry_pending',true,
      'attempt_count',v_batch.attempt_count,'failure_code',v_effective_error
    );
  end if;

  -- Second failed processing attempt transfers ownership to a human. This is a system
  -- escalation, therefore customer_requested_human must remain false.
  v_handoff:=public.dabbir_whatsapp_ai_provider_degraded_handoff(
    p_dispatch_token,
    'AI_PROVIDER_FAILED_TWICE'
  );

  return jsonb_build_object(
    'ok',true,'handled',true,'state','HUMAN_REQUIRED',
    'batch_id',v_batch.id,'business_id',v_batch.business_id,'conversation_id',v_batch.conversation_id,
    'handoff_id',v_handoff->>'handoff_id','attempt_count',v_batch.attempt_count,
    'customer_requested_human',false,'reason_code','AI_PROVIDER_FAILED_TWICE'
  );
end;
$function$;

create or replace function public.dabbir_whatsapp_ai_provider_failover_candidates(
  p_limit integer default 12
)
returns table(dispatch_token uuid)
language sql
security definer
set search_path to ''
as $function$
  select b.dispatch_token
  from public.dabbir_message_batches b
  join public.dabbir_conversations c
    on c.business_id=b.business_id and c.id=b.conversation_id
  where coalesce(auth.role(),'')='service_role'
    and b.channel_type='whatsapp'
    and b.dispatch_token is not null
    and b.state='RETRY'
    and b.attempt_count>=2
    and c.channel_type='whatsapp'
    and c.demo_mode=false
    and c.state not in ('human_active','action_required','closed')
    and coalesce(b.last_error,'') ~* '^(gateway_|gemini_|groq_|cloudflare_|ai_planner_unavailable|ai_planner_contract_invalid|empty_ai_response)'
    and not exists (
      select 1 from public.dabbir_handoffs h
      where h.business_id=b.business_id and h.conversation_id=b.conversation_id
        and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
    )
    and not exists (
      select 1 from public.dabbir_messages m
      where m.business_id=b.business_id and m.conversation_id=b.conversation_id
        and m.sender_type='customer' and m.created_at>b.last_message_at
    )
  order by b.updated_at asc
  limit greatest(1,least(coalesce(p_limit,12),25));
$function$;

revoke all on function public.dabbir_whatsapp_ai_provider_failover(uuid,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_ai_provider_failover_candidates(integer) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_provider_failover(uuid,text) to service_role;
grant execute on function public.dabbir_whatsapp_ai_provider_failover_candidates(integer) to service_role;

comment on function public.dabbir_whatsapp_ai_provider_failover(uuid,text) is
'Retries one provider-degraded AI processing attempt, then creates a system human handoff after the second failed attempt without marking it customer-requested.';
comment on function public.dabbir_whatsapp_ai_provider_failover_candidates(integer) is
'Returns only second-or-later retryable provider failures that still belong to AI and have no newer customer message.';
