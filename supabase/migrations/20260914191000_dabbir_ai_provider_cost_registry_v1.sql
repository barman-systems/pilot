-- DABBIR AI Provider Cost Registry V1
-- Actual invoice cost and conservative budget exposure are intentionally separate.

alter table public.dabbir_operation_outcomes
  add column if not exists ai_budget_exposure_microusd bigint;

insert into public.dabbir_capability_registry (
  capability_key,action_class,risk_level,intents,activity_types,required_fields,
  tool_name,verification_mode,mutates,human_approval,enabled,shadow_only,contract,updated_at
) values
('ai.provider.google_gemini.gemini_3_7_flash','READ','LOW','{}','{}','{}','AI_PROVIDER_GOOGLE_GEMINI','COST_LEDGER_READBACK',false,false,true,false,
 jsonb_build_object('kind','AI_PROVIDER_COST','provider','google-gemini','model','gemini-3.7-flash','accounting_mode','PAID_EQUIVALENT_UPPER_BOUND','input_usd_per_million',0.75,'output_usd_per_million',3.75,'reasoning_usd_per_million',3.75,'zero_usage_reserve_aed',1.0,'free_tier_treated_as_paid',true,'pricing_checked_at','2026-09-14','valid_through','2026-12-31','pricing_source','https://ai.google.dev/gemini-api/docs/pricing'),now()),
('ai.provider.google_gemini.embedding_2','READ','LOW','{}','{}','{}','AI_PROVIDER_GOOGLE_GEMINI_EMBEDDING','COST_LEDGER_READBACK',false,false,true,false,
 jsonb_build_object('kind','AI_PROVIDER_COST','provider','google-gemini','model','gemini-embedding-2','accounting_mode','PAID_EQUIVALENT_UPPER_BOUND','input_usd_per_million',0.20,'output_usd_per_million',0,'reasoning_usd_per_million',0,'zero_usage_reserve_aed',0.25,'free_tier_treated_as_paid',true,'pricing_checked_at','2026-09-14','valid_through','2026-12-31','pricing_source','https://ai.google.dev/gemini-api/docs/pricing'),now()),
('ai.provider.groq.gpt_oss_20b','READ','LOW','{}','{}','{}','AI_PROVIDER_GROQ','COST_LEDGER_READBACK',false,false,true,false,
 jsonb_build_object('kind','AI_PROVIDER_COST','provider','groq','model','openai/gpt-oss-20b','accounting_mode','PAID_EQUIVALENT_UPPER_BOUND','input_usd_per_million',0.075,'output_usd_per_million',0.30,'reasoning_usd_per_million',0.30,'free_tier_treated_as_paid',true,'pricing_checked_at','2026-09-14','valid_through','2026-12-31','pricing_source','https://console.groq.com/docs/model/openai/gpt-oss-20b'),now()),
('ai.provider.cloudflare.glm_4_7_flash','READ','LOW','{}','{}','{}','AI_PROVIDER_CLOUDFLARE_GLM','COST_LEDGER_READBACK',false,false,true,false,
 jsonb_build_object('kind','AI_PROVIDER_COST','provider','cloudflare-workers-ai','model','@cf/zai-org/glm-4.7-flash','accounting_mode','PAID_EQUIVALENT_UPPER_BOUND','input_usd_per_million',0.06,'output_usd_per_million',0.40,'reasoning_usd_per_million',0.40,'free_tier_treated_as_paid',true,'pricing_checked_at','2026-09-14','valid_through','2026-12-31','pricing_source','https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/'),now()),
('ai.provider.cloudflare.whisper_large_v3_turbo','READ','LOW','{}','{}','{}','AI_PROVIDER_CLOUDFLARE_WHISPER','COST_LEDGER_READBACK',false,false,true,false,
 jsonb_build_object('kind','AI_PROVIDER_COST','provider','cloudflare-workers-ai','model','@cf/openai/whisper-large-v3-turbo','accounting_mode','CONSERVATIVE_FIXED_RESERVE','audio_usd_per_minute',0.00051,'zero_usage_reserve_aed',1.0,'free_tier_treated_as_paid',true,'pricing_checked_at','2026-09-14','valid_through','2026-12-31','pricing_source','https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/'),now()),
