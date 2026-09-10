-- Owner AI usage/cost rollup. Built from the canonical usage fact and authoritative gateway reconciliation.
-- No inferred monetary values; incomplete attribution remains PARTIAL.

create or replace function dabbir_private.owner_metric_v1(
  p_value jsonb,p_state text,p_source text,p_definition text,p_aggregation text
) returns jsonb
language sql immutable
set search_path=''
as $$
  select jsonb_build_object(
    'value',p_value,
    'measurement_state',case when upper(coalesce(p_state,'')) in ('COMPLETE','PARTIAL','UNKNOWN','NOT_MEASURED','INSUFFICIENT_SAMPLE') then upper(p_state) else 'UNKNOWN' end,
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
  where upper(coalesce(p_scope->>'authority_role',''))='ROOT_OWNER'
     or (
       upper(coalesce(p_scope->>'authority_role',''))='OWNER_DELEGATE'
       and case upper(coalesce(p_scope#>>'{access_scope,type}',''))
         when 'ALL_BUSINESSES' then true
         when 'SPECIFIC_BUSINESS' then b.id::text=coalesce(p_scope#>>'{access_scope,business_id}','')
         when 'ASSIGNED_BUSINESSES_ONLY' then exists(
           select 1
           from jsonb_array_elements_text(coalesce(p_scope#>'{access_scope,business_ids}','[]'::jsonb)) x(v)
           where x.v=b.id::text
         )
         when 'SPECIFIC_REGION' then upper(coalesce(b.country_code,''))=upper(coalesce(p_scope#>>'{access_scope,region_code}',''))
         else false
       end
     )
$$;
revoke all on function dabbir_private.owner_scope_businesses_v1(jsonb) from public,anon,authenticated;
grant execute on function dabbir_private.owner_scope_businesses_v1(jsonb) to service_role;

create or replace function public.dabbir_owner_usage_measurement_v1(
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
  v_channel text:=nullif(lower(btrim(coalesce(p_channel,''))),'');
  v_provider text:=nullif(lower(btrim(coalesce(p_provider,''))),'');
  v_model text:=nullif(btrim(coalesce(p_model,'')),'');
  v_requests bigint:=0; v_input bigint:=0; v_output bigint:=0; v_reasoning bigint:=0;
  v_direct_cost bigint:=0; v_gateway_cost bigint:=0; v_unpriced bigint:=0; v_unattributed bigint:=0;
  v_state text:='UNKNOWN';
  v_breakdowns jsonb:='{}'::jsonb;
  v_meter_start constant timestamptz:='2026-09-07 13:38:11+00';
begin
  if upper(coalesce(p_scope->>'authority_role','')) not in ('ROOT_OWNER','OWNER_DELEGATE') then raise exception 'OWNER_MEASUREMENT_AUTHORITY_REQUIRED'; end if;
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '366 days' then raise exception 'OWNER_MEASUREMENT_WINDOW_INVALID'; end if;
  if length(coalesce(v_channel,''))>80 or length(coalesce(v_provider,''))>120 or length(coalesce(v_model,''))>180 then raise exception 'OWNER_MEASUREMENT_FILTER_INVALID'; end if;
  if p_business_id is not null and not exists(select 1 from dabbir_private.owner_scope_businesses_v1(p_scope) s where s.business_id=p_business_id) then raise exception 'OWNER_MEASUREMENT_BUSINESS_SCOPE_DENIED'; end if;
  if p_branch_id is not null and not exists(
    select 1 from public.dabbir_business_branches br
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=br.business_id
    where br.id=p_branch_id and (p_business_id is null or br.business_id=p_business_id)
  ) then raise exception 'OWNER_MEASUREMENT_BRANCH_SCOPE_DENIED'; end if;

  with usage_rows as (
    select f.*
    from public.dabbir_ai_usage_fact_v1 f
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
    where f.completed_at>=p_start and f.completed_at<p_end
      and (p_business_id is null or f.business_id=p_business_id)
      and (p_branch_id is null or f.branch_id=p_branch_id)
      and (v_channel is null or lower(f.channel)=v_channel)
      and (v_provider is null or lower(f.provider)=v_provider)
      and (v_model is null or f.model=v_model)
  ), gateway_rows as (
    select o.*
    from public.dabbir_operation_outcomes o
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id
    where p_branch_id is null
      and o.source='ai_gateway_billing_reconciliation'
      and o.cost_microusd is not null
      and o.started_at>=p_start and o.completed_at<=p_end
      and (p_business_id is null or o.business_id=p_business_id)
      and (v_channel is null or v_channel='whatsapp')
      and (v_provider is null or v_provider='vercel-ai-gateway')
      and (v_model is null or coalesce(o.ai_model,'unknown')=v_model)
  )
  select
    coalesce((select sum(ai_requests) from usage_rows),0),
    coalesce((select sum(input_tokens) from usage_rows),0),
    coalesce((select sum(output_tokens) from usage_rows),0),
    coalesce((select sum(reasoning_tokens) from usage_rows),0),
    coalesce((select sum(cost_microusd) from usage_rows where provider<>'vercel-ai-gateway' and cost_microusd is not null),0),
    coalesce((select sum(cost_microusd) from gateway_rows),0),
    coalesce((select count(*) from usage_rows u where
      (u.provider<>'vercel-ai-gateway' and u.cost_microusd is null)
      or (u.provider='vercel-ai-gateway' and not exists(
        select 1 from gateway_rows g
        where g.business_id=u.business_id
          and coalesce(g.ai_model,'unknown')=u.model
          and u.completed_at>=g.started_at and u.completed_at<g.completed_at
      ))
    ),0)
  into v_requests,v_input,v_output,v_reasoning,v_direct_cost,v_gateway_cost,v_unpriced;

  select count(*) into v_unattributed
  from public.dabbir_ai_usage_fact_v1 f
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
  where f.completed_at>=p_start and f.completed_at<p_end
    and (p_business_id is null or f.business_id=p_business_id)
    and (v_channel is null or lower(f.channel)=v_channel)
    and (v_provider is null or lower(f.provider)=v_provider)
    and (v_model is null or f.model=v_model)
    and ((f.channel='whatsapp' and f.conversation_id is null) or (p_branch_id is not null and f.branch_id is null));

  v_state:=case when p_start<v_meter_start or v_unpriced>0 or v_unattributed>0 then 'PARTIAL' else 'COMPLETE' end;

  with u as (
    select f.* from public.dabbir_ai_usage_fact_v1 f
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
    where f.completed_at>=p_start and f.completed_at<p_end
      and (p_business_id is null or f.business_id=p_business_id)
      and (p_branch_id is null or f.branch_id=p_branch_id)
      and (v_channel is null or lower(f.channel)=v_channel)
      and (v_provider is null or lower(f.provider)=v_provider)
      and (v_model is null or f.model=v_model)
  ), g as (
    select o.* from public.dabbir_operation_outcomes o
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id
    where p_branch_id is null and o.source='ai_gateway_billing_reconciliation' and o.cost_microusd is not null
      and o.started_at>=p_start and o.completed_at<=p_end
      and (p_business_id is null or o.business_id=p_business_id)
      and (v_channel is null or v_channel='whatsapp')
      and (v_provider is null or v_provider='vercel-ai-gateway')
      and (v_model is null or coalesce(o.ai_model,'unknown')=v_model)
  ), business_usage as (
    select business_id,sum(ai_requests)::bigint ai_requests,sum(total_tokens)::bigint total_tokens,
      coalesce(sum(cost_microusd) filter(where provider<>'vercel-ai-gateway'),0)::bigint direct_cost,
      count(*) filter(where cost_microusd is null)::bigint raw_unpriced,
      bool_or(provider='vercel-ai-gateway') as has_gateway
    from u group by business_id
  ), business_gateway as (
    select business_id,sum(cost_microusd)::bigint gateway_cost from g group by business_id
  ), business_rollup as (
    select b.id business_id,b.name,b.business_type activity_type,
      coalesce(bu.ai_requests,0)::bigint ai_requests,coalesce(bu.total_tokens,0)::bigint total_tokens,
      round((coalesce(bu.direct_cost,0)+coalesce(bg.gateway_cost,0))::numeric/1000000*3.6725,6) confirmed_cost_aed,
      case when coalesce(bu.raw_unpriced,0)>0 and not (coalesce(bu.has_gateway,false) and bg.gateway_cost is not null) then 'PARTIAL' else v_state end measurement_state
    from public.dabbir_businesses b
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=b.id
    left join business_usage bu on bu.business_id=b.id
    left join business_gateway bg on bg.business_id=b.id
    where (p_business_id is null or b.id=p_business_id) and (bu.business_id is not null or bg.business_id is not null)
  ), activity_rollup as (
    select activity_type,sum(ai_requests)::bigint ai_requests,sum(total_tokens)::bigint total_tokens,round(sum(confirmed_cost_aed),6) confirmed_cost_aed,
      case when bool_or(measurement_state<>'COMPLETE') then 'PARTIAL' else 'COMPLETE' end measurement_state
    from business_rollup group by activity_type
  ), branch_rollup as (
    select branch_id,sum(ai_requests)::bigint ai_requests,sum(total_tokens)::bigint total_tokens,
      round(coalesce(sum(cost_microusd) filter(where provider<>'vercel-ai-gateway'),0)::numeric/1000000*3.6725,6) confirmed_direct_cost_aed,
      case when branch_id is null or bool_or(provider='vercel-ai-gateway') or bool_or(cost_microusd is null) then 'PARTIAL' else 'COMPLETE' end measurement_state
    from u group by branch_id
  ), channel_rollup as (
    select channel,sum(ai_requests)::bigint ai_requests,sum(total_tokens)::bigint total_tokens,
      round(coalesce(sum(cost_microusd) filter(where provider<>'vercel-ai-gateway'),0)::numeric/1000000*3.6725,6) confirmed_direct_cost_aed,
      case when bool_or(provider='vercel-ai-gateway') or bool_or(cost_microusd is null) then 'PARTIAL' else 'COMPLETE' end measurement_state
    from u group by channel
  ), provider_usage as (
    select provider,model,sum(ai_requests)::bigint ai_requests,sum(total_tokens)::bigint total_tokens,
      coalesce(sum(cost_microusd) filter(where provider<>'vercel-ai-gateway'),0)::bigint direct_cost,
      count(*) filter(where cost_microusd is null)::bigint raw_unpriced
    from u group by provider,model
  ), provider_gateway as (
    select 'vercel-ai-gateway'::text provider,coalesce(ai_model,'unknown') model,sum(cost_microusd)::bigint gateway_cost
    from g group by coalesce(ai_model,'unknown')
  ), provider_dims as (
    select provider,model from provider_usage union select provider,model from provider_gateway
  ), provider_rollup as (
    select d.provider,d.model,coalesce(pu.ai_requests,0)::bigint ai_requests,coalesce(pu.total_tokens,0)::bigint total_tokens,
      round((case when d.provider='vercel-ai-gateway' then coalesce(pg.gateway_cost,0) else coalesce(pu.direct_cost,0) end)::numeric/1000000*3.6725,6) confirmed_cost_aed,
      coalesce(pu.raw_unpriced,0)::bigint unpriced_operations,
      case when d.provider='vercel-ai-gateway' then case when pg.gateway_cost is null then 'PARTIAL' else 'COMPLETE' end when coalesce(pu.raw_unpriced,0)>0 then 'PARTIAL' else 'COMPLETE' end measurement_state
    from provider_dims d left join provider_usage pu using(provider,model) left join provider_gateway pg using(provider,model)
  ), operation_rollup as (
    select operation_type,sum(ai_requests)::bigint ai_requests,sum(total_tokens)::bigint total_tokens,
      round(coalesce(sum(cost_microusd) filter(where provider<>'vercel-ai-gateway'),0)::numeric/1000000*3.6725,6) confirmed_direct_cost_aed,
      case when bool_or(provider='vercel-ai-gateway') or bool_or(cost_microusd is null) then 'PARTIAL' else 'COMPLETE' end measurement_state
    from u group by operation_type
  ), mode_rollup as (
    select cost_mode,sum(ai_requests)::bigint ai_requests,sum(total_tokens)::bigint total_tokens,
      round(coalesce(sum(cost_microusd),0)::numeric/1000000*3.6725,6) known_operation_cost_aed,
      case when bool_or(cost_microusd is null) then 'PARTIAL' else 'COMPLETE' end measurement_state
    from u group by cost_mode
  ), daily_usage as (
    select date_trunc('day',completed_at) bucket_day,sum(ai_requests)::bigint ai_requests,sum(total_tokens)::bigint total_tokens,
      coalesce(sum(cost_microusd) filter(where provider<>'vercel-ai-gateway'),0)::bigint direct_cost,
      count(*) filter(where cost_microusd is null)::bigint raw_unpriced
    from u group by date_trunc('day',completed_at)
  ), daily_gateway as (
    select date_trunc('day',completed_at) bucket_day,sum(cost_microusd)::bigint gateway_cost from g group by date_trunc('day',completed_at)
  ), daily_dims as (
    select bucket_day from daily_usage union select bucket_day from daily_gateway
  ), daily_rollup as (
    select d.bucket_day,coalesce(du.ai_requests,0)::bigint ai_requests,coalesce(du.total_tokens,0)::bigint total_tokens,
      round((coalesce(du.direct_cost,0)+coalesce(dg.gateway_cost,0))::numeric/1000000*3.6725,6) confirmed_cost_aed,
      case when coalesce(du.raw_unpriced,0)>0 and dg.gateway_cost is null then 'PARTIAL' else v_state end measurement_state
    from daily_dims d left join daily_usage du using(bucket_day) left join daily_gateway dg using(bucket_day)
  )
  select jsonb_build_object(
    'business',coalesce((select jsonb_agg(to_jsonb(x) order by x.ai_requests desc) from business_rollup x),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(to_jsonb(x) order by x.ai_requests desc) from activity_rollup x),'[]'::jsonb),
    'branch',coalesce((select jsonb_agg(to_jsonb(x) order by x.ai_requests desc) from branch_rollup x),'[]'::jsonb),
    'channel',coalesce((select jsonb_agg(to_jsonb(x) order by x.ai_requests desc) from channel_rollup x),'[]'::jsonb),
    'provider_model',coalesce((select jsonb_agg(to_jsonb(x) order by x.ai_requests desc) from provider_rollup x),'[]'::jsonb),
    'operation_type',coalesce((select jsonb_agg(to_jsonb(x) order by x.ai_requests desc) from operation_rollup x),'[]'::jsonb),
    'cost_mode',coalesce((select jsonb_agg(to_jsonb(x) order by x.ai_requests desc) from mode_rollup x),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(to_jsonb(x) order by x.bucket_day) from daily_rollup x),'[]'::jsonb)
  ) into v_breakdowns;

  return jsonb_build_object(
    'window',jsonb_build_object('start',p_start,'end',p_end),
    'measurement_state',v_state,
    'metrics',jsonb_build_object(
      'ai_requests',dabbir_private.owner_metric_v1(to_jsonb(v_requests),v_state,'dabbir_ai_usage_fact_v1','Actual metered provider request attempts.','SUM ai_requests'),
      'input_tokens',dabbir_private.owner_metric_v1(to_jsonb(v_input),v_state,'dabbir_ai_usage_fact_v1','Provider-reported input tokens.','SUM input_tokens'),
      'output_tokens',dabbir_private.owner_metric_v1(to_jsonb(v_output),v_state,'dabbir_ai_usage_fact_v1','Provider-reported output tokens.','SUM output_tokens'),
      'reasoning_tokens',dabbir_private.owner_metric_v1(to_jsonb(v_reasoning),v_state,'dabbir_ai_usage_fact_v1','Provider-reported reasoning tokens where exposed.','SUM reasoning_tokens'),
      'total_tokens',dabbir_private.owner_metric_v1(to_jsonb(v_input+v_output+v_reasoning),v_state,'dabbir_ai_usage_fact_v1','Input + output + reasoning tokens.','SUM token components'),
      'confirmed_cost_usd',dabbir_private.owner_metric_v1(to_jsonb(round((v_direct_cost+v_gateway_cost)::numeric/1000000,6)),v_state,'dabbir_operation_outcomes + Vercel AI Gateway reconciliation','Confirmed direct provider cost plus authoritative gateway reconciliation only.','confirmed microusd / 1,000,000'),
      'confirmed_cost_aed',dabbir_private.owner_metric_v1(to_jsonb(round((v_direct_cost+v_gateway_cost)::numeric/1000000*3.6725,6)),v_state,'dabbir_operation_outcomes + Vercel AI Gateway reconciliation','Confirmed direct provider cost plus authoritative gateway reconciliation only.','confirmed USD * 3.6725'),
      'unpriced_operations',dabbir_private.owner_metric_v1(to_jsonb(v_unpriced),'COMPLETE','dabbir_ai_usage_fact_v1 + gateway reconciliation coverage','Metered operations without confirmed direct cost or a covering gateway reconciliation.','COUNT uncovered usage facts'),
      'unattributed_operations',dabbir_private.owner_metric_v1(to_jsonb(v_unattributed),'COMPLETE','dabbir_ai_usage_fact_v1','Usage facts missing conversation/branch attribution required for exact drill-down.','COUNT facts missing required attribution')
    ),
    'breakdowns',v_breakdowns
  );
end;
$$;
revoke all on function public.dabbir_owner_usage_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_owner_usage_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) to service_role;
comment on function public.dabbir_owner_usage_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) is 'Server-only scoped AI usage and confirmed-cost rollup. Gateway cost is never fabricated or allocated to branch/operation without authoritative attribution.';
