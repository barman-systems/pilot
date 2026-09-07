alter table public.dabbir_operation_outcomes
  add column if not exists ai_channel text,
  add column if not exists ai_provider text,
  add column if not exists ai_model text,
  add column if not exists ai_cost_mode text,
  add column if not exists ai_input_tokens bigint,
  add column if not exists ai_output_tokens bigint,
  add column if not exists ai_reasoning_tokens bigint,
  add column if not exists ai_request_count integer,
  add column if not exists ai_cost_source text;

create index if not exists dabbir_operation_outcomes_ai_cost_by_business_idx
  on public.dabbir_operation_outcomes (business_id, ai_channel, completed_at desc)
  where ai_channel is not null;

create or replace function public.dabbir_record_ai_usage_v1(
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
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
set timezone='UTC'
as $$
declare
  v_row public.dabbir_operation_outcomes%rowtype;
begin
  if p_business_id is null
     or not exists(select 1 from public.dabbir_businesses b where b.id=p_business_id)
     or coalesce(length(p_operation_key),0)<8
     or coalesce(length(p_operation_key),0)>240
     or coalesce(length(p_operation_type),0)<3
     or coalesce(length(p_operation_type),0)>160
     or coalesce(length(p_channel),0)<2
     or coalesce(length(p_channel),0)>40 then
    raise exception 'AI_USAGE_ARGUMENT_INVALID';
  end if;

  insert into public.dabbir_operation_outcomes(
    business_id,operation_key,correlation_id,operation_type,outcome,failure_class,
    safe_eligible,autonomous,estimated_manual_seconds,duration_ms,cost_microusd,
    source,metadata,started_at,completed_at,created_at,
    ai_channel,ai_provider,ai_model,ai_cost_mode,ai_input_tokens,ai_output_tokens,
    ai_reasoning_tokens,ai_request_count,ai_cost_source
  ) values (
    p_business_id,p_operation_key,p_operation_key,p_operation_type,'VERIFIED_SUCCESS',null,
    false,false,0,null,
    case when p_actual_cost_microusd is null then null else greatest(0,p_actual_cost_microusd) end,
    'ai_usage_meter',
    coalesce(p_metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'meter_version','v1',
      'billing_reference','provider_or_gateway_actual_when_available'
    ),
    pg_catalog.now(),pg_catalog.now(),pg_catalog.now(),
    left(coalesce(p_channel,''),40),nullif(left(coalesce(p_provider,''),120),''),
    nullif(left(coalesce(p_model,''),160),''),nullif(left(coalesce(p_cost_mode,''),80),''),
    greatest(0,coalesce(p_input_tokens,0)),greatest(0,coalesce(p_output_tokens,0)),
    greatest(0,coalesce(p_reasoning_tokens,0)),greatest(1,coalesce(p_request_count,1)),
    nullif(left(coalesce(p_cost_source,''),120),'')
  )
  on conflict (business_id,operation_key) do update
  set
    ai_channel=excluded.ai_channel,
    ai_provider=coalesce(excluded.ai_provider,public.dabbir_operation_outcomes.ai_provider),
    ai_model=coalesce(excluded.ai_model,public.dabbir_operation_outcomes.ai_model),
    ai_cost_mode=coalesce(excluded.ai_cost_mode,public.dabbir_operation_outcomes.ai_cost_mode),
    ai_input_tokens=greatest(coalesce(public.dabbir_operation_outcomes.ai_input_tokens,0),coalesce(excluded.ai_input_tokens,0)),
    ai_output_tokens=greatest(coalesce(public.dabbir_operation_outcomes.ai_output_tokens,0),coalesce(excluded.ai_output_tokens,0)),
    ai_reasoning_tokens=greatest(coalesce(public.dabbir_operation_outcomes.ai_reasoning_tokens,0),coalesce(excluded.ai_reasoning_tokens,0)),
    ai_request_count=greatest(coalesce(public.dabbir_operation_outcomes.ai_request_count,1),coalesce(excluded.ai_request_count,1)),
    cost_microusd=coalesce(excluded.cost_microusd,public.dabbir_operation_outcomes.cost_microusd),
    ai_cost_source=coalesce(excluded.ai_cost_source,public.dabbir_operation_outcomes.ai_cost_source),
    metadata=coalesce(public.dabbir_operation_outcomes.metadata,'{}'::jsonb)||coalesce(excluded.metadata,'{}'::jsonb),
    completed_at=pg_catalog.now()
  returning * into v_row;

  return pg_catalog.jsonb_build_object(
    'ok',true,
    'id',v_row.id,
    'business_id',v_row.business_id,
    'channel',v_row.ai_channel,
    'provider',v_row.ai_provider,
    'model',v_row.ai_model,
    'cost_microusd',v_row.cost_microusd,
    'input_tokens',v_row.ai_input_tokens,
    'output_tokens',v_row.ai_output_tokens,
    'reasoning_tokens',v_row.ai_reasoning_tokens,
    'request_count',v_row.ai_request_count
  );
end;
$$;

revoke all on function public.dabbir_record_ai_usage_v1(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_record_ai_usage_v1(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,bigint,text,jsonb) to service_role;

create or replace view public.dabbir_ai_customer_cost_monthly_v1
with (security_invoker=true)
as
select
  business_id,
  pg_catalog.date_trunc('month',completed_at) as month_start,
  coalesce(ai_channel,'unknown') as channel,
  coalesce(ai_provider,'unknown') as provider,
  coalesce(ai_model,'unknown') as model,
  count(*)::bigint as metered_operations,
  coalesce(sum(ai_request_count),0)::bigint as ai_requests,
  coalesce(sum(ai_input_tokens),0)::bigint as input_tokens,
  coalesce(sum(ai_output_tokens),0)::bigint as output_tokens,
  coalesce(sum(ai_reasoning_tokens),0)::bigint as reasoning_tokens,
  coalesce(sum(cost_microusd) filter (where cost_microusd is not null),0)::bigint as known_cost_microusd,
  count(*) filter (where cost_microusd is null)::bigint as unpriced_operations,
  round((coalesce(sum(cost_microusd) filter (where cost_microusd is not null),0)::numeric / 1000000.0),6) as known_cost_usd,
  round(((coalesce(sum(cost_microusd) filter (where cost_microusd is not null),0)::numeric / 1000000.0) * 3.6725),6) as known_cost_aed
from public.dabbir_operation_outcomes
where source='ai_usage_meter'
group by business_id,pg_catalog.date_trunc('month',completed_at),coalesce(ai_channel,'unknown'),coalesce(ai_provider,'unknown'),coalesce(ai_model,'unknown');

revoke all on public.dabbir_ai_customer_cost_monthly_v1 from public,anon;
grant select on public.dabbir_ai_customer_cost_monthly_v1 to authenticated,service_role;

comment on function public.dabbir_record_ai_usage_v1(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,bigint,text,jsonb) is
  'Idempotent per-business AI usage meter. Stores channel/provider/model/tokens and only records monetary cost when an actual provider or gateway value is available.';
comment on view public.dabbir_ai_customer_cost_monthly_v1 is
  'Monthly per-business AI usage and known-cost breakdown by channel/provider/model; unpriced_operations stays explicit to avoid false zero-cost accounting.';