-- Scoped owner AI usage/cost measurement with explicit truth states.

create or replace function dabbir_private.owner_metric_v1(
  p_value jsonb,p_state text,p_source text,p_definition text,p_aggregation text
) returns jsonb
language sql immutable
set search_path=''
as $$
  select pg_catalog.jsonb_build_object(
    'value',p_value,
    'measurement_state',case when pg_catalog.upper(pg_catalog.coalesce(p_state,'')) in ('COMPLETE','PARTIAL','UNKNOWN','NOT_MEASURED','INSUFFICIENT_SAMPLE') then pg_catalog.upper(p_state) else 'UNKNOWN' end,
    'authoritative_source',p_source,
    'definition',p_definition,
    'aggregation_rule',p_aggregation
  )
$$;
revoke all on function dabbir_private.owner_metric_v1(jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function dabbir_private.owner_metric_v1(jsonb,text,text,text,text) to service_role;

create or replace function dabbir_private.owner_scope_businesses_v1(p_scope jsonb)
returns table(business_id uuid)
language sql stable
security definer
set search_path=''
as $$
  select b.id
  from public.dabbir_businesses b
  where
    pg_catalog.upper(pg_catalog.coalesce(p_scope->>'authority_role',''))='ROOT_OWNER'
    or (
      pg_catalog.upper(pg_catalog.coalesce(p_scope->>'authority_role',''))='OWNER_DELEGATE'
      and case pg_catalog.upper(pg_catalog.coalesce(p_scope#>>'{access_scope,type}',''))
        when 'ALL_BUSINESSES' then true
        when 'SPECIFIC_BUSINESS' then b.id::text=pg_catalog.coalesce(p_scope#>>'{access_scope,business_id}','')
        when 'ASSIGNED_BUSINESSES_ONLY' then exists(
          select 1 from pg_catalog.jsonb_array_elements_text(pg_catalog.coalesce(p_scope#>'{access_scope,business_ids}','[]'::jsonb)) x(v)
          where x.v=b.id::text
        )
        when 'SPECIFIC_REGION' then pg_catalog.upper(pg_catalog.coalesce(b.country_code,''))=pg_catalog.upper(pg_catalog.coalesce(p_scope#>>'{access_scope,region_code}',''))
        else false
      end
    )
$$;
revoke all on function dabbir_private.owner_scope_businesses_v1(jsonb) from public,anon,authenticated;
grant execute on function dabbir_private.owner_scope_businesses_v1(jsonb) to service_role;

create or replace function public.dabbir_owner_cost_measurement_v1(
  p_scope jsonb,
  p_start timestamptz,
  p_end timestamptz,
  p_business_id uuid default null,
  p_branch_id uuid default null,
  p_channel text default null,
  p_provider text default null,
  p_model text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
set timezone='UTC'
as $$
declare
  v_channel text:=pg_catalog.nullif(pg_catalog.lower(pg_catalog.trim(pg_catalog.coalesce(p_channel,''))),'');
  v_provider text:=pg_catalog.nullif(pg_catalog.lower(pg_catalog.trim(pg_catalog.coalesce(p_provider,''))),'');
  v_model text:=pg_catalog.nullif(pg_catalog.trim(pg_catalog.coalesce(p_model,'')),'');
  v_rows bigint:=0; v_requests bigint:=0; v_input bigint:=0; v_output bigint:=0; v_reasoning bigint:=0;
  v_direct_cost bigint:=0; v_gateway_cost bigint:=0; v_unpriced bigint:=0; v_unattributed bigint:=0;
  v_state text:='UNKNOWN';
  v_business jsonb:='[]'::jsonb; v_activity jsonb:='[]'::jsonb; v_branch jsonb:='[]'::jsonb;
  v_channel_rows jsonb:='[]'::jsonb; v_provider_model jsonb:='[]'::jsonb; v_operation jsonb:='[]'::jsonb;
  v_cost_mode jsonb:='[]'::jsonb; v_daily jsonb:='[]'::jsonb;
  v_meter_start constant timestamptz:='2026-09-07 13:38:11+00';
begin
  if pg_catalog.upper(pg_catalog.coalesce(p_scope->>'authority_role','')) not in ('ROOT_OWNER','OWNER_DELEGATE') then raise exception 'OWNER_MEASUREMENT_AUTHORITY_REQUIRED'; end if;
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '366 days' then raise exception 'OWNER_MEASUREMENT_WINDOW_INVALID'; end if;
  if pg_catalog.length(pg_catalog.coalesce(v_channel,''))>80 or pg_catalog.length(pg_catalog.coalesce(v_provider,''))>120 or pg_catalog.length(pg_catalog.coalesce(v_model,''))>180 then raise exception 'OWNER_MEASUREMENT_FILTER_INVALID'; end if;
  if p_business_id is not null and not exists(select 1 from dabbir_private.owner_scope_businesses_v1(p_scope) s where s.business_id=p_business_id) then raise exception 'OWNER_MEASUREMENT_BUSINESS_SCOPE_DENIED'; end if;
  if p_branch_id is not null and not exists(select 1 from public.dabbir_business_branches br join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=br.business_id where br.id=p_branch_id and (p_business_id is null or br.business_id=p_business_id)) then raise exception 'OWNER_MEASUREMENT_BRANCH_SCOPE_DENIED'; end if;

  with u as (
    select f.* from public.dabbir_ai_usage_fact_v1 f
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
    where f.completed_at>=p_start and f.completed_at<p_end
      and (p_business_id is null or f.business_id=p_business_id)
      and (p_branch_id is null or f.branch_id=p_branch_id)
      and (v_channel is null or pg_catalog.lower(f.channel)=v_channel)
      and (v_provider is null or pg_catalog.lower(f.provider)=v_provider)
      and (v_model is null or f.model=v_model)
  ), r as (
    select o.* from public.dabbir_operation_outcomes o
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id
    where o.source='ai_gateway_billing_reconciliation' and o.cost_microusd is not null
      and o.started_at>=p_start and o.completed_at<=p_end
      and (p_business_id is null or o.business_id=p_business_id)
      and (v_channel is null or v_channel='whatsapp')
      and (v_provider is null or v_provider='vercel-ai-gateway')
      and (v_model is null or pg_catalog.coalesce(o.ai_model,'unknown')=v_model)
  )
  select (select pg_catalog.count(*) from u),
         (select pg_catalog.coalesce(pg_catalog.sum(ai_requests),0) from u),
         (select pg_catalog.coalesce(pg_catalog.sum(input_tokens),0) from u),
         (select pg_catalog.coalesce(pg_catalog.sum(output_tokens),0) from u),
         (select pg_catalog.coalesce(pg_catalog.sum(reasoning_tokens),0) from u),
         (select pg_catalog.coalesce(pg_catalog.sum(cost_microusd),0) from u where provider<>'vercel-ai-gateway' and cost_microusd is not null),
         (select pg_catalog.coalesce(pg_catalog.sum(cost_microusd),0) from r),
         (select pg_catalog.count(*) from u x where (x.provider<>'vercel-ai-gateway' and x.cost_microusd is null) or (x.provider='vercel-ai-gateway' and not exists(select 1 from r z where z.business_id=x.business_id and pg_catalog.coalesce(z.ai_model,'unknown')=x.model and x.completed_at>=z.started_at and x.completed_at<z.completed_at))),
         (select pg_catalog.count(*) from u where (channel='whatsapp' and conversation_id is null) or (p_branch_id is not null and branch_id is null))
    into v_rows,v_requests,v_input,v_output,v_reasoning,v_direct_cost,v_gateway_cost,v_unpriced,v_unattributed;

  v_state:=case when p_start<v_meter_start then 'PARTIAL' when v_unpriced>0 or v_unattributed>0 then 'PARTIAL' else 'COMPLETE' end;

  with u as (
    select f.* from public.dabbir_ai_usage_fact_v1 f join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
    where f.completed_at>=p_start and f.completed_at<p_end and (p_business_id is null or f.business_id=p_business_id) and (p_branch_id is null or f.branch_id=p_branch_id) and (v_channel is null or pg_catalog.lower(f.channel)=v_channel) and (v_provider is null or pg_catalog.lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)
  ), r as (
    select o.* from public.dabbir_operation_outcomes o join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id
    where o.source='ai_gateway_billing_reconciliation' and o.cost_microusd is not null and o.started_at>=p_start and o.completed_at<=p_end and (p_business_id is null or o.business_id=p_business_id) and (v_channel is null or v_channel='whatsapp') and (v_provider is null or v_provider='vercel-ai-gateway') and (v_model is null or pg_catalog.coalesce(o.ai_model,'unknown')=v_model)
  ), ug as (
    select business_id,pg_catalog.sum(ai_requests)::bigint requests,pg_catalog.sum(total_tokens)::bigint tokens,pg_catalog.sum(cost_microusd) filter(where provider<>'vercel-ai-gateway' and cost_microusd is not null)::bigint direct_cost,pg_catalog.count(*) filter(where cost_microusd is null)::bigint raw_unpriced from u group by business_id
  ), rg as (select business_id,pg_catalog.sum(cost_microusd)::bigint gateway_cost from r group by business_id)
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('business_id',b.id,'name',b.name,'activity_type',b.business_type,'ai_requests',pg_catalog.coalesce(ug.requests,0),'total_tokens',pg_catalog.coalesce(ug.tokens,0),'confirmed_cost_aed',pg_catalog.round((pg_catalog.coalesce(ug.direct_cost,0)+pg_catalog.coalesce(rg.gateway_cost,0))::numeric/1000000*3.6725,6),'measurement_state',case when pg_catalog.coalesce(ug.raw_unpriced,0)>0 then 'PARTIAL' else v_state end) order by pg_catalog.coalesce(ug.requests,0) desc),'[]'::jsonb)
    into v_business
  from public.dabbir_businesses b join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=b.id left join ug on ug.business_id=b.id left join rg on rg.business_id=b.id
  where (p_business_id is null or b.id=p_business_id) and (ug.business_id is not null or rg.business_id is not null);

  with b as (select x from pg_catalog.jsonb_array_elements(v_business) x)
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('activity_type',activity_type,'ai_requests',requests,'total_tokens',tokens,'confirmed_cost_aed',cost_aed,'measurement_state',case when partial_count>0 then 'PARTIAL' else v_state end) order by requests desc),'[]'::jsonb)
  into v_activity
  from (
    select x->>'activity_type' activity_type,pg_catalog.sum((x->>'ai_requests')::bigint)::bigint requests,pg_catalog.sum((x->>'total_tokens')::bigint)::bigint tokens,pg_catalog.round(pg_catalog.sum((x->>'confirmed_cost_aed')::numeric),6) cost_aed,pg_catalog.count(*) filter(where x->>'measurement_state'<>'COMPLETE') partial_count from b group by x->>'activity_type'
  ) q;

  with u as (
    select f.* from public.dabbir_ai_usage_fact_v1 f join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
    where f.completed_at>=p_start and f.completed_at<p_end and (p_business_id is null or f.business_id=p_business_id) and (p_branch_id is null or f.branch_id=p_branch_id) and (v_channel is null or pg_catalog.lower(f.channel)=v_channel) and (v_provider is null or pg_catalog.lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)
  )
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('branch_id',q.branch_id,'ai_requests',q.requests,'total_tokens',q.tokens,'confirmed_direct_cost_aed',q.cost_aed,'measurement_state',q.state) order by q.requests desc),'[]'::jsonb) into v_branch
  from (
    select branch_id,pg_catalog.sum(ai_requests)::bigint requests,pg_catalog.sum(total_tokens)::bigint tokens,pg_catalog.round(pg_catalog.coalesce(pg_catalog.sum(cost_microusd) filter(where provider<>'vercel-ai-gateway'),0)::numeric/1000000*3.6725,6) cost_aed,
      case when branch_id is null or pg_catalog.bool_or(provider='vercel-ai-gateway') or pg_catalog.bool_or(cost_microusd is null) then 'PARTIAL' else 'COMPLETE' end state
    from u group by branch_id
  ) q;

  with u as (
    select f.* from public.dabbir_ai_usage_fact_v1 f join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
    where f.completed_at>=p_start and f.completed_at<p_end and (p_business_id is null or f.business_id=p_business_id) and (p_branch_id is null or f.branch_id=p_branch_id) and (v_channel is null or pg_catalog.lower(f.channel)=v_channel) and (v_provider is null or pg_catalog.lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)
  )
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('channel',channel,'ai_requests',requests,'total_tokens',tokens,'confirmed_direct_cost_aed',cost_aed,'measurement_state',state) order by requests desc),'[]'::jsonb) into v_channel_rows
  from (select channel,pg_catalog.sum(ai_requests)::bigint requests,pg_catalog.sum(total_tokens)::bigint tokens,pg_catalog.round(pg_catalog.coalesce(pg_catalog.sum(cost_microusd) filter(where provider<>'vercel-ai-gateway'),0)::numeric/1000000*3.6725,6) cost_aed,case when pg_catalog.bool_or(provider='vercel-ai-gateway') or pg_catalog.bool_or(cost_microusd is null) then 'PARTIAL' else 'COMPLETE' end state from u group by channel) q;

  with u as (
    select f.* from public.dabbir_ai_usage_fact_v1 f join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
    where f.completed_at>=p_start and f.completed_at<p_end and (p_business_id is null or f.business_id=p_business_id) and (p_branch_id is null or f.branch_id=p_branch_id) and (v_channel is null or pg_catalog.lower(f.channel)=v_channel) and (v_provider is null or pg_catalog.lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)
  ), r as (
    select o.* from public.dabbir_operation_outcomes o join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id where o.source='ai_gateway_billing_reconciliation' and o.cost_microusd is not null and o.started_at>=p_start and o.completed_at<=p_end and (p_business_id is null or o.business_id=p_business_id) and (v_channel is null or v_channel='whatsapp') and (v_provider is null or v_provider='vercel-ai-gateway') and (v_model is null or pg_catalog.coalesce(o.ai_model,'unknown')=v_model)
  ), ug as (select provider,model,pg_catalog.sum(ai_requests)::bigint requests,pg_catalog.sum(total_tokens)::bigint tokens,pg_catalog.sum(cost_microusd) filter(where provider<>'vercel-ai-gateway')::bigint direct_cost,pg_catalog.count(*) filter(where cost_microusd is null)::bigint unpriced from u group by provider,model), rg as (select 'vercel-ai-gateway'::text provider,pg_catalog.coalesce(ai_model,'unknown') model,pg_catalog.sum(cost_microusd)::bigint gateway_cost from r group by pg_catalog.coalesce(ai_model,'unknown')), dims as (select provider,model from ug union select provider,model from rg)
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('provider',d.provider,'model',d.model,'ai_requests',pg_catalog.coalesce(ug.requests,0),'total_tokens',pg_catalog.coalesce(ug.tokens,0),'confirmed_cost_aed',pg_catalog.round((case when d.provider='vercel-ai-gateway' then pg_catalog.coalesce(rg.gateway_cost,0) else pg_catalog.coalesce(ug.direct_cost,0) end)::numeric/1000000*3.6725,6),'unpriced_operations',pg_catalog.coalesce(ug.unpriced,0),'measurement_state',case when d.provider='vercel-ai-gateway' and rg.gateway_cost is null then 'PARTIAL' when pg_catalog.coalesce(ug.unpriced,0)>0 then 'PARTIAL' else 'COMPLETE' end) order by pg_catalog.coalesce(ug.requests,0) desc),'[]'::jsonb) into v_provider_model from dims d left join ug using(provider,model) left join rg using(provider,model);

  with u as (select f.* from public.dabbir_ai_usage_fact_v1 f join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id where f.completed_at>=p_start and f.completed_at<p_end and (p_business_id is null or f.business_id=p_business_id) and (p_branch_id is null or f.branch_id=p_branch_id) and (v_channel is null or pg_catalog.lower(f.channel)=v_channel) and (v_provider is null or pg_catalog.lower(f.provider)=v_provider) and (v_model is null or f.model=v_model))
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('operation_type',operation_type,'ai_requests',requests,'total_tokens',tokens,'confirmed_direct_cost_aed',cost_aed,'measurement_state',state) order by requests desc),'[]'::jsonb) into v_operation from (select operation_type,pg_catalog.sum(ai_requests)::bigint requests,pg_catalog.sum(total_tokens)::bigint tokens,pg_catalog.round(pg_catalog.coalesce(pg_catalog.sum(cost_microusd) filter(where provider<>'vercel-ai-gateway'),0)::numeric/1000000*3.6725,6) cost_aed,case when pg_catalog.bool_or(provider='vercel-ai-gateway') or pg_catalog.bool_or(cost_microusd is null) then 'PARTIAL' else 'COMPLETE' end state from u group by operation_type) q;

  with u as (select f.* from public.dabbir_ai_usage_fact_v1 f join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id where f.completed_at>=p_start and f.completed_at<p_end and (p_business_id is null or f.business_id=p_business_id) and (p_branch_id is null or f.branch_id=p_branch_id) and (v_channel is null or pg_catalog.lower(f.channel)=v_channel) and (v_provider is null or pg_catalog.lower(f.provider)=v_provider) and (v_model is null or f.model=v_model))
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('cost_mode',cost_mode,'ai_requests',requests,'total_tokens',tokens,'known_operation_cost_aed',cost_aed,'measurement_state',state) order by requests desc),'[]'::jsonb) into v_cost_mode from (select cost_mode,pg_catalog.sum(ai_requests)::bigint requests,pg_catalog.sum(total_tokens)::bigint tokens,pg_catalog.round(pg_catalog.coalesce(pg_catalog.sum(cost_microusd),0)::numeric/1000000*3.6725,6) cost_aed,case when pg_catalog.bool_or(cost_microusd is null) then 'PARTIAL' else 'COMPLETE' end state from u group by cost_mode) q;

  with u as (select f.* from public.dabbir_ai_usage_fact_v1 f join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id where f.completed_at>=p_start and f.completed_at<p_end and (p_business_id is null or f.business_id=p_business_id) and (p_branch_id is null or f.branch_id=p_branch_id) and (v_channel is null or pg_catalog.lower(f.channel)=v_channel) and (v_provider is null or pg_catalog.lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)), r as (select o.* from public.dabbir_operation_outcomes o join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id where o.source='ai_gateway_billing_reconciliation' and o.cost_microusd is not null and o.started_at>=p_start and o.completed_at<=p_end and (p_business_id is null or o.business_id=p_business_id) and (v_channel is null or v_channel='whatsapp') and (v_provider is null or v_provider='vercel-ai-gateway') and (v_model is null or pg_catalog.coalesce(o.ai_model,'unknown')=v_model)), ug as (select pg_catalog.date_trunc('day',completed_at) bucket_day,pg_catalog.sum(ai_requests)::bigint requests,pg_catalog.sum(total_tokens)::bigint tokens,pg_catalog.sum(cost_microusd) filter(where provider<>'vercel-ai-gateway')::bigint direct_cost,pg_catalog.count(*) filter(where cost_microusd is null)::bigint unpriced from u group by pg_catalog.date_trunc('day',completed_at)), rg as (select pg_catalog.date_trunc('day',completed_at) bucket_day,pg_catalog.sum(cost_microusd)::bigint gateway_cost from r group by pg_catalog.date_trunc('day',completed_at)), dims as (select bucket_day from ug union select bucket_day from rg)
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('date',d.bucket_day,'ai_requests',pg_catalog.coalesce(ug.requests,0),'total_tokens',pg_catalog.coalesce(ug.tokens,0),'confirmed_cost_aed',pg_catalog.round((pg_catalog.coalesce(ug.direct_cost,0)+pg_catalog.coalesce(rg.gateway_cost,0))::numeric/1000000*3.6725,6),'measurement_state',case when pg_catalog.coalesce(ug.unpriced,0)>0 then 'PARTIAL' else v_state end) order by d.bucket_day),'[]'::jsonb) into v_daily from dims d left join ug using(bucket_day) left join rg using(bucket_day);

  return pg_catalog.jsonb_build_object(
    'window',pg_catalog.jsonb_build_object('start',p_start,'end',p_end),
    'measurement_state',v_state,
    'metrics',pg_catalog.jsonb_build_object(
      'ai_requests',dabbir_private.owner_metric_v1(pg_catalog.to_jsonb(v_requests),v_state,'dabbir_ai_usage_fact_v1','Actual metered provider request attempts.','SUM ai_requests'),
      'input_tokens',dabbir_private.owner_metric_v1(pg_catalog.to_jsonb(v_input),v_state,'dabbir_ai_usage_fact_v1','Provider-reported input tokens.','SUM input_tokens'),
      'output_tokens',dabbir_private.owner_metric_v1(pg_catalog.to_jsonb(v_output),v_state,'dabbir_ai_usage_fact_v1','Provider-reported output tokens.','SUM output_tokens'),
      'reasoning_tokens',dabbir_private.owner_metric_v1(pg_catalog.to_jsonb(v_reasoning),v_state,'dabbir_ai_usage_fact_v1','Provider-reported reasoning tokens when exposed.','SUM reasoning_tokens'),
      'total_tokens',dabbir_private.owner_metric_v1(pg_catalog.to_jsonb(v_input+v_output+v_reasoning),v_state,'dabbir_ai_usage_fact_v1','Input + output + reasoning tokens.','SUM token components'),
      'confirmed_cost_usd',dabbir_private.owner_metric_v1(pg_catalog.to_jsonb(pg_catalog.round((v_direct_cost+v_gateway_cost)::numeric/1000000,6)),v_state,'dabbir_operation_outcomes + Vercel AI Gateway reconciliation','Only direct actual cost plus non-overlapping authoritative gateway reconciliation.','confirmed microusd / 1,000,000'),
      'confirmed_cost_aed',dabbir_private.owner_metric_v1(pg_catalog.to_jsonb(pg_catalog.round((v_direct_cost+v_gateway_cost)::numeric/1000000*3.6725,6)),v_state,'dabbir_operation_outcomes + Vercel AI Gateway reconciliation','Only direct actual cost plus non-overlapping authoritative gateway reconciliation.','confirmed USD * 3.6725'),
      'unpriced_operations',dabbir_private.owner_metric_v1(pg_catalog.to_jsonb(v_unpriced),'COMPLETE','dabbir_ai_usage_fact_v1 + gateway reconciliation coverage','Metered operations lacking confirmed cost after gateway coverage check.','COUNT uncovered usage rows'),
      'unattributed_operations',dabbir_private.owner_metric_v1(pg_catalog.to_jsonb(v_unattributed),'COMPLETE','dabbir_ai_usage_fact_v1','Usage rows missing attribution required by the selected scope.','COUNT missing attribution rows')
    ),
    'breakdowns',pg_catalog.jsonb_build_object('business',v_business,'activity',v_activity,'branch',v_branch,'channel',v_channel_rows,'provider_model',v_provider_model,'operation_type',v_operation,'cost_mode',v_cost_mode,'daily',v_daily)
  );
end;
$$;
revoke all on function public.dabbir_owner_cost_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_owner_cost_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) to service_role;
comment on function public.dabbir_owner_cost_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) is 'Server-only scoped AI usage/cost measurement. Preserves PARTIAL/UNKNOWN semantics and never allocates reconciled gateway cost to branches or operations without authoritative attribution.';
