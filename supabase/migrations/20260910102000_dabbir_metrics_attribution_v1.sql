-- Canonical DABBIR AI usage attribution fact.
-- Additive only. Legacy rows remain valid and explicitly unattributed.

alter table public.dabbir_operation_outcomes
  add column if not exists conversation_id uuid,
  add column if not exists customer_id uuid,
  add column if not exists branch_id uuid;

create index if not exists dabbir_operation_outcomes_ai_time_v2_idx
  on public.dabbir_operation_outcomes (business_id, completed_at desc)
  where source in ('ai_usage_meter','ai_gateway_billing_reconciliation');
create index if not exists dabbir_operation_outcomes_ai_conversation_v2_idx
  on public.dabbir_operation_outcomes (business_id, conversation_id, completed_at desc)
  where source='ai_usage_meter' and conversation_id is not null;
create index if not exists dabbir_operation_outcomes_ai_branch_v2_idx
  on public.dabbir_operation_outcomes (business_id, branch_id, completed_at desc)
  where source='ai_usage_meter' and branch_id is not null;
create index if not exists dabbir_operation_outcomes_ai_customer_v2_idx
  on public.dabbir_operation_outcomes (business_id, customer_id, completed_at desc)
  where source='ai_usage_meter' and customer_id is not null;

create or replace function public.dabbir_record_ai_usage_v2(
  p_business_id uuid,
  p_operation_key text,
  p_operation_type text,
  p_channel text,
  p_provider text,
  p_model text,
  p_cost_mode text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_reasoning_tokens bigint,
  p_request_count integer,
  p_actual_cost_microusd bigint,
  p_cost_source text,
  p_metadata jsonb,
  p_conversation_id uuid default null,
  p_customer_id uuid default null,
  p_branch_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
set timezone='UTC'
as $$
declare
  v_result jsonb;
  v_conversation_customer uuid;
  v_conversation_branch uuid;
  v_customer_id uuid:=p_customer_id;
  v_branch_id uuid:=p_branch_id;
begin
  if p_conversation_id is not null then
    select c.customer_id,c.branch_id
      into v_conversation_customer,v_conversation_branch
    from public.dabbir_conversations c
    where c.id=p_conversation_id and c.business_id=p_business_id;
    if not found then raise exception 'AI_USAGE_CONVERSATION_SCOPE_INVALID'; end if;
    if p_customer_id is not null and p_customer_id is distinct from v_conversation_customer then
      raise exception 'AI_USAGE_CUSTOMER_SCOPE_INVALID';
    end if;
    if p_branch_id is not null and v_conversation_branch is not null and p_branch_id is distinct from v_conversation_branch then
      raise exception 'AI_USAGE_BRANCH_SCOPE_INVALID';
    end if;
    v_customer_id:=coalesce(p_customer_id,v_conversation_customer);
    v_branch_id:=coalesce(p_branch_id,v_conversation_branch);
  end if;

  if v_customer_id is not null and not exists(
    select 1 from public.dabbir_customers c where c.id=v_customer_id and c.business_id=p_business_id
  ) then raise exception 'AI_USAGE_CUSTOMER_SCOPE_INVALID'; end if;
  if v_branch_id is not null and not exists(
    select 1 from public.dabbir_business_branches b where b.id=v_branch_id and b.business_id=p_business_id
  ) then raise exception 'AI_USAGE_BRANCH_SCOPE_INVALID'; end if;

  v_result:=public.dabbir_record_ai_usage_v1(
    p_business_id,p_operation_key,p_operation_type,p_channel,p_provider,p_model,p_cost_mode,
    p_input_tokens,p_output_tokens,p_reasoning_tokens,p_request_count,p_actual_cost_microusd,
    p_cost_source,coalesce(p_metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'attribution_version',2,
      'conversation_attributed',p_conversation_id is not null,
      'customer_attributed',v_customer_id is not null,
      'branch_attributed',v_branch_id is not null
    )
  );

  update public.dabbir_operation_outcomes o
     set conversation_id=coalesce(o.conversation_id,p_conversation_id),
         customer_id=coalesce(o.customer_id,v_customer_id),
         branch_id=coalesce(o.branch_id,v_branch_id)
   where o.business_id=p_business_id
     and o.operation_key=p_operation_key
     and o.source='ai_usage_meter';

  return coalesce(v_result,'{}'::jsonb)||pg_catalog.jsonb_build_object(
    'attribution_version',2,
    'conversation_id',p_conversation_id,
    'customer_id',v_customer_id,
    'branch_id',v_branch_id
  );
end;
$$;

revoke all on function public.dabbir_record_ai_usage_v2(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,bigint,text,jsonb,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_record_ai_usage_v2(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,bigint,text,jsonb,uuid,uuid,uuid) to service_role;

create or replace view public.dabbir_ai_usage_fact_v1
with (security_invoker=true)
as
select
  o.id,
  o.business_id,
  b.business_type as activity_type,
  o.branch_id,
  o.customer_id,
  o.conversation_id,
  coalesce(o.ai_channel,'unknown') as channel,
  coalesce(o.ai_provider,'unknown') as provider,
  coalesce(o.ai_model,'unknown') as model,
  o.operation_type,
  case
    when lower(coalesce(o.ai_provider,''))='vercel-ai-gateway' then 'GATEWAY'
    when upper(coalesce(o.ai_cost_mode,'')) like 'FREE%' then 'FREE'
    when upper(coalesce(o.ai_cost_mode,'')) like 'PAID%' then 'PAID'
    when upper(coalesce(o.ai_cost_mode,'')) like '%DIRECT%' then 'DIRECT'
    else 'UNKNOWN'
  end as cost_mode,
  greatest(0,coalesce(o.ai_request_count,0))::bigint as ai_requests,
  greatest(0,coalesce(o.ai_input_tokens,0))::bigint as input_tokens,
  greatest(0,coalesce(o.ai_output_tokens,0))::bigint as output_tokens,
  greatest(0,coalesce(o.ai_reasoning_tokens,0))::bigint as reasoning_tokens,
  greatest(0,coalesce(o.ai_input_tokens,0)+coalesce(o.ai_output_tokens,0)+coalesce(o.ai_reasoning_tokens,0))::bigint as total_tokens,
  o.cost_microusd,
  o.ai_cost_source as cost_source,
  case when o.cost_microusd is null then 'PARTIAL_COST' else 'COMPLETE_COST' end as cost_measurement_state,
  case
    when lower(coalesce(o.ai_channel,''))='whatsapp' and o.conversation_id is null then 'PARTIAL'
    when o.conversation_id is not null and o.customer_id is null then 'PARTIAL'
    else 'COMPLETE'
  end as attribution_state,
  o.completed_at,
  pg_catalog.date_trunc('hour',o.completed_at) as hour,
  pg_catalog.date_trunc('day',o.completed_at) as day,
  pg_catalog.date_trunc('week',o.completed_at) as week,
  pg_catalog.date_trunc('month',o.completed_at) as month
from public.dabbir_operation_outcomes o
join public.dabbir_businesses b on b.id=o.business_id
where o.source='ai_usage_meter';

revoke all on public.dabbir_ai_usage_fact_v1 from public,anon,authenticated;
grant select on public.dabbir_ai_usage_fact_v1 to service_role;

comment on function public.dabbir_record_ai_usage_v2(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,bigint,text,jsonb,uuid,uuid,uuid) is
  'Idempotent AI usage meter with tenant-validated conversation/customer/branch attribution. Monetary cost remains actual-only.';
comment on view public.dabbir_ai_usage_fact_v1 is
  'Canonical server-only AI usage fact: business/activity/branch/channel/provider/model/operation/time plus explicit cost and attribution measurement state.';
