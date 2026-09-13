-- Preserve the first durable retry. Only two failed attempts authorize provider handoff.

create or replace function public.dabbir_whatsapp_ai_provider_failover(
  p_dispatch_token uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_handoff jsonb;
  v_customer_body text;
  v_error text := left(trim(coalesce(p_error,'')),240);
  v_effective_error text;
  v_already_terminal boolean := false;
  v_conversation public.dabbir_conversations%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  select b.*
    into v_batch
  from public.dabbir_message_batches b
  where b.dispatch_token = p_dispatch_token
    and b.channel_type = 'whatsapp'
  for update;

  if not found then
    return jsonb_build_object('ok',true,'handled',false,'state','NOT_FOUND');
  end if;

  v_effective_error := left(
    coalesce(nullif(trim(v_batch.last_error),''),nullif(v_error,''),'AI_PROVIDER_CHAIN_UNAVAILABLE'),
    240
  );

  if v_effective_error !~* '^(gateway_|gemini_|groq_|cloudflare_|ai_planner_unavailable|ai_planner_contract_invalid|ai_provider_failed_twice|semantic_provider_budget|empty_ai_response)' then
    return jsonb_build_object('ok',true,'handled',false,'state','NOT_AI_FAILURE');
  end if;

  if v_batch.state not in ('RETRY','HUMAN_REQUIRED') then
    return jsonb_build_object('ok',true,'handled',false,'state',v_batch.state);
  end if;

  v_already_terminal:=v_batch.state='HUMAN_REQUIRED';
  select * into v_conversation from public.dabbir_conversations c
    where c.business_id=v_batch.business_id and c.id=v_batch.conversation_id
      and c.customer_id=v_batch.customer_id and c.channel_type='whatsapp' and not c.demo_mode for update;
  if not found then
    return jsonb_build_object('ok',true,'handled',false,'state','SCOPE_INVALID');
  end if;
  if not v_already_terminal and (v_conversation.state in ('human_active','action_required','closed') or exists(
    select 1 from public.dabbir_handoffs h where h.business_id=v_batch.business_id
      and h.conversation_id=v_batch.conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  )) then
    return jsonb_build_object('ok',true,'handled',false,'state','HUMAN_OWNED');
  end if;

  select m.body
    into v_customer_body
  from public.dabbir_messages m
  where m.business_id=v_batch.business_id
    and m.conversation_id=v_batch.conversation_id
    and m.sender_type='customer'
  order by m.created_at desc
  limit 1;

  -- Never escalate or notify for an obsolete turn after a newer customer message.
  if exists (
    select 1
    from public.dabbir_messages m
    where m.business_id = v_batch.business_id
      and m.conversation_id = v_batch.conversation_id
      and m.sender_type = 'customer'
      and m.created_at > v_batch.last_message_at
  ) then
    if v_batch.state='RETRY' then
      update public.dabbir_message_batches
         set state='CANCELLED',
             processed_at=now(),
             next_attempt_at=null,
             lock_token=null,
             locked_until=null,
             last_error='SUPERSEDED_BY_NEW_CUSTOMER_MESSAGE',
             updated_at=now()
       where id=v_batch.id;
    end if;
    return jsonb_build_object('ok',true,'handled',false,'state','SUPERSEDED');
  end if;

  if coalesce(v_batch.attempt_count,0)<2 then
    return jsonb_build_object('ok',true,'handled',false,'state','RETRY','retry_pending',true);
  end if;

  if v_already_terminal then
    -- Repair acknowledgement only for this policy's verified queued handoff.
    -- Never interrupt a human who has already taken over or answered.
    select jsonb_build_object('verified',true,'handoff_id',h.id) into v_handoff
      from public.dabbir_handoffs h where h.business_id=v_batch.business_id
        and h.conversation_id=v_batch.conversation_id and h.reason='AI_PROVIDER_FAILED_TWICE'
        and h.state in ('QUEUED','ASSIGNED') and h.created_at>=v_batch.first_message_at
      order by h.created_at desc limit 1;
    if v_handoff is null or v_conversation.state in ('human_active','closed') or exists(
      select 1 from public.dabbir_messages m where m.business_id=v_batch.business_id
        and m.conversation_id=v_batch.conversation_id and m.sender_type='human'
        and m.created_at>=v_batch.first_message_at
    ) then return jsonb_build_object('ok',true,'handled',false,'state','HUMAN_REQUIRED'); end if;
  else
    v_handoff:=public.dabbir_whatsapp_ai_handoff(v_batch.business_id,v_batch.conversation_id,'SUPPORT','AI_PROVIDER_FAILED_TWICE',v_effective_error);
    if coalesce((v_handoff->>'verified')::boolean,false) is not true then raise exception 'PROVIDER_HANDOFF_UNVERIFIED'; end if;
    update public.dabbir_message_batches set state='HUMAN_REQUIRED',processed_at=coalesce(processed_at,now()),
      next_attempt_at=null,lock_token=null,locked_until=null,last_error='AI_PROVIDER_FAILED_TWICE',updated_at=now()
      where id=v_batch.id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'handled',true,
    'already_handled',v_already_terminal,
    'batch_id',v_batch.id,
    'business_id',v_batch.business_id,
    'conversation_id',v_batch.conversation_id,
    'customer_body',left(coalesce(v_customer_body,''),500),
    'handoff_id',v_handoff->>'handoff_id'
  );
