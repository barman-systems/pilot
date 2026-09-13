create or replace function public.dabbir_reconcile_ai_gateway_cost_v1(
  p_business_id uuid,
  p_operation_key text,
  p_model text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_reasoning_tokens bigint,
  p_request_count integer,
  p_actual_cost_microusd bigint,
  p_period_start timestamptz,
  p_period_end timestamptz,
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
     or p_actual_cost_microusd is null
     or p_actual_cost_microusd < 0
     or p_period_start is null
     or p_period_end is null
     or p_period_end <= p_period_start then
    raise exception 'AI_BILLING_RECONCILIATION_ARGUMENT_INVALID';
  end if;

  insert into public.dabbir_operation_outcomes(
    business_id,operation_key,correlation_id,operation_type,outcome,failure_class,
    safe_eligible,autonomous,estimated_manual_seconds,duration_ms,cost_microusd,
    source,metadata,started_at,completed_at,created_at,
    ai_channel,ai_provider,ai_model,ai_cost_mode,ai_input_tokens,ai_output_tokens,
    ai_reasoning_tokens,ai_request_count,ai_cost_source
  ) values (
    p_business_id,p_operation_key,p_operation_key,'whatsapp.ai_gateway_billing_reconciliation','VERIFIED_SUCCESS',null,
    false,false,0,null,greatest(0,p_actual_cost_microusd),
    'ai_gateway_billing_reconciliation',
    coalesce(p_metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'reconciliation_version','v1',
      'billing_source','VERCEL_AI_GATEWAY_REPORT',
      'period_start',p_period_start,
      'period_end',p_period_end
    ),
    p_period_start,p_period_end,pg_catalog.now(),
    'whatsapp','vercel-ai-gateway',nullif(left(coalesce(p_model,''),160),''),'PAID_FALLBACK',
    greatest(0,coalesce(p_input_tokens,0)),greatest(0,coalesce(p_output_tokens,0)),
    greatest(0,coalesce(p_reasoning_tokens,0)),greatest(0,coalesce(p_request_count,0)),
    'VERCEL_AI_GATEWAY_REPORT'
  )
  on conflict (business_id,operation_key) do update
  set
    cost_microusd=excluded.cost_microusd,
    ai_input_tokens=excluded.ai_input_tokens,
    ai_output_tokens=excluded.ai_output_tokens,
    ai_reasoning_tokens=excluded.ai_reasoning_tokens,
    ai_request_count=excluded.ai_request_count,
    ai_model=excluded.ai_model,
    ai_cost_source='VERCEL_AI_GATEWAY_REPORT',
    metadata=coalesce(public.dabbir_operation_outcomes.metadata,'{}'::jsonb)||coalesce(excluded.metadata,'{}'::jsonb),
    started_at=excluded.started_at,
    completed_at=excluded.completed_at
  returning * into v_row;

  return pg_catalog.jsonb_build_object(
    'ok',true,
    'id',v_row.id,
    'business_id',v_row.business_id,
    'model',v_row.ai_model,
    'cost_microusd',v_row.cost_microusd,
    'period_start',v_row.started_at,
    'period_end',v_row.completed_at
  );
end;
$$;

revoke all on function public.dabbir_reconcile_ai_gateway_cost_v1(uuid,text,text,bigint,bigint,bigint,integer,bigint,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_reconcile_ai_gateway_cost_v1(uuid,text,text,bigint,bigint,bigint,integer,bigint,timestamptz,timestamptz,jsonb) to service_role;

create or replace view public.dabbir_ai_customer_cost_monthly_v1
with (security_invoker=true)
as
with usage_rows as (
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
    coalesce(sum(cost_microusd) filter (where ai_provider <> 'vercel-ai-gateway' and cost_microusd is not null),0)::bigint as direct_known_cost_microusd,
    count(*) filter (where ai_provider <> 'vercel-ai-gateway' and cost_microusd is null)::bigint as unpriced_operations
  from public.dabbir_operation_outcomes
  where source='ai_usage_meter'
  group by business_id,pg_catalog.date_trunc('month',completed_at),coalesce(ai_channel,'unknown'),coalesce(ai_provider,'unknown'),coalesce(ai_model,'unknown')
), gateway_reconciled as (
  select
    business_id,
    pg_catalog.date_trunc('month',completed_at) as month_start,
    'whatsapp'::text as channel,
    'vercel-ai-gateway'::text as provider,
    coalesce(ai_model,'unknown') as model,
    coalesce(sum(cost_microusd),0)::bigint as reconciled_cost_microusd
  from public.dabbir_operation_outcomes
  where source='ai_gateway_billing_reconciliation'
  group by business_id,pg_catalog.date_trunc('month',completed_at),coalesce(ai_model,'unknown')
), dimensions as (
  select business_id,month_start,channel,provider,model from usage_rows
  union
  select business_id,month_start,channel,provider,model from gateway_reconciled
)
select
  d.business_id,d.month_start,d.channel,d.provider,d.model,
  coalesce(u.metered_operations,0)::bigint as metered_operations,
  coalesce(u.ai_requests,0)::bigint as ai_requests,
  coalesce(u.input_tokens,0)::bigint as input_tokens,
  coalesce(u.output_tokens,0)::bigint as output_tokens,
  coalesce(u.reasoning_tokens,0)::bigint as reasoning_tokens,
  (case when d.provider='vercel-ai-gateway' then coalesce(g.reconciled_cost_microusd,0) else coalesce(u.direct_known_cost_microusd,0) end)::bigint as known_cost_microusd,
  coalesce(u.unpriced_operations,0)::bigint as unpriced_operations,
  round(((case when d.provider='vercel-ai-gateway' then coalesce(g.reconciled_cost_microusd,0) else coalesce(u.direct_known_cost_microusd,0) end)::numeric / 1000000.0),6) as known_cost_usd,
  round((((case when d.provider='vercel-ai-gateway' then coalesce(g.reconciled_cost_microusd,0) else coalesce(u.direct_known_cost_microusd,0) end)::numeric / 1000000.0) * 3.6725),6) as known_cost_aed,
  case when d.provider='vercel-ai-gateway' and g.reconciled_cost_microusd is not null then 'VERCEL_AI_GATEWAY_REPORT'
       when d.provider='vercel-ai-gateway' then 'PENDING_GATEWAY_RECONCILIATION'
       when coalesce(u.unpriced_operations,0)>0 then 'DIRECT_PROVIDER_UNPRICED'
       else 'METERED_ACTUAL' end as cost_authority
from dimensions d
left join usage_rows u using (business_id,month_start,channel,provider,model)
left join gateway_reconciled g using (business_id,month_start,channel,provider,model);

revoke all on public.dabbir_ai_customer_cost_monthly_v1 from public,anon;
grant select on public.dabbir_ai_customer_cost_monthly_v1 to authenticated,service_role;

comment on function public.dabbir_reconcile_ai_gateway_cost_v1(uuid,text,text,bigint,bigint,bigint,integer,bigint,timestamptz,timestamptz,jsonb) is
  'Upserts authoritative Vercel AI Gateway report cost for a DABBIR business/model/day into the existing operation outcomes ledger.';
comment on view public.dabbir_ai_customer_cost_monthly_v1 is
  'Monthly per-business AI usage by channel/provider/model. Vercel paid fallback cost is sourced from reconciled AI Gateway reports; direct provider cost remains explicit when unpriced.';