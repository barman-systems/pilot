-- Keep channel-specific cost-per-conversation denominators accurate as DABBIR adds channels.
create or replace function public.dabbir_platform_ai_usage_snapshot_v1()
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
with bounds as (
  select
    pg_catalog.date_trunc('month', pg_catalog.now()) as month_start,
    pg_catalog.date_trunc('month', pg_catalog.now()) + interval '1 month' as month_end
),
cost as (
  select
    coalesce(sum(v.ai_requests),0)::bigint as ai_requests,
    coalesce(sum(v.input_tokens),0)::bigint as input_tokens,
    coalesce(sum(v.output_tokens),0)::bigint as output_tokens,
    coalesce(sum(v.reasoning_tokens),0)::bigint as reasoning_tokens,
    coalesce(sum(v.known_cost_aed),0)::numeric as known_cost_aed,
    coalesce(sum(v.known_cost_usd),0)::numeric as known_cost_usd,
    coalesce(sum(v.unpriced_operations),0)::bigint as unpriced_operations,
    coalesce(sum(v.known_cost_aed) filter (where v.channel='whatsapp'),0)::numeric as whatsapp_known_cost_aed,
    coalesce(sum(v.unpriced_operations) filter (where v.channel='whatsapp'),0)::bigint as whatsapp_unpriced_operations
  from public.dabbir_ai_customer_cost_monthly_v1 v
  cross join bounds b
  where v.month_start >= b.month_start and v.month_start < b.month_end
),
conversation as (
  select
    count(*)::bigint as messages,
    count(distinct m.conversation_id)::bigint as conversations,
    count(*) filter (where coalesce(m.simulated,false)=true)::bigint as simulated_messages,
    count(*) filter (where c.channel_type='whatsapp')::bigint as whatsapp_messages,
    count(distinct m.conversation_id) filter (where c.channel_type='whatsapp')::bigint as whatsapp_conversations
  from public.dabbir_messages m
  left join public.dabbir_conversations c on c.id=m.conversation_id
  cross join bounds b
  where m.created_at >= b.month_start and m.created_at < b.month_end
),
providers as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider',p.provider,
    'ai_requests',p.ai_requests,
    'known_cost_aed',p.known_cost_aed,
    'unpriced_operations',p.unpriced_operations
  ) order by p.known_cost_aed desc, p.ai_requests desc),'[]'::jsonb) as rows
  from (
    select
      v.provider,
      coalesce(sum(v.ai_requests),0)::bigint as ai_requests,
      round(coalesce(sum(v.known_cost_aed),0),6) as known_cost_aed,
      coalesce(sum(v.unpriced_operations),0)::bigint as unpriced_operations
    from public.dabbir_ai_customer_cost_monthly_v1 v
    cross join bounds b
    where v.month_start >= b.month_start and v.month_start < b.month_end
    group by v.provider
  ) p
)
select jsonb_build_object(
  'generated_at',pg_catalog.now(),
  'month_start',(select month_start from bounds),
  'conversations',conversation.conversations,
  'messages',conversation.messages,
  'simulated_messages',conversation.simulated_messages,
  'whatsapp_conversations',conversation.whatsapp_conversations,
  'whatsapp_messages',conversation.whatsapp_messages,
  'ai_requests',cost.ai_requests,
  'input_tokens',cost.input_tokens,
  'output_tokens',cost.output_tokens,
  'reasoning_tokens',cost.reasoning_tokens,
  'total_tokens',cost.input_tokens + cost.output_tokens + cost.reasoning_tokens,
  'known_cost_aed',round(cost.known_cost_aed,6),
  'known_cost_usd',round(cost.known_cost_usd,6),
  'unpriced_operations',cost.unpriced_operations,
  'whatsapp_known_cost_aed',round(cost.whatsapp_known_cost_aed,6),
  'whatsapp_unpriced_operations',cost.whatsapp_unpriced_operations,
  'known_cost_per_conversation_aed',case when conversation.whatsapp_conversations>0 then round(cost.whatsapp_known_cost_aed/conversation.whatsapp_conversations,6) else null end,
  'measurement_state',case when cost.unpriced_operations>0 then 'PARTIAL' else 'COMPLETE' end,
  'providers',providers.rows
)
from cost, conversation, providers;
$function$;

revoke all on function public.dabbir_platform_ai_usage_snapshot_v1() from public, anon, authenticated;
grant execute on function public.dabbir_platform_ai_usage_snapshot_v1() to service_role;
