-- DABBIR WhatsApp AI provider-continuity safety v2.
-- Provider degradation is recoverable only while AI still owns the conversation.

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
  v_customer_body text;
  v_customer_language text := 'en';
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

  -- Never emit an AI continuity reply after ownership has moved to a human.
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

  select m.body into v_customer_body
  from public.dabbir_messages m
  where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id
    and m.sender_type='customer'
  order by m.created_at desc
  limit 1;
  if coalesce(v_customer_body,'') ~ '[ء-ي]' then v_customer_language:='ar'; end if;

  -- Return only the language needed for the continuity acknowledgement, never raw customer text.
  return jsonb_build_object(
    'ok',true,'handled',true,'state','DEGRADED_PENDING','batch_id',v_batch.id,
    'business_id',v_batch.business_id,'conversation_id',v_batch.conversation_id,
    'customer_language',v_customer_language,'failure_code',v_effective_error
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

-- Historical audit repair only: the old generic handoff function incorrectly marked
-- every system escalation as if the customer explicitly requested a human.
update public.dabbir_handoffs h
set metadata=coalesce(h.metadata,'{}'::jsonb) || jsonb_build_object(
  'customer_requested_human',
    upper(trim(coalesce(h.reason,'')))='CUSTOMER_REQUESTED_HUMAN'
    or lower(trim(coalesce(h.reason,'')))='customer requested human assistance',
  'reason_code',
    case
      when upper(trim(coalesce(h.reason,'')))='CUSTOMER_REQUESTED_HUMAN'
        or lower(trim(coalesce(h.reason,'')))='customer requested human assistance'
      then 'CUSTOMER_REQUESTED_HUMAN'
      else upper(left(regexp_replace(coalesce(h.reason,'SYSTEM_HANDOFF'),'[^A-Za-z0-9_]+','_','g'),120))
    end
)
where coalesce(h.metadata->>'source','')='dabbir_whatsapp_ai';

comment on function public.dabbir_whatsapp_ai_provider_failover(uuid,text) is
'Prepares provider-degraded continuity only while AI owns the conversation; returns no raw customer text.';
comment on function public.dabbir_whatsapp_ai_provider_failover_candidates(integer) is
'Returns only retryable provider failures with no newer customer message and no active human ownership.';