('ai.provider.vercel_ai_gateway','READ','LOW','{}','{}','{}','AI_PROVIDER_VERCEL_GATEWAY','GATEWAY_BILLING_REPORT',false,false,true,false,
 jsonb_build_object('kind','AI_PROVIDER_COST','provider','vercel-ai-gateway','model','*','accounting_mode','ACTUAL_GATEWAY_REPORT','pricing_checked_at','2026-09-14','billing_source','VERCEL_AI_GATEWAY_REPORT'),now())
on conflict (capability_key) do update set
  tool_name=excluded.tool_name,verification_mode=excluded.verification_mode,enabled=true,shadow_only=false,
  contract=excluded.contract,updated_at=now();

create or replace function public.dabbir_record_ai_usage_v1(
  p_business_id uuid,p_operation_key text,p_operation_type text,p_channel text,p_provider text,p_model text,
  p_cost_mode text,p_input_tokens bigint,p_output_tokens bigint,p_reasoning_tokens bigint,p_request_count integer,
  p_actual_cost_microusd bigint,p_cost_source text,p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
set timezone='UTC'
as $$
declare
  v_row public.dabbir_operation_outcomes%rowtype;
  v_contract jsonb;
  v_actual_cost bigint;
  v_exposure bigint;
  v_source text;
  v_input numeric:=greatest(0,coalesce(p_input_tokens,0));
  v_output numeric:=greatest(0,coalesce(p_output_tokens,0));
  v_reasoning numeric:=greatest(0,coalesce(p_reasoning_tokens,0));
  v_in_rate numeric:=0;
  v_out_rate numeric:=0;
  v_reason_rate numeric:=0;
  v_reserve_aed numeric:=0;
begin
  if p_business_id is null
     or not exists(select 1 from public.dabbir_businesses b where b.id=p_business_id)
     or coalesce(length(p_operation_key),0)<8 or coalesce(length(p_operation_key),0)>240
     or coalesce(length(p_operation_type),0)<3 or coalesce(length(p_operation_type),0)>160
     or coalesce(length(p_channel),0)<2 or coalesce(length(p_channel),0)>40 then
    raise exception 'AI_USAGE_ARGUMENT_INVALID';
  end if;

  v_actual_cost:=case when p_actual_cost_microusd is null then null else greatest(0,p_actual_cost_microusd) end;
  v_exposure:=v_actual_cost;
  v_source:=nullif(left(coalesce(p_cost_source,''),120),'');

  if v_exposure is null and coalesce(p_provider,'')<>'' and coalesce(p_provider,'')<>'vercel-ai-gateway' then
    select c.contract into v_contract
    from public.dabbir_capability_registry c
    where c.enabled and not c.shadow_only
      and c.contract->>'kind'='AI_PROVIDER_COST'
      and c.contract->>'provider'=p_provider
      and c.contract->>'model'=p_model
      and (nullif(c.contract->>'valid_through','') is null or (c.contract->>'valid_through')::date>=(pg_catalog.now())::date)
    order by c.updated_at desc limit 1;

    if v_contract is not null then
      v_in_rate:=coalesce(nullif(v_contract->>'input_usd_per_million','')::numeric,0);
      v_out_rate:=coalesce(nullif(v_contract->>'output_usd_per_million','')::numeric,0);
      v_reason_rate:=coalesce(nullif(v_contract->>'reasoning_usd_per_million','')::numeric,v_out_rate,0);
      v_reserve_aed:=coalesce(nullif(v_contract->>'zero_usage_reserve_aed','')::numeric,0);
      if v_input+v_output+v_reasoning>0 and (v_in_rate>0 or v_out_rate>0 or v_reason_rate>0) then
        -- USD / 1M tokens multiplied by token count equals micro-USD directly.
        -- Reasoning is added separately on purpose: this is a conservative ceiling, not an invoice estimate.
        v_exposure:=pg_catalog.ceil(v_input*v_in_rate+v_output*v_out_rate+v_reasoning*v_reason_rate)::bigint;
        v_source:='PAID_EQUIVALENT_REGISTRY_ESTIMATE_V1';
      elsif v_reserve_aed>0 then
        v_exposure:=pg_catalog.ceil((v_reserve_aed/3.6725)*1000000)::bigint;
        v_source:='CONSERVATIVE_REGISTRY_RESERVE_V1';
      end if;
    end if;
  end if;

  insert into public.dabbir_operation_outcomes(
    business_id,operation_key,correlation_id,operation_type,outcome,failure_class,safe_eligible,autonomous,
    estimated_manual_seconds,duration_ms,cost_microusd,ai_budget_exposure_microusd,source,metadata,
    started_at,completed_at,created_at,ai_channel,ai_provider,ai_model,ai_cost_mode,
    ai_input_tokens,ai_output_tokens,ai_reasoning_tokens,ai_request_count,ai_cost_source
  ) values (
    p_business_id,p_operation_key,p_operation_key,p_operation_type,'VERIFIED_SUCCESS',null,false,false,
    0,null,v_actual_cost,v_exposure,'ai_usage_meter',
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object(
      'meter_version','v2_provider_cost_registry',
      'paid_equivalent_not_invoice',v_actual_cost is null and v_exposure is not null,
      'invoice_cost_known',v_actual_cost is not null
    ),now(),now(),now(),left(coalesce(p_channel,''),40),nullif(left(coalesce(p_provider,''),120),''),
    nullif(left(coalesce(p_model,''),160),''),nullif(left(coalesce(p_cost_mode,''),80),''),
    v_input::bigint,v_output::bigint,v_reasoning::bigint,greatest(1,coalesce(p_request_count,1)),v_source
  )
  on conflict (business_id,operation_key) do update set
    ai_channel=excluded.ai_channel,
    ai_provider=coalesce(excluded.ai_provider,public.dabbir_operation_outcomes.ai_provider),
    ai_model=coalesce(excluded.ai_model,public.dabbir_operation_outcomes.ai_model),
    ai_cost_mode=coalesce(excluded.ai_cost_mode,public.dabbir_operation_outcomes.ai_cost_mode),
    ai_input_tokens=greatest(coalesce(public.dabbir_operation_outcomes.ai_input_tokens,0),coalesce(excluded.ai_input_tokens,0)),
    ai_output_tokens=greatest(coalesce(public.dabbir_operation_outcomes.ai_output_tokens,0),coalesce(excluded.ai_output_tokens,0)),
    ai_reasoning_tokens=greatest(coalesce(public.dabbir_operation_outcomes.ai_reasoning_tokens,0),coalesce(excluded.ai_reasoning_tokens,0)),
    ai_request_count=greatest(coalesce(public.dabbir_operation_outcomes.ai_request_count,1),coalesce(excluded.ai_request_count,1)),
    cost_microusd=coalesce(excluded.cost_microusd,public.dabbir_operation_outcomes.cost_microusd),
    ai_budget_exposure_microusd=coalesce(excluded.ai_budget_exposure_microusd,public.dabbir_operation_outcomes.ai_budget_exposure_microusd),
    ai_cost_source=coalesce(excluded.ai_cost_source,public.dabbir_operation_outcomes.ai_cost_source),
    metadata=coalesce(public.dabbir_operation_outcomes.metadata,'{}'::jsonb)||coalesce(excluded.metadata,'{}'::jsonb),
    completed_at=now()
  returning * into v_row;

  return jsonb_build_object('ok',true,'id',v_row.id,'business_id',v_row.business_id,'channel',v_row.ai_channel,
    'provider',v_row.ai_provider,'model',v_row.ai_model,'cost_microusd',v_row.cost_microusd,
    'budget_exposure_microusd',v_row.ai_budget_exposure_microusd,'cost_source',v_row.ai_cost_source,
    'input_tokens',v_row.ai_input_tokens,'output_tokens',v_row.ai_output_tokens,
    'reasoning_tokens',v_row.ai_reasoning_tokens,'request_count',v_row.ai_request_count);
end;
$$;

revoke all on function public.dabbir_record_ai_usage_v1(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_record_ai_usage_v1(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,bigint,text,jsonb) to service_role;

-- Backfill only budget exposure. Historical invoice truth remains unchanged.
with price as (
  select o.id,o.cost_microusd,o.ai_input_tokens,o.ai_output_tokens,o.ai_reasoning_tokens,c.contract
  from public.dabbir_operation_outcomes o
  join public.dabbir_capability_registry c
    on c.enabled and not c.shadow_only and c.contract->>'kind'='AI_PROVIDER_COST'
   and c.contract->>'provider'=o.ai_provider and c.contract->>'model'=o.ai_model
  where o.completed_at>=date_trunc('month',now()) and o.ai_provider is not null
    and o.ai_provider<>'vercel-ai-gateway' and o.ai_budget_exposure_microusd is null
)
update public.dabbir_operation_outcomes o
set ai_budget_exposure_microusd=case
      when p.cost_microusd is not null then greatest(0,p.cost_microusd)
      when coalesce(p.ai_input_tokens,0)+coalesce(p.ai_output_tokens,0)+coalesce(p.ai_reasoning_tokens,0)>0 then
        ceil(
          coalesce(p.ai_input_tokens,0)*coalesce(nullif(p.contract->>'input_usd_per_million','')::numeric,0)
          +coalesce(p.ai_output_tokens,0)*coalesce(nullif(p.contract->>'output_usd_per_million','')::numeric,0)
          +coalesce(p.ai_reasoning_tokens,0)*coalesce(nullif(p.contract->>'reasoning_usd_per_million','')::numeric,coalesce(nullif(p.contract->>'output_usd_per_million','')::numeric,0))
        )::bigint
      when coalesce(nullif(p.contract->>'zero_usage_reserve_aed','')::numeric,0)>0 then
        ceil((nullif(p.contract->>'zero_usage_reserve_aed','')::numeric/3.6725)*1000000)::bigint
      else null end,
    metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object('provider_cost_registry_backfill','v1','invoice_truth_unchanged',true)
from price p where o.id=p.id;

create or replace view public.dabbir_ai_budget_exposure_monthly_v1
with (security_invoker=true)
as
select
  date_trunc('month',completed_at) as month_start,
  coalesce(ai_provider,'unknown') as provider,
  coalesce(ai_model,'unknown') as model,
  count(*)::bigint as metered_operations,
  coalesce(sum(ai_budget_exposure_microusd) filter (where ai_budget_exposure_microusd is not null),0)::bigint as exposure_microusd,
  count(*) filter (where ai_budget_exposure_microusd is null)::bigint as unpriced_operations,
  count(*) filter (where ai_cost_source='PAID_EQUIVALENT_REGISTRY_ESTIMATE_V1')::bigint as paid_equivalent_operations,
  count(*) filter (where ai_cost_source='CONSERVATIVE_REGISTRY_RESERVE_V1')::bigint as conservative_reserve_operations
from public.dabbir_operation_outcomes
where source='ai_usage_meter' and ai_provider is not null and ai_provider<>'vercel-ai-gateway'
group by date_trunc('month',completed_at),coalesce(ai_provider,'unknown'),coalesce(ai_model,'unknown');

revoke all on public.dabbir_ai_budget_exposure_monthly_v1 from public,anon,authenticated;
grant select on public.dabbir_ai_budget_exposure_monthly_v1 to service_role;

comment on column public.dabbir_operation_outcomes.ai_budget_exposure_microusd is
  'Conservative AI budget exposure. May be a paid-equivalent estimate or reserve and must not be presented as an invoice cost.';
comment on view public.dabbir_ai_budget_exposure_monthly_v1 is
  'Service-role-only direct-provider budget exposure. Kept separate from invoice/actual cost views.';
