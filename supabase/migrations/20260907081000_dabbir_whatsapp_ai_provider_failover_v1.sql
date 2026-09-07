-- DABBIR WhatsApp AI provider failover v1
-- A complete provider-chain outage must never leave a customer silently waiting.
-- Provider failures are converted once into a durable human handoff; external
-- delivery remains handled by the application after this transaction commits.

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

  if v_batch.state = 'HUMAN_REQUIRED' then
    return jsonb_build_object(
      'ok',true,'handled',true,'already_handled',true,
      'batch_id',v_batch.id,'business_id',v_batch.business_id,
      'conversation_id',v_batch.conversation_id
    );
  end if;

  if v_batch.state <> 'RETRY' then
    return jsonb_build_object('ok',true,'handled',false,'state',v_batch.state);
  end if;

  if coalesce(v_batch.last_error,v_error,'') !~* '^(gateway_|gemini_|groq_|cloudflare_|ai_planner_unavailable|empty_ai_response)' then
    return jsonb_build_object('ok',true,'handled',false,'state','NOT_PROVIDER_FAILURE');
  end if;

  -- Never escalate an obsolete turn after the customer has already sent a newer message.
  if exists (
    select 1
    from public.dabbir_messages m
    where m.business_id = v_batch.business_id
      and m.conversation_id = v_batch.conversation_id
      and m.sender_type = 'customer'
      and m.created_at > v_batch.last_message_at
  ) then
    update public.dabbir_message_batches
       set state='CANCELLED',
           processed_at=now(),
           next_attempt_at=null,
           lock_token=null,
           locked_until=null,
           last_error='SUPERSEDED_BY_NEW_CUSTOMER_MESSAGE',
           updated_at=now()
     where id=v_batch.id;
    return jsonb_build_object('ok',true,'handled',false,'state','SUPERSEDED');
  end if;

  select m.body
    into v_customer_body
  from public.dabbir_messages m
  where m.business_id=v_batch.business_id
    and m.conversation_id=v_batch.conversation_id
    and m.sender_type='customer'
  order by m.created_at desc
  limit 1;

  v_handoff := public.dabbir_whatsapp_ai_handoff(
    v_batch.business_id,
    v_batch.conversation_id,
    'SUPPORT',
    'AI provider chain unavailable; immediate continuity handoff',
    coalesce(nullif(v_error,''),coalesce(v_batch.last_error,'AI_PROVIDER_CHAIN_UNAVAILABLE'))
  );

  update public.dabbir_message_batches
     set state='HUMAN_REQUIRED',
         processed_at=now(),
         next_attempt_at=null,
         lock_token=null,
         locked_until=null,
         last_error=coalesce(nullif(v_error,''),v_batch.last_error,'AI_PROVIDER_CHAIN_UNAVAILABLE'),
         updated_at=now()
   where id=v_batch.id;

  return jsonb_build_object(
    'ok',true,
    'handled',true,
    'already_handled',false,
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
    and b.state='RETRY'
    and b.dispatch_token is not null
    and coalesce(b.last_error,'') ~* '^(gateway_|gemini_|groq_|cloudflare_|ai_planner_unavailable|empty_ai_response)'
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
'Atomically converts an exhausted WhatsApp AI provider failure into one durable human handoff. Service-role only; stale turns are cancelled.';
