-- Composite owner executive measurement snapshot: usage + quality + funnel + trends + unit economics.
-- Server-only and scope-preserving. Activity filter is implemented by narrowing an already-authorized business scope.

create or replace function public.dabbir_owner_measurement_snapshot_v1(
  p_scope jsonb,
  p_start timestamptz,
  p_end timestamptz,
  p_business_id uuid default null,
  p_branch_id uuid default null,
  p_activity_type text default null,
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
  v_scope jsonb:=p_scope;
  v_activity text:=nullif(lower(btrim(coalesce(p_activity_type,''))),'');
  v_start timestamptz:=p_start;
  v_end timestamptz:=least(p_end,now());
  v_duration interval;
  v_prev_start timestamptz;
  v_usage jsonb; v_quality jsonb; v_funnel jsonb; v_prev_usage jsonb; v_prev_quality jsonb;
  v_conversations bigint:=0; v_prev_conversations bigint:=0; v_success bigint:=0; v_prev_success bigint:=0;
  v_human_required_conversations bigint:=0; v_prev_human_required_conversations bigint:=0;
  v_human_required_rate numeric; v_prev_human_required_rate numeric;
  v_cost numeric; v_prev_cost numeric; v_autonomy numeric; v_prev_autonomy numeric; v_conversion numeric; v_prev_conversion numeric;
  v_repeat bigint:=0; v_prev_repeat bigint:=0; v_requirement_fail bigint:=0; v_prev_requirement_fail bigint:=0;
  v_bookings bigint:=0; v_completed_bookings bigint:=0; v_paid_bookings bigint:=0; v_orders bigint:=0; v_completed_orders bigint:=0; v_paid_orders bigint:=0; v_converted_customers bigint:=0; v_autonomous_conversations bigint:=0;
  v_cost_state text; v_success_state text; v_sample_ok boolean:=false;
  v_summary jsonb; v_unit_costs jsonb; v_trends jsonb; v_warnings jsonb:='[]'::jsonb; v_health jsonb;
  v_allowed_ids jsonb;
begin
  if upper(coalesce(p_scope->>'authority_role','')) not in ('ROOT_OWNER','OWNER_DELEGATE') then raise exception 'OWNER_MEASUREMENT_AUTHORITY_REQUIRED'; end if;
  if v_start is null or p_end is null or v_end<=v_start or v_end-v_start>interval '366 days' then raise exception 'OWNER_MEASUREMENT_WINDOW_INVALID'; end if;
  if v_activity is not null then
    select coalesce(jsonb_agg(s.business_id::text),'[]'::jsonb) into v_allowed_ids
    from dabbir_private.owner_scope_businesses_v1(p_scope) s
    join public.dabbir_businesses b on b.id=s.business_id
    where lower(b.business_type)=v_activity;
    v_scope:=jsonb_build_object('authority_role','OWNER_DELEGATE','access_scope',jsonb_build_object('type','ASSIGNED_BUSINESSES_ONLY','business_ids',v_allowed_ids));
  end if;
  if p_business_id is not null and not exists(select 1 from dabbir_private.owner_scope_businesses_v1(v_scope) s where s.business_id=p_business_id) then raise exception 'OWNER_MEASUREMENT_BUSINESS_SCOPE_DENIED'; end if;

  v_duration:=v_end-v_start;
  v_prev_start:=v_start-v_duration;
  v_usage:=public.dabbir_owner_usage_measurement_v1(v_scope,v_start,v_end,p_business_id,p_branch_id,p_channel,p_provider,p_model);
  v_quality:=public.dabbir_owner_quality_measurement_v1(v_scope,v_start,v_end,p_business_id,p_branch_id,p_channel,p_provider,p_model);
  v_funnel:=public.dabbir_owner_funnel_measurement_v1(v_scope,v_start,v_end,p_business_id,p_branch_id,p_channel,p_provider,p_model);
  v_prev_usage:=public.dabbir_owner_usage_measurement_v1(v_scope,v_prev_start,v_start,p_business_id,p_branch_id,p_channel,p_provider,p_model);
  v_prev_quality:=public.dabbir_owner_quality_measurement_v1(v_scope,v_prev_start,v_start,p_business_id,p_branch_id,p_channel,p_provider,p_model);

  -- Partial funnel telemetry must never manufacture drop-off. Counts remain visible as observed values with PARTIAL state.
  if coalesce(v_funnel->>'measurement_state','UNKNOWN')<>'COMPLETE' then
    select jsonb_set(v_funnel,'{funnels}',coalesce(jsonb_agg(
      (f.item-'stages')||jsonb_build_object('stages',coalesce((
        select jsonb_agg((s.item-'dropoff_count'-'dropoff_rate')||jsonb_build_object('dropoff_count',null,'dropoff_rate',null))
        from jsonb_array_elements(coalesce(f.item->'stages','[]'::jsonb)) s(item)
      ),'[]'::jsonb))
    ),'[]'::jsonb)) into v_funnel
    from jsonb_array_elements(coalesce(v_funnel->'funnels','[]'::jsonb)) f(item);
  end if;

  v_conversations:=coalesce((v_quality#>>'{conversation_intelligence,total_conversations,value}')::bigint,0);
  v_prev_conversations:=coalesce((v_prev_quality#>>'{conversation_intelligence,total_conversations,value}')::bigint,0);
  v_success:=coalesce((v_quality#>>'{conversation_intelligence,successful_goal_completion_count,value}')::bigint,0);
  v_prev_success:=coalesce((v_prev_quality#>>'{conversation_intelligence,successful_goal_completion_count,value}')::bigint,0);
  v_autonomous_conversations:=coalesce((v_quality#>>'{conversation_intelligence,autonomous_conversations,value}')::bigint,0);
  v_bookings:=coalesce((v_quality#>>'{business_outcomes,bookings,value}')::bigint,0);
  v_completed_bookings:=coalesce((v_quality#>>'{business_outcomes,completed_bookings,value}')::bigint,0);
  v_paid_bookings:=coalesce((v_quality#>>'{business_outcomes,paid_bookings,value}')::bigint,0);
  v_orders:=coalesce((v_quality#>>'{business_outcomes,orders,value}')::bigint,0);
  v_completed_orders:=coalesce((v_quality#>>'{business_outcomes,completed_orders,value}')::bigint,0);
  v_paid_orders:=coalesce((v_quality#>>'{business_outcomes,paid_orders,value}')::bigint,0);
  v_converted_customers:=coalesce((v_quality#>>'{business_outcomes,converted_customers,value}')::bigint,0);
  v_repeat:=coalesce((v_quality#>>'{conversation_intelligence,repeated_question_count,value}')::bigint,0);
  v_prev_repeat:=coalesce((v_prev_quality#>>'{conversation_intelligence,repeated_question_count,value}')::bigint,0);
  v_requirement_fail:=coalesce((v_quality#>>'{conversation_intelligence,requirement_extraction_failure_count,value}')::bigint,0);
  v_prev_requirement_fail:=coalesce((v_prev_quality#>>'{conversation_intelligence,requirement_extraction_failure_count,value}')::bigint,0);
  v_cost:=coalesce((v_usage#>>'{metrics,confirmed_cost_aed,value}')::numeric,0);
  v_prev_cost:=coalesce((v_prev_usage#>>'{metrics,confirmed_cost_aed,value}')::numeric,0);
  v_cost_state:=coalesce(v_usage#>>'{metrics,confirmed_cost_aed,measurement_state}','UNKNOWN');
  v_success_state:=coalesce(v_quality#>>'{conversation_intelligence,successful_goal_completion_count,measurement_state}','UNKNOWN');
  v_autonomy:=nullif(v_quality#>>'{quality,autonomous_completion_rate,value}','')::numeric;
  v_prev_autonomy:=nullif(v_prev_quality#>>'{quality,autonomous_completion_rate,value}','')::numeric;
  v_conversion:=nullif(v_quality#>>'{quality,goal_completion_rate,value}','')::numeric;
  v_prev_conversion:=nullif(v_prev_quality#>>'{quality,goal_completion_rate,value}','')::numeric;

  -- HUMAN_REQUIRED rate is conversation-based. Transition count remains separately available in conversation_intelligence.human_required_count.
  with sc as (
    select distinct c.id,c.business_id
    from public.dabbir_conversations c
    join dabbir_private.owner_scope_businesses_v1(v_scope) s on s.business_id=c.business_id
    join public.dabbir_messages m on m.business_id=c.business_id and m.conversation_id=c.id
    where m.created_at>=v_start and m.created_at<v_end and coalesce(m.simulated,false)=false
      and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id)
      and (p_channel is null or lower(c.channel_type)=lower(p_channel))
      and ((p_provider is null and p_model is null) or exists(select 1 from public.dabbir_ai_usage_fact_v1 f where f.business_id=c.business_id and f.conversation_id=c.id and f.completed_at>=v_start and f.completed_at<v_end and (p_provider is null or lower(f.provider)=lower(p_provider)) and (p_model is null or f.model=p_model)))
  )
  select count(distinct sc.id) into v_human_required_conversations from sc
  where exists(select 1 from public.dabbir_ai_operator_events e where e.business_id=sc.business_id and e.conversation_id=sc.id and e.event_type='human_required' and e.status='HUMAN_REQUIRED' and e.occurred_at>=v_start and e.occurred_at<v_end);

  with sc as (
    select distinct c.id,c.business_id
    from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(v_scope) s on s.business_id=c.business_id join public.dabbir_messages m on m.business_id=c.business_id and m.conversation_id=c.id
    where m.created_at>=v_prev_start and m.created_at<v_start and coalesce(m.simulated,false)=false
      and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id)
      and (p_channel is null or lower(c.channel_type)=lower(p_channel))
      and ((p_provider is null and p_model is null) or exists(select 1 from public.dabbir_ai_usage_fact_v1 f where f.business_id=c.business_id and f.conversation_id=c.id and f.completed_at>=v_prev_start and f.completed_at<v_start and (p_provider is null or lower(f.provider)=lower(p_provider)) and (p_model is null or f.model=p_model)))
  )
  select count(distinct sc.id) into v_prev_human_required_conversations from sc
  where exists(select 1 from public.dabbir_ai_operator_events e where e.business_id=sc.business_id and e.conversation_id=sc.id and e.event_type='human_required' and e.status='HUMAN_REQUIRED' and e.occurred_at>=v_prev_start and e.occurred_at<v_start);

  v_human_required_rate:=case when v_conversations=0 then null else round(v_human_required_conversations::numeric/v_conversations*100,2) end;
  v_prev_human_required_rate:=case when v_prev_conversations=0 then null else round(v_prev_human_required_conversations::numeric/v_prev_conversations*100,2) end;
  v_quality:=jsonb_set(v_quality,'{conversation_intelligence,human_required_rate}',dabbir_private.owner_metric_v1(to_jsonb(v_human_required_rate),coalesce(v_quality#>>'{measurement_health,operator}','UNKNOWN'),'dabbir_ai_operator_events + real conversations','Distinct conversations entering HUMAN_REQUIRED at least once, divided by real conversations.','human-required conversations / conversations * 100'));
  v_quality:=jsonb_set(v_quality,'{conversation_intelligence,human_required_conversations}',dabbir_private.owner_metric_v1(to_jsonb(v_human_required_conversations),coalesce(v_quality#>>'{measurement_health,operator}','UNKNOWN'),'dabbir_ai_operator_events','Distinct real conversations entering HUMAN_REQUIRED at least once.','COUNT DISTINCT conversation_id'));

  -- Metrics not fully provider/model attributable are suppressed rather than mislabeled under those filters.
  if p_provider is not null or p_model is not null then
    v_quality:=jsonb_set(v_quality,'{quality,conversation_recovery_rate}',dabbir_private.owner_metric_v1(null,'UNKNOWN','legacy telemetry','Recovery events are not fully provider/model-attributed in historical data.','UNKNOWN'));
    v_quality:=jsonb_set(v_quality,'{quality,customer_journey_completion_rate}',dabbir_private.owner_metric_v1(null,'UNKNOWN','legacy telemetry','Journey completion is not fully provider/model-attributed in historical data.','UNKNOWN'));
    v_quality:=jsonb_set(v_quality,'{conversation_intelligence,average_turns_per_success}',dabbir_private.owner_metric_v1(null,'UNKNOWN','legacy telemetry','Historical success turns are not fully provider/model-attributed.','UNKNOWN'));
    v_quality:=jsonb_set(v_quality,'{conversation_intelligence,average_turns_before_handoff}',dabbir_private.owner_metric_v1(null,'UNKNOWN','legacy telemetry','Historical handoff turns are not fully provider/model-attributed.','UNKNOWN'));
  end if;

  v_sample_ok:=v_conversations>=20 and v_prev_conversations>=20;
  v_trends:=jsonb_build_object(
    'sample_state',case when v_sample_ok then 'COMPLETE' else 'INSUFFICIENT_SAMPLE' end,
    'conversations',jsonb_build_object('current',v_conversations,'previous',v_prev_conversations,'direction',case when not v_sample_ok then 'UNKNOWN' when v_conversations>v_prev_conversations*1.05 then 'UP' when v_conversations<v_prev_conversations*0.95 then 'DOWN' else 'STABLE' end),
    'ai_spend_aed',jsonb_build_object('current',v_cost,'previous',v_prev_cost,'direction',case when not v_sample_ok or v_cost_state<>'COMPLETE' or coalesce(v_prev_usage#>>'{metrics,confirmed_cost_aed,measurement_state}','UNKNOWN')<>'COMPLETE' then 'UNKNOWN' when v_cost>v_prev_cost*1.05 then 'UP' when v_cost<v_prev_cost*0.95 then 'DOWN' else 'STABLE' end),
    'conversion_rate',jsonb_build_object('current',v_conversion,'previous',v_prev_conversion,'direction',case when not v_sample_ok or v_conversion is null or v_prev_conversion is null or v_success_state<>'COMPLETE' then 'UNKNOWN' when v_conversion>v_prev_conversion*1.05 then 'IMPROVING' when v_conversion<v_prev_conversion*0.95 then 'WORSENING' else 'STABLE' end),
    'autonomous_completion_rate',jsonb_build_object('current',v_autonomy,'previous',v_prev_autonomy,'direction',case when not v_sample_ok or v_autonomy is null or v_prev_autonomy is null then 'UNKNOWN' when v_autonomy>v_prev_autonomy*1.05 then 'IMPROVING' when v_autonomy<v_prev_autonomy*0.95 then 'WORSENING' else 'STABLE' end),
    'human_required_rate',jsonb_build_object('current',v_human_required_rate,'previous',v_prev_human_required_rate,'direction',case when not v_sample_ok or v_human_required_rate is null or v_prev_human_required_rate is null then 'UNKNOWN' when v_human_required_rate<v_prev_human_required_rate*0.95 then 'IMPROVING' when v_human_required_rate>v_prev_human_required_rate*1.05 then 'WORSENING' else 'STABLE' end),
    'repeated_questions',jsonb_build_object('current',v_repeat,'previous',v_prev_repeat,'direction',case when not v_sample_ok then 'UNKNOWN' when v_repeat<v_prev_repeat then 'IMPROVING' when v_repeat>v_prev_repeat then 'WORSENING' else 'STABLE' end),
    'requirement_failures',jsonb_build_object('current',v_requirement_fail,'previous',v_prev_requirement_fail,'direction',case when not v_sample_ok then 'UNKNOWN' when v_requirement_fail<v_prev_requirement_fail then 'IMPROVING' when v_requirement_fail>v_prev_requirement_fail then 'WORSENING' else 'STABLE' end)
  );

  if v_sample_ok and v_human_required_rate is not null and v_prev_human_required_rate is not null and v_human_required_rate-v_prev_human_required_rate>=10 and v_human_required_rate>v_prev_human_required_rate*1.5 then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','HUMAN_REQUIRED_REGRESSION','severity','WARNING')); end if;
  if v_sample_ok and v_conversion is not null and v_prev_conversion is not null and v_prev_conversion-v_conversion>=10 and v_conversion<v_prev_conversion*0.70 then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','CONVERSION_REGRESSION','severity','WARNING')); end if;
  if v_sample_ok and v_repeat>=5 and v_repeat>greatest(v_prev_repeat*2,4) then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','REPEATED_QUESTION_REGRESSION','severity','WARNING')); end if;
  if v_sample_ok and v_requirement_fail>=5 and v_requirement_fail>greatest(v_prev_requirement_fail*2,4) then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','REQUIREMENT_FAILURE_REGRESSION','severity','WARNING')); end if;

  v_summary:=jsonb_build_object(
    'conversations',v_quality#>'{conversation_intelligence,total_conversations}',
    'autonomous_completion',v_quality#>'{quality,autonomous_completion_rate}',
    'successful_business_outcomes',v_quality#>'{conversation_intelligence,successful_goal_completion_count}',
    'conversion_rate',v_quality#>'{quality,goal_completion_rate}',
    'ai_spend',v_usage#>'{metrics,confirmed_cost_aed}',
    'cost_per_success',dabbir_private.owner_metric_v1(case when v_success=0 or v_cost_state='UNKNOWN' then null else to_jsonb(round(v_cost/v_success,6)) end,case when v_success=0 then 'UNKNOWN' when v_cost_state='PARTIAL' or v_success_state='PARTIAL' then 'PARTIAL' else 'COMPLETE' end,'confirmed AI cost + durable successful outcomes','Confirmed AI spend divided by successful goal conversations.','confirmed cost / successful outcomes'),
    'human_required_rate',v_quality#>'{conversation_intelligence,human_required_rate}',
    'active_critical_failures',dabbir_private.owner_metric_v1(to_jsonb(jsonb_array_length(v_warnings)),case when v_sample_ok then 'COMPLETE' else 'INSUFFICIENT_SAMPLE' end,'period-over-period regression rules','Only material regressions with adequate sample size.','COUNT regression warnings')
  );

  v_unit_costs:=jsonb_build_object(
    'cost_per_conversation_aed',dabbir_private.owner_metric_v1(case when v_conversations=0 then null else to_jsonb(round(v_cost/v_conversations,6)) end,case when v_conversations=0 then 'UNKNOWN' else v_cost_state end,'confirmed AI cost + real conversations','Confirmed AI spend divided by real conversations.','cost / conversations'),
    'cost_per_autonomous_conversation_aed',dabbir_private.owner_metric_v1(case when v_autonomous_conversations=0 then null else to_jsonb(round(v_cost/v_autonomous_conversations,6)) end,case when v_autonomous_conversations=0 then 'UNKNOWN' else v_cost_state end,'confirmed AI cost + autonomous conversations','Confirmed AI spend divided by conversations handled without human messages/handoff in the period.','cost / autonomous conversations'),
    'cost_per_successful_goal_aed',dabbir_private.owner_metric_v1(case when v_success=0 then null else to_jsonb(round(v_cost/v_success,6)) end,case when v_success=0 then 'UNKNOWN' when v_cost_state='PARTIAL' or v_success_state='PARTIAL' then 'PARTIAL' else 'COMPLETE' end,'confirmed AI cost + durable successful outcomes','Confirmed AI spend divided by successful goal conversations.','cost / successful goals'),
    'cost_per_booking_aed',dabbir_private.owner_metric_v1(case when v_bookings=0 then null else to_jsonb(round(v_cost/v_bookings,6)) end,case when v_bookings=0 then 'UNKNOWN' when v_cost_state='PARTIAL' or coalesce(v_quality#>>'{business_outcomes,bookings,measurement_state}','UNKNOWN')<>'COMPLETE' then 'PARTIAL' else 'COMPLETE' end,'confirmed AI cost + booking funnel','Confirmed AI spend divided by distinct booked/confirmed conversations.','cost / bookings'),
    'cost_per_completed_booking_aed',dabbir_private.owner_metric_v1(case when v_completed_bookings=0 then null else to_jsonb(round(v_cost/v_completed_bookings,6)) end,case when v_completed_bookings=0 then 'UNKNOWN' when v_cost_state='PARTIAL' or coalesce(v_quality#>>'{business_outcomes,completed_bookings,measurement_state}','UNKNOWN')<>'COMPLETE' then 'PARTIAL' else 'COMPLETE' end,'confirmed AI cost + booking funnel','Confirmed AI spend divided by completed booking conversations.','cost / completed bookings'),
    'cost_per_order_aed',dabbir_private.owner_metric_v1(case when v_orders=0 then null else to_jsonb(round(v_cost/v_orders,6)) end,case when v_orders=0 then 'UNKNOWN' when v_cost_state='PARTIAL' or coalesce(v_quality#>>'{business_outcomes,orders,measurement_state}','UNKNOWN')<>'COMPLETE' then 'PARTIAL' else 'COMPLETE' end,'confirmed AI cost + real orders','Period/scope AI spend divided by real orders; causal conversation attribution is not assumed.','cost / orders'),
    'cost_per_completed_order_aed',dabbir_private.owner_metric_v1(case when v_completed_orders=0 then null else to_jsonb(round(v_cost/v_completed_orders,6)) end,case when v_completed_orders=0 then 'UNKNOWN' when v_cost_state='PARTIAL' or coalesce(v_quality#>>'{business_outcomes,completed_orders,measurement_state}','UNKNOWN')<>'COMPLETE' then 'PARTIAL' else 'COMPLETE' end,'confirmed AI cost + completed real orders','Period/scope AI spend divided by completed real orders.','cost / completed orders'),
    'cost_per_paid_outcome_aed',dabbir_private.owner_metric_v1(case when v_paid_bookings+v_paid_orders=0 then null else to_jsonb(round(v_cost/(v_paid_bookings+v_paid_orders),6)) end,case when v_paid_bookings+v_paid_orders=0 then 'UNKNOWN' else 'PARTIAL' end,'confirmed AI cost + paid booking/order ledgers','AI spend divided by observed paid outcomes. Cross-journey deduplication is not yet authoritative.','PARTIAL cost / observed paid outcomes'),
    'cost_per_converted_customer_aed',dabbir_private.owner_metric_v1(case when v_converted_customers=0 then null else to_jsonb(round(v_cost/v_converted_customers,6)) end,case when v_converted_customers=0 then 'UNKNOWN' when v_cost_state='PARTIAL' or v_success_state='PARTIAL' then 'PARTIAL' else 'COMPLETE' end,'confirmed AI cost + successful booking customers','Confirmed AI spend divided by distinct customers with durable successful booking outcomes.','cost / converted customers'),
    'revenue',dabbir_private.owner_metric_v1(null,'UNKNOWN','activity-specific payment ledgers','Revenue is not inferred or merged across activity types in this measurement release.','REVENUE_NOT_AVAILABLE'),
    'cost_completeness',case when v_cost_state='COMPLETE' then 'COMPLETE_COST' when v_cost_state='PARTIAL' then 'PARTIAL_COST' else 'UNKNOWN' end
  );

  v_health:=jsonb_build_object(
    'overall',case when coalesce(v_usage->>'measurement_state','UNKNOWN')='COMPLETE' and coalesce(v_quality->>'measurement_state','UNKNOWN')='COMPLETE' and coalesce(v_funnel->>'measurement_state','UNKNOWN')='COMPLETE' then 'COMPLETE' else 'PARTIAL' end,
    'usage_cost',coalesce(v_usage->>'measurement_state','UNKNOWN'),
    'quality',coalesce(v_quality->>'measurement_state','UNKNOWN'),
    'funnel',coalesce(v_funnel->>'measurement_state','UNKNOWN'),
    'attribution',coalesce(v_quality#>>'{measurement_health,attribution}','UNKNOWN'),
    'truth_rule','UNKNOWN/PARTIAL/NOT_MEASURED are preserved; absence of evidence is never rendered as zero.'
  );

  return jsonb_build_object(
    'version',1,'generated_at',now(),
    'window',jsonb_build_object('start',v_start,'end',v_end,'previous_start',v_prev_start,'previous_end',v_start),
    'filters',jsonb_build_object('business_id',p_business_id,'branch_id',p_branch_id,'activity_type',v_activity,'channel',p_channel,'provider',p_provider,'model',p_model),
    'summary',v_summary,
    'ai_usage',v_usage,
    'conversation_intelligence',v_quality->'conversation_intelligence',
    'quality',v_quality->'quality',
    'business_outcomes',v_quality->'business_outcomes',
    'funnels',v_funnel->'funnels',
    'unit_costs',v_unit_costs,
    'trends',v_trends,
    'regression_warnings',v_warnings,
    'measurement_health',v_health
  );
end;
$$;
revoke all on function public.dabbir_owner_measurement_snapshot_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_owner_measurement_snapshot_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text,text) to service_role;
comment on function public.dabbir_owner_measurement_snapshot_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text,text) is 'Canonical owner executive measurement snapshot combining usage, cognitive quality, business outcomes, cohort funnels, unit economics, trends, regression detection and explicit measurement health.';