end;
$$;

create or replace function public.dabbir_whatsapp_ai_provider_failover_candidates(
  p_limit integer default 12
)
returns table(dispatch_token uuid)
language sql
security definer
set search_path = ''
as $$
  select b.dispatch_token
  from public.dabbir_message_batches b
  where coalesce(auth.role(),'')='service_role'
    and b.channel_type='whatsapp'
    and b.dispatch_token is not null
    and (b.state='RETRY' or (b.state='HUMAN_REQUIRED' and b.last_error='AI_PROVIDER_FAILED_TWICE' and b.updated_at>=now()-interval '10 minutes')) and b.attempt_count>=2
    and exists(select 1 from public.dabbir_conversations c where c.id=b.conversation_id
      and c.business_id=b.business_id and c.customer_id=b.customer_id and c.channel_type='whatsapp'
      and not c.demo_mode and c.state not in ('human_active','closed') and (b.state='HUMAN_REQUIRED' or c.state<>'action_required'))
    and (b.state='HUMAN_REQUIRED' or not exists(select 1 from public.dabbir_handoffs h where h.business_id=b.business_id
      and h.conversation_id=b.conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')))
    and coalesce(b.last_error,'') ~* '^(gateway_|gemini_|groq_|cloudflare_|ai_planner_unavailable|ai_planner_contract_invalid|ai_provider_failed_twice|semantic_provider_budget|empty_ai_response)'
    and not exists (
      select 1
      from public.dabbir_messages m
      where m.business_id=b.business_id
        and m.conversation_id=b.conversation_id
        and m.sender_type='customer'
        and m.created_at>b.last_message_at
    )
  order by b.updated_at asc
  limit greatest(1,least(coalesce(p_limit,12),25));
$$;

revoke all on function public.dabbir_whatsapp_ai_provider_failover(uuid,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_ai_provider_failover_candidates(integer) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_provider_failover(uuid,text) to service_role;
grant execute on function public.dabbir_whatsapp_ai_provider_failover_candidates(integer) to service_role;

comment on function public.dabbir_whatsapp_ai_provider_failover(uuid,text) is
'Preserves the first failed attempt for retry; atomically hands off only after two failed attempts. Service-role only; stale turns are cancelled and terminal retries remain idempotent.';

-- An interrupted interpretation is context, never an executable decision.
-- Reuse the current semantic contract validation, then revoke batch authority
-- inside this transaction so the retried batch can commit its successful result.
create or replace function public.dabbir_semantic_checkpoint_failure_v1(
  p_batch_id uuid,p_lock_token uuid,p_expected_version bigint,p_message_revision bigint,p_state jsonb,p_error text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.dabbir_message_batches%rowtype; s public.dabbir_ai_conversation_state%rowtype; result jsonb; checkpoint jsonb;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token,p_message_revision);
  if p_error not in ('AI_PLANNER_UNAVAILABLE','AI_PLANNER_CONTRACT_INVALID','SEMANTIC_PROVIDER_BUDGET') or p_error is null then
    raise exception 'SEMANTIC_FAILURE_CODE_INVALID';
  end if;
  select * into s from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id for update;
  if s.semantic_batch_id=b.id then raise exception 'SEMANTIC_DECISION_ALREADY_COMMITTED'; end if;
  checkpoint:=jsonb_set(p_state,'{entities}',coalesce(p_state->'entities','{}')-'slot') || jsonb_build_object(
    'pending_action','RETRY','planner_failure_code',p_error,'recovery_required',true,'intent_confirmed',false,
    'model_calls',1,'semantic_interpreter','provider_failed','operational_confidence',0);
  result:=public.dabbir_semantic_commit_v2(p_batch_id,p_lock_token,p_expected_version,p_message_revision,checkpoint,
    jsonb_build_object('action','RETRY','planner_failure_code',p_error,'model_calls',1));
  update public.dabbir_ai_conversation_state set semantic_batch_id=null
    where business_id=b.business_id and conversation_id=b.conversation_id;
  return jsonb_build_object('ok',true,'version',result->'version','executable',false);
end $$;
revoke all on function public.dabbir_semantic_checkpoint_failure_v1(uuid,uuid,bigint,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_checkpoint_failure_v1(uuid,uuid,bigint,bigint,jsonb,text) to service_role;
