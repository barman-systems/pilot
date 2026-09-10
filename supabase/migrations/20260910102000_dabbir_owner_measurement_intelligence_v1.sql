-- DABBIR Owner Measurement Intelligence V1
-- Additive, fail-closed measurement layer. No business mutation authority changes.
-- Missing telemetry remains UNKNOWN / PARTIAL / NOT_MEASURED; absence is never converted to a false zero.

alter table public.dabbir_operation_outcomes add column if not exists conversation_id uuid;
alter table public.dabbir_operation_outcomes add column if not exists customer_id uuid;
alter table public.dabbir_operation_outcomes add column if not exists branch_id uuid;

create index if not exists dabbir_operation_outcomes_ai_time_idx
  on public.dabbir_operation_outcomes (business_id, completed_at desc)
  where source in ('ai_usage_meter','ai_gateway_billing_reconciliation');
create index if not exists dabbir_operation_outcomes_ai_conversation_idx
  on public.dabbir_operation_outcomes (business_id, conversation_id, completed_at desc)
  where source='ai_usage_meter' and conversation_id is not null;
create index if not exists dabbir_operation_outcomes_ai_branch_idx
  on public.dabbir_operation_outcomes (business_id, branch_id, completed_at desc)
  where source='ai_usage_meter' and branch_id is not null;
create index if not exists dabbir_operation_outcomes_ai_customer_idx
  on public.dabbir_operation_outcomes (business_id, customer_id, completed_at desc)
  where source='ai_usage_meter' and customer_id is not null;
create index if not exists dabbir_ai_understanding_events_business_time_idx
  on public.dabbir_ai_understanding_events (business_id, created_at desc);
create index if not exists dabbir_handoffs_business_time_idx
  on public.dabbir_handoffs (business_id, created_at desc);
create index if not exists dabbir_messages_business_time_idx
  on public.dabbir_messages (business_id, created_at desc);

create or replace function public.dabbir_record_ai_usage_v2(
  p_business_id uuid,
  p_operation_key text,
  p_operation_type text,
  p_channel text,
  p_provider text,
  p_model text,
  p_cost_mode text,
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_reasoning_tokens bigint default 0,
  p_request_count integer default 1,
  p_actual_cost_microusd bigint default null,
  p_cost_source text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_conversation_id uuid default null,
  p_customer_id uuid default null,
  p_branch_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare
  v_result jsonb;
  v_conversation public.dabbir_conversations%rowtype;
begin
  if p_business_id is null then raise exception 'AI_USAGE_BUSINESS_REQUIRED'; end if;
  if p_conversation_id is not null then
    select * into v_conversation from public.dabbir_conversations c
      where c.id=p_conversation_id and c.business_id=p_business_id;
    if not found then raise exception 'AI_USAGE_CONVERSATION_SCOPE_INVALID'; end if;
    if p_customer_id is not null and v_conversation.customer_id is distinct from p_customer_id then
      raise exception 'AI_USAGE_CUSTOMER_SCOPE_INVALID';
    end if;
    if p_branch_id is not null and v_conversation.branch_id is not null and v_conversation.branch_id is distinct from p_branch_id then
      raise exception 'AI_USAGE_BRANCH_SCOPE_INVALID';
    end if;
  end if;
  if p_customer_id is not null and not exists(
    select 1 from public.dabbir_customers c where c.id=p_customer_id and c.business_id=p_business_id
  ) then raise exception 'AI_USAGE_CUSTOMER_SCOPE_INVALID'; end if;
  if p_branch_id is not null and not exists(
    select 1 from public.dabbir_business_branches b where b.id=p_branch_id and b.business_id=p_business_id
  ) then raise exception 'AI_USAGE_BRANCH_SCOPE_INVALID'; end if;

  v_result:=public.dabbir_record_ai_usage_v1(
    p_business_id,p_operation_key,p_operation_type,p_channel,p_provider,p_model,p_cost_mode,
    p_input_tokens,p_output_tokens,p_reasoning_tokens,p_request_count,p_actual_cost_microusd,p_cost_source,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object(
      'attribution_version',2,
      'conversation_attributed',p_conversation_id is not null,
      'customer_attributed',p_customer_id is not null,
      'branch_attributed',p_branch_id is not null
    )
  );
  update public.dabbir_operation_outcomes o set
    conversation_id=coalesce(o.conversation_id,p_conversation_id),
    customer_id=coalesce(o.customer_id,p_customer_id),
    branch_id=coalesce(o.branch_id,p_branch_id)
  where o.business_id=p_business_id and o.operation_key=p_operation_key and o.source='ai_usage_meter';

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'attribution_version',2,
    'conversation_id',p_conversation_id,
    'customer_id',p_customer_id,
    'branch_id',p_branch_id
  );
end;
$$;
revoke all on function public.dabbir_record_ai_usage_v2(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,bigint,text,jsonb,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_record_ai_usage_v2(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,bigint,text,jsonb,uuid,uuid,uuid) to service_role;
comment on function public.dabbir_record_ai_usage_v2(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,bigint,text,jsonb,uuid,uuid,uuid) is
  'Idempotent AI usage metering with tenant-validated conversation/customer/branch attribution. Monetary cost is never estimated.';

create or replace function dabbir_private.owner_metric_v1(
  p_value jsonb,p_state text,p_source text,p_definition text,p_aggregation text
) returns jsonb
language sql immutable
set search_path='pg_catalog'
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
set search_path='pg_catalog','public'
as $$
  select b.id
  from public.dabbir_businesses b
  where
    upper(coalesce(p_scope->>'authority_role',''))='ROOT_OWNER'
    or (
      upper(coalesce(p_scope->>'authority_role',''))='OWNER_DELEGATE'
      and case upper(coalesce(p_scope#>>'{access_scope,type}',''))
        when 'ALL_BUSINESSES' then true
        when 'SPECIFIC_BUSINESS' then b.id::text=coalesce(p_scope#>>'{access_scope,business_id}','')
        when 'ASSIGNED_BUSINESSES_ONLY' then exists(
          select 1 from jsonb_array_elements_text(coalesce(p_scope#>'{access_scope,business_ids}','[]'::jsonb)) x(v)
          where x.v=b.id::text
        )
        when 'SPECIFIC_REGION' then upper(coalesce(b.country_code,''))=upper(coalesce(p_scope#>>'{access_scope,region_code}',''))
        else false
      end
    )
$$;
revoke all on function dabbir_private.owner_scope_businesses_v1(jsonb) from public,anon,authenticated;
grant execute on function dabbir_private.owner_scope_businesses_v1(jsonb) to service_role;

create or replace function public.dabbir_owner_measurement_snapshot_v1(
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
set search_path='pg_catalog','public'
as $$
declare
  v_now timestamptz:=now();
  v_start timestamptz:=p_start;
  v_end timestamptz:=least(coalesce(p_end,now()),now()+interval '5 minutes');
  v_prev_start timestamptz;
  v_duration interval;
  v_role text:=upper(coalesce(p_scope->>'authority_role',''));
  v_channel text:=nullif(lower(trim(coalesce(p_channel,''))),'');
  v_provider text:=nullif(lower(trim(coalesce(p_provider,''))),'');
  v_model text:=nullif(trim(coalesce(p_model,'')),'');
  v_conv bigint:=0; v_messages bigint:=0; v_customer_messages bigint:=0; v_ai_messages bigint:=0; v_human_messages bigint:=0;
  v_ai_only bigint:=0; v_human_required bigint:=0; v_handoff bigint:=0; v_clarifications bigint:=0; v_repeated_questions bigint:=0;
  v_requirement_failures bigint:=0; v_repeated_requirement_failures bigint:=0; v_fallbacks bigint:=0; v_provider_failures bigint:=0;
  v_brain_failures bigint:=0; v_tool_actions bigint:=0; v_tool_success bigint:=0; v_unresolved_refs bigint:=0; v_low_confidence bigint:=0;
  v_success bigint:=0; v_autonomous_success bigint:=0; v_recovered bigint:=0; v_completed_journeys bigint:=0;
  v_ai_requests bigint:=0; v_input_tokens bigint:=0; v_output_tokens bigint:=0; v_reasoning_tokens bigint:=0; v_unpriced bigint:=0;
  v_known_cost_microusd bigint:=0; v_known_cost_usd numeric:=0; v_known_cost_aed numeric:=0;
  v_booking_count bigint:=0; v_completed_booking_count bigint:=0; v_paid_booking_count bigint:=0; v_order_count bigint:=0; v_completed_order_count bigint:=0; v_paid_order_count bigint:=0;
  v_converted_customers bigint:=0;
  v_avg_turns_success numeric; v_avg_turns_handoff numeric;
  v_cost_state text; v_understanding_state text; v_operator_state text; v_funnel_state text; v_attribution_state text;
  v_cost_started constant timestamptz:='2026-09-07 13:38:11+00';
  v_operator_started constant timestamptz:='2026-09-07 19:04:20+00';
  v_funnel_started constant timestamptz:='2026-09-07 19:22:29+00';
  v_understanding_started constant timestamptz:='2026-09-08 02:59:20+00';
  v_has_usage boolean:=false; v_has_understanding boolean:=false; v_has_operator boolean:=false; v_has_funnel boolean:=false;
  v_attr_missing boolean:=false;
  v_breakdowns jsonb:='{}'::jsonb; v_funnels jsonb:='[]'::jsonb; v_trends jsonb:='{}'::jsonb; v_warnings jsonb:='[]'::jsonb;
  v_prev_conv bigint:=0; v_prev_success bigint:=0; v_prev_human_required bigint:=0; v_prev_repeated bigint:=0; v_prev_reqfail bigint:=0; v_prev_provider_fail bigint:=0;
  v_prev_ai_requests bigint:=0; v_prev_cost_micro bigint:=0;
  v_current_conversion numeric; v_prev_conversion numeric; v_current_autonomy numeric; v_prev_autonomy numeric; v_current_handoff_rate numeric; v_prev_handoff_rate numeric;
  v_sample_ok boolean:=false;
  v_critical_failures bigint:=0;
begin
  if v_role not in ('ROOT_OWNER','OWNER_DELEGATE') then raise exception 'OWNER_MEASUREMENT_AUTHORITY_REQUIRED'; end if;
  if v_start is null or p_end is null or v_end<=v_start then raise exception 'OWNER_MEASUREMENT_WINDOW_INVALID'; end if;
  if v_end-v_start>interval '366 days' then raise exception 'OWNER_MEASUREMENT_WINDOW_TOO_LARGE'; end if;
  if p_business_id is not null and not exists(select 1 from dabbir_private.owner_scope_businesses_v1(p_scope) s where s.business_id=p_business_id) then
    raise exception 'OWNER_MEASUREMENT_BUSINESS_SCOPE_DENIED';
  end if;
  if p_branch_id is not null and not exists(
    select 1 from public.dabbir_business_branches br
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=br.business_id
    where br.id=p_branch_id and (p_business_id is null or br.business_id=p_business_id)
  ) then raise exception 'OWNER_MEASUREMENT_BRANCH_SCOPE_DENIED'; end if;
  if length(coalesce(v_channel,''))>80 or length(coalesce(v_provider,''))>120 or length(coalesce(v_model,''))>180 then
    raise exception 'OWNER_MEASUREMENT_FILTER_INVALID';
  end if;

  v_duration:=v_end-v_start; v_prev_start:=v_start-v_duration;

  -- Real conversation population. Provider/model filters can only select conversations with v2 attribution.
  with scoped as (
    select distinct c.id,c.business_id,c.customer_id,c.branch_id,c.channel_type
    from public.dabbir_conversations c
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id
    join public.dabbir_messages m on m.business_id=c.business_id and m.conversation_id=c.id
    where m.created_at>=v_start and m.created_at<v_end and coalesce(m.simulated,false)=false
      and (p_business_id is null or c.business_id=p_business_id)
      and (p_branch_id is null or c.branch_id=p_branch_id)
      and (v_channel is null or lower(c.channel_type)=v_channel)
      and ((v_provider is null and v_model is null) or exists(
        select 1 from public.dabbir_operation_outcomes u
        where u.business_id=c.business_id and u.conversation_id=c.id and u.source='ai_usage_meter'
          and u.completed_at>=v_start and u.completed_at<v_end
          and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider)
          and (v_model is null or coalesce(u.ai_model,'')=v_model)
      ))
  )
  select count(*) into v_conv from scoped;

  select count(*) filter(where m.sender_type in ('customer','ai','human')),
         count(*) filter(where m.sender_type='customer'),count(*) filter(where m.sender_type='ai'),count(*) filter(where m.sender_type='human')
  into v_messages,v_customer_messages,v_ai_messages,v_human_messages
  from public.dabbir_messages m
  join public.dabbir_conversations c on c.id=m.conversation_id and c.business_id=m.business_id
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=m.business_id
  where m.created_at>=v_start and m.created_at<v_end and coalesce(m.simulated,false)=false
    and (p_business_id is null or m.business_id=p_business_id)
    and (p_branch_id is null or c.branch_id=p_branch_id)
    and (v_channel is null or lower(c.channel_type)=v_channel)
    and ((v_provider is null and v_model is null) or exists(
      select 1 from public.dabbir_operation_outcomes u where u.business_id=c.business_id and u.conversation_id=c.id and u.source='ai_usage_meter'
        and u.completed_at>=v_start and u.completed_at<v_end
        and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider)
        and (v_model is null or coalesce(u.ai_model,'')=v_model)
    ));

  with scoped_conv as (
    select distinct c.id,c.business_id
    from public.dabbir_conversations c
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id
    join public.dabbir_messages m on m.business_id=c.business_id and m.conversation_id=c.id
    where m.created_at>=v_start and m.created_at<v_end and coalesce(m.simulated,false)=false
      and (p_business_id is null or c.business_id=p_business_id)
      and (p_branch_id is null or c.branch_id=p_branch_id)
      and (v_channel is null or lower(c.channel_type)=v_channel)
      and ((v_provider is null and v_model is null) or exists(select 1 from public.dabbir_operation_outcomes u where u.business_id=c.business_id and u.conversation_id=c.id and u.source='ai_usage_meter' and u.completed_at>=v_start and u.completed_at<v_end and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider) and (v_model is null or coalesce(u.ai_model,'')=v_model)))
  )
  select count(*) into v_ai_only from scoped_conv sc
  where exists(select 1 from public.dabbir_messages m where m.business_id=sc.business_id and m.conversation_id=sc.id and m.created_at>=v_start and m.created_at<v_end and m.sender_type='ai' and coalesce(m.simulated,false)=false)
    and not exists(select 1 from public.dabbir_messages m where m.business_id=sc.business_id and m.conversation_id=sc.id and m.created_at>=v_start and m.created_at<v_end and m.sender_type='human' and coalesce(m.simulated,false)=false)
    and not exists(select 1 from public.dabbir_handoffs h where h.business_id=sc.business_id and h.conversation_id=sc.id and h.created_at>=v_start and h.created_at<v_end);

  -- Human-required is deduped by batch source id, not raw event rows.
  select count(distinct e.source_id) into v_human_required
  from public.dabbir_ai_operator_events e
  join public.dabbir_conversations c on c.id=e.conversation_id and c.business_id=e.business_id
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=e.business_id
  where e.event_type='human_required' and e.status='HUMAN_REQUIRED' and e.occurred_at>=v_start and e.occurred_at<v_end
    and (p_business_id is null or e.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id)
    and (v_channel is null or lower(c.channel_type)=v_channel);
  select count(*) into v_handoff from public.dabbir_handoffs h
  join public.dabbir_conversations c on c.id=h.conversation_id and c.business_id=h.business_id
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=h.business_id
  where h.created_at>=v_start and h.created_at<v_end and (p_business_id is null or h.business_id=p_business_id)
    and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel);

  -- Understanding events are one durable UNDERSTOOD record per interpreted turn. Invalid numeric JSON is ignored rather than guessed.
  select
    coalesce(sum(case when coalesce(e.metrics->>'clarification_count','') ~ '^[0-9]+$' then (e.metrics->>'clarification_count')::bigint else 0 end),0),
    count(*) filter(where e.metrics->'quality_violations' ? 'ASKED_CONFIRMED_FACT'),
    count(*) filter(where coalesce(e.metrics->>'unresolved_count','') ~ '^[0-9]+$' and (e.metrics->>'unresolved_count')::bigint>0),
    count(*) filter(where coalesce(e.metrics->>'operational_confidence','') ~ '^[0-9]+([.][0-9]+)?$' and (e.metrics->>'operational_confidence')::numeric<0.65),
    count(*) filter(where nullif(e.metrics->>'planner_failure_code','') is not null)
  into v_clarifications,v_repeated_questions,v_unresolved_refs,v_low_confidence,v_brain_failures
  from public.dabbir_ai_understanding_events e
  join public.dabbir_conversations c on c.id=e.conversation_id and c.business_id=e.business_id
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=e.business_id
  where e.event_type='UNDERSTOOD' and e.created_at>=v_start and e.created_at<v_end
    and (p_business_id is null or e.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id)
    and (v_channel is null or lower(c.channel_type)=v_channel);

  select count(*) filter(where upper(coalesce(h.reason,'')) like '%REQUIREMENT%FAIL%'),
         count(*) filter(where upper(coalesce(h.reason,''))='REPEATED_REQUIREMENT_EXTRACTION_FAILURE')
  into v_requirement_failures,v_repeated_requirement_failures
  from public.dabbir_handoffs h
  join public.dabbir_conversations c on c.id=h.conversation_id and c.business_id=h.business_id
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=h.business_id
  where h.created_at>=v_start and h.created_at<v_end and (p_business_id is null or h.business_id=p_business_id)
    and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel);

  -- Successful fallback: more than one actual provider attempt before a successful metered response.
  select count(*) into v_fallbacks
  from public.dabbir_operation_outcomes u
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=u.business_id
  where u.source='ai_usage_meter' and u.completed_at>=v_start and u.completed_at<v_end
    and jsonb_typeof(u.metadata->'attempts')='array' and jsonb_array_length(u.metadata->'attempts')>1
    and (p_business_id is null or u.business_id=p_business_id)
    and (p_branch_id is null or u.branch_id=p_branch_id)
    and (v_channel is null or lower(coalesce(u.ai_channel,''))=v_channel)
    and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider)
    and (v_model is null or coalesce(u.ai_model,'')=v_model);

  -- Explicit operational AI failures; this is intentionally not inferred from missing responses.
  select count(*) into v_provider_failures
  from public.dabbir_operation_outcomes o
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id
  where o.operation_type='operator.ai_planning' and o.outcome<>'VERIFIED_SUCCESS' and o.created_at>=v_start and o.created_at<v_end
    and (p_business_id is null or o.business_id=p_business_id);

  select count(*),count(*) filter(where coalesce((l.result->>'verified')::boolean,false)=true)
  into v_tool_actions,v_tool_success
  from public.dabbir_ai_action_ledger l
  join public.dabbir_conversations c on c.id=l.conversation_id and c.business_id=l.business_id
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=l.business_id
  where l.created_at>=v_start and l.created_at<v_end and (p_business_id is null or l.business_id=p_business_id)
    and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel);

  -- Outcome-grounded success: durable verified external outcome or committed booking/order business result. DISTINCT prevents double counting stages.
  with success_conv as (
    select co.business_id,co.conversation_id,co.customer_id,min(co.created_at) success_at
    from public.dabbir_conversation_outcomes co
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=co.business_id
    join public.dabbir_conversations c on c.id=co.conversation_id and c.business_id=co.business_id
    where co.verified_external_result=true and co.created_at>=v_start and co.created_at<v_end
      and (p_business_id is null or co.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
    group by co.business_id,co.conversation_id,co.customer_id
    union
    select f.business_id,f.conversation_id,f.customer_id,min(f.occurred_at)
    from public.dabbir_ai_booking_funnel_events f
    join public.dabbir_conversations c on c.id=f.conversation_id and c.business_id=f.business_id
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
    where f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED') and f.stage in ('CONFIRMED','COMPLETED','PAYMENT_RECORDED')
      and f.occurred_at>=v_start and f.occurred_at<v_end and (p_business_id is null or f.business_id=p_business_id)
      and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
    group by f.business_id,f.conversation_id,f.customer_id
  ), dedup as (select business_id,conversation_id,max(customer_id) customer_id,min(success_at) success_at from success_conv group by business_id,conversation_id)
  select count(*),count(distinct customer_id) into v_success,v_converted_customers from dedup;

  with success_conv as (
    select f.business_id,f.conversation_id,min(f.occurred_at) success_at
    from public.dabbir_ai_booking_funnel_events f
    join public.dabbir_conversations c on c.id=f.conversation_id and c.business_id=f.business_id
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
    where f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED') and f.stage in ('CONFIRMED','COMPLETED','PAYMENT_RECORDED')
      and f.occurred_at>=v_start and f.occurred_at<v_end and (p_business_id is null or f.business_id=p_business_id)
      and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
    group by f.business_id,f.conversation_id
  )
  select count(*) into v_autonomous_success from success_conv sc
  where not exists(select 1 from public.dabbir_handoffs h where h.business_id=sc.business_id and h.conversation_id=sc.conversation_id and h.created_at<=sc.success_at)
    and not exists(select 1 from public.dabbir_messages m where m.business_id=sc.business_id and m.conversation_id=sc.conversation_id and m.sender_type='human' and m.created_at<=sc.success_at and coalesce(m.simulated,false)=false);

  select count(distinct h.conversation_id) into v_recovered
  from public.dabbir_handoffs h
  join public.dabbir_conversations c on c.id=h.conversation_id and c.business_id=h.business_id
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=h.business_id
  where h.returned_to_ai_at is not null and h.returned_to_ai_at>=v_start and h.returned_to_ai_at<v_end
    and exists(select 1 from public.dabbir_ai_operator_events e where e.business_id=h.business_id and e.conversation_id=h.conversation_id and e.event_type='batch_processed' and e.occurred_at>h.returned_to_ai_at)
    and (p_business_id is null or h.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel);

  select count(distinct f.conversation_id) into v_completed_journeys
  from public.dabbir_ai_booking_funnel_events f
  join public.dabbir_conversations c on c.id=f.conversation_id and c.business_id=f.business_id
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
  where f.stage in ('COMPLETED','PAYMENT_RECORDED') and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED')
    and f.occurred_at>=v_start and f.occurred_at<v_end and (p_business_id is null or f.business_id=p_business_id)
    and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel);

  -- Usage/tokens come only from per-operation meters. Reconciliation rows never inflate request counts.
  select count(*)>0,coalesce(sum(coalesce(u.ai_request_count,0)),0),coalesce(sum(coalesce(u.ai_input_tokens,0)),0),
         coalesce(sum(coalesce(u.ai_output_tokens,0)),0),coalesce(sum(coalesce(u.ai_reasoning_tokens,0)),0)
  into v_has_usage,v_ai_requests,v_input_tokens,v_output_tokens,v_reasoning_tokens
  from public.dabbir_operation_outcomes u
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=u.business_id
  where u.source='ai_usage_meter' and u.completed_at>=v_start and u.completed_at<v_end
    and (p_business_id is null or u.business_id=p_business_id)
    and (p_branch_id is null or u.branch_id=p_branch_id)
    and (v_channel is null or lower(coalesce(u.ai_channel,''))=v_channel)
    and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider)
    and (v_model is null or coalesce(u.ai_model,'')=v_model);

  -- Cost authority: direct/response costs plus gateway reconciliations. Gateway response cost is excluded when a covering reconciliation exists.
  with usage as (
    select u.* from public.dabbir_operation_outcomes u
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=u.business_id
    where u.source='ai_usage_meter' and u.completed_at>=v_start and u.completed_at<v_end
      and (p_business_id is null or u.business_id=p_business_id)
      and (p_branch_id is null or u.branch_id=p_branch_id)
      and (v_channel is null or lower(coalesce(u.ai_channel,''))=v_channel)
      and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider)
      and (v_model is null or coalesce(u.ai_model,'')=v_model)
  ), rec as (
    select r.*,(r.metadata->>'period_start')::timestamptz rs,(r.metadata->>'period_end')::timestamptz re
    from public.dabbir_operation_outcomes r
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=r.business_id
    where r.source='ai_gateway_billing_reconciliation' and r.cost_microusd is not null
      and nullif(r.metadata->>'period_start','') is not null and nullif(r.metadata->>'period_end','') is not null
      and (p_business_id is null or r.business_id=p_business_id)
      and (v_channel is null or lower(coalesce(r.ai_channel,''))=v_channel)
      and (v_provider is null or v_provider='vercel-ai-gateway')
      and (v_model is null or coalesce(r.ai_model,'')=v_model)
  ), included_rec as (
    select * from rec where rs>=v_start and re<=v_end
  ), exact_cost as (
    select coalesce(sum(u.cost_microusd) filter(where u.cost_microusd is not null and (
      lower(coalesce(u.ai_provider,''))<>'vercel-ai-gateway' or not exists(
        select 1 from included_rec r where r.business_id=u.business_id and coalesce(r.ai_model,'')=coalesce(u.ai_model,'') and lower(coalesce(r.ai_channel,''))=lower(coalesce(u.ai_channel,'')) and u.completed_at>=r.rs and u.completed_at<r.re
      )
    )),0)::bigint c from usage u
  ), rec_cost as (select coalesce(sum(cost_microusd),0)::bigint c from included_rec), missing as (
    select count(*)::bigint n from usage u where u.cost_microusd is null and not exists(
      select 1 from included_rec r where r.business_id=u.business_id and coalesce(r.ai_model,'')=coalesce(u.ai_model,'') and lower(coalesce(r.ai_channel,''))=lower(coalesce(u.ai_channel,'')) and u.completed_at>=r.rs and u.completed_at<r.re
    )
  )
  select exact_cost.c+rec_cost.c,missing.n into v_known_cost_microusd,v_unpriced from exact_cost,rec_cost,missing;
  v_known_cost_usd:=round(v_known_cost_microusd::numeric/1000000,6); v_known_cost_aed:=round(v_known_cost_usd*3.6725,6);

  select exists(
    select 1 from public.dabbir_operation_outcomes u
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=u.business_id
    where u.source='ai_usage_meter' and u.completed_at>=v_start and u.completed_at<v_end
      and (p_business_id is null or u.business_id=p_business_id)
      and ((p_branch_id is not null and u.branch_id is null) or ((v_provider is not null or v_model is not null) and u.conversation_id is null))
  ) into v_attr_missing;

  v_cost_state:=case when not v_has_usage and v_start<v_cost_started then 'UNKNOWN' when v_unpriced>0 or v_start<v_cost_started or v_attr_missing then 'PARTIAL' else 'COMPLETE' end;
  select exists(select 1 from public.dabbir_ai_understanding_events e join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=e.business_id where e.created_at>=v_start and e.created_at<v_end and (p_business_id is null or e.business_id=p_business_id)) into v_has_understanding;
  select exists(select 1 from public.dabbir_ai_operator_events e join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=e.business_id where e.occurred_at>=v_start and e.occurred_at<v_end and (p_business_id is null or e.business_id=p_business_id)) into v_has_operator;
  select exists(select 1 from public.dabbir_ai_booking_funnel_events e join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=e.business_id where e.occurred_at>=v_start and e.occurred_at<v_end and (p_business_id is null or e.business_id=p_business_id)) into v_has_funnel;
  v_understanding_state:=case when not v_has_understanding and v_start<v_understanding_started then 'UNKNOWN' when v_start<v_understanding_started then 'PARTIAL' else 'COMPLETE' end;
  v_operator_state:=case when not v_has_operator and v_start<v_operator_started then 'UNKNOWN' when v_start<v_operator_started then 'PARTIAL' else 'COMPLETE' end;
  v_funnel_state:=case when not v_has_funnel and v_start<v_funnel_started then 'UNKNOWN' when v_start<v_funnel_started then 'PARTIAL' else 'COMPLETE' end;
  v_attribution_state:=case when v_attr_missing then 'PARTIAL' else 'COMPLETE' end;

  select count(distinct f.conversation_id) filter(where f.stage in ('BOOKED','CONFIRMED')),
         count(distinct f.conversation_id) filter(where f.stage='COMPLETED'),
         count(distinct f.conversation_id) filter(where f.stage='PAYMENT_RECORDED')
  into v_booking_count,v_completed_booking_count,v_paid_booking_count
  from public.dabbir_ai_booking_funnel_events f
  join public.dabbir_conversations c on c.id=f.conversation_id and c.business_id=f.business_id
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
  where f.occurred_at>=v_start and f.occurred_at<v_end and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED')
    and (p_business_id is null or f.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel);

  select count(*),count(*) filter(where lower(coalesce(o.status,o.workflow_status,'')) in ('completed','fulfilled','delivered')),
         count(*) filter(where coalesce(o.paid_amount,o.paid_aed,0)>0)
  into v_order_count,v_completed_order_count,v_paid_order_count
  from public.dabbir_orders o join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id
  where o.created_at>=v_start and o.created_at<v_end and coalesce(o.simulated,false)=false
    and (p_business_id is null or o.business_id=p_business_id) and (p_branch_id is null or o.branch_id=p_branch_id)
    and v_channel is null and v_provider is null and v_model is null;

  -- Turns are real customer+AI/human messages, never raw event counts.
  with success_conv as (
    select distinct f.business_id,f.conversation_id,min(f.occurred_at) over(partition by f.business_id,f.conversation_id) success_at
    from public.dabbir_ai_booking_funnel_events f
    join public.dabbir_conversations c on c.id=f.conversation_id and c.business_id=f.business_id
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
    where f.stage in ('CONFIRMED','COMPLETED','PAYMENT_RECORDED') and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED')
      and f.occurred_at>=v_start and f.occurred_at<v_end and (p_business_id is null or f.business_id=p_business_id)
      and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
  ), turns as (
    select sc.business_id,sc.conversation_id,count(m.id)::numeric n from success_conv sc join public.dabbir_messages m on m.business_id=sc.business_id and m.conversation_id=sc.conversation_id and m.created_at<=sc.success_at and coalesce(m.simulated,false)=false and m.sender_type in ('customer','ai','human') group by sc.business_id,sc.conversation_id
  ) select round(avg(n),2) into v_avg_turns_success from turns;

  with first_handoff as (
    select h.business_id,h.conversation_id,min(h.created_at) handoff_at from public.dabbir_handoffs h
    join public.dabbir_conversations c on c.id=h.conversation_id and c.business_id=h.business_id
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=h.business_id
    where h.created_at>=v_start and h.created_at<v_end and (p_business_id is null or h.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
    group by h.business_id,h.conversation_id
  ), turns as (
    select fh.business_id,fh.conversation_id,count(m.id)::numeric n from first_handoff fh join public.dabbir_messages m on m.business_id=fh.business_id and m.conversation_id=fh.conversation_id and m.created_at<=fh.handoff_at and coalesce(m.simulated,false)=false and m.sender_type in ('customer','ai','human') group by fh.business_id,fh.conversation_id
  ) select round(avg(n),2) into v_avg_turns_handoff from turns;

  -- Breakdowns are database-side. Unknown branch attribution remains an explicit bucket.
  select jsonb_build_object(
    'business',coalesce((select jsonb_agg(x order by x.known_cost_aed desc,x.ai_requests desc) from (
      select u.business_id,b.name,b.business_type,count(*)::bigint metered_operations,coalesce(sum(u.ai_request_count),0)::bigint ai_requests,
        coalesce(sum(u.ai_input_tokens+u.ai_output_tokens+u.ai_reasoning_tokens),0)::bigint total_tokens,
        round(coalesce(sum(u.cost_microusd),0)::numeric/1000000*3.6725,6) known_cost_aed,
        count(*) filter(where u.cost_microusd is null)::bigint unpriced_operations
      from public.dabbir_operation_outcomes u join public.dabbir_businesses b on b.id=u.business_id join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=u.business_id
      where u.source='ai_usage_meter' and u.completed_at>=v_start and u.completed_at<v_end and (p_business_id is null or u.business_id=p_business_id)
        and (p_branch_id is null or u.branch_id=p_branch_id) and (v_channel is null or lower(coalesce(u.ai_channel,''))=v_channel) and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider) and (v_model is null or coalesce(u.ai_model,'')=v_model)
      group by u.business_id,b.name,b.business_type
    ) x),'[]'::jsonb),
    'branch',coalesce((select jsonb_agg(x order by x.ai_requests desc) from (
      select u.branch_id,coalesce(br.name,'UNKNOWN_ATTRIBUTION') name,count(*)::bigint metered_operations,coalesce(sum(u.ai_request_count),0)::bigint ai_requests,
        coalesce(sum(u.ai_input_tokens+u.ai_output_tokens+u.ai_reasoning_tokens),0)::bigint total_tokens,round(coalesce(sum(u.cost_microusd),0)::numeric/1000000*3.6725,6) known_cost_aed,
        count(*) filter(where u.cost_microusd is null)::bigint unpriced_operations,case when u.branch_id is null then 'PARTIAL' else 'COMPLETE' end measurement_state
      from public.dabbir_operation_outcomes u left join public.dabbir_business_branches br on br.id=u.branch_id and br.business_id=u.business_id join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=u.business_id
      where u.source='ai_usage_meter' and u.completed_at>=v_start and u.completed_at<v_end and (p_business_id is null or u.business_id=p_business_id)
        and (p_branch_id is null or u.branch_id=p_branch_id) and (v_channel is null or lower(coalesce(u.ai_channel,''))=v_channel) and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider) and (v_model is null or coalesce(u.ai_model,'')=v_model)
      group by u.branch_id,br.name
    ) x),'[]'::jsonb),
    'channel',coalesce((select jsonb_agg(x order by x.ai_requests desc) from (
      select coalesce(u.ai_channel,'unknown') channel,count(*)::bigint metered_operations,coalesce(sum(u.ai_request_count),0)::bigint ai_requests,coalesce(sum(u.ai_input_tokens+u.ai_output_tokens+u.ai_reasoning_tokens),0)::bigint total_tokens,round(coalesce(sum(u.cost_microusd),0)::numeric/1000000*3.6725,6) known_cost_aed,count(*) filter(where u.cost_microusd is null)::bigint unpriced_operations from public.dabbir_operation_outcomes u join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=u.business_id where u.source='ai_usage_meter' and u.completed_at>=v_start and u.completed_at<v_end and (p_business_id is null or u.business_id=p_business_id) and (p_branch_id is null or u.branch_id=p_branch_id) and (v_channel is null or lower(coalesce(u.ai_channel,''))=v_channel) and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider) and (v_model is null or coalesce(u.ai_model,'')=v_model) group by u.ai_channel
    ) x),'[]'::jsonb),
    'provider_model',coalesce((select jsonb_agg(x order by x.ai_requests desc) from (
      select coalesce(u.ai_provider,'unknown') provider,coalesce(u.ai_model,'unknown') model,
        case when lower(coalesce(u.ai_provider,''))='vercel-ai-gateway' then 'GATEWAY' when upper(coalesce(u.ai_cost_mode,'')) like 'FREE%' then 'FREE' when upper(coalesce(u.ai_cost_mode,'')) like 'PAID%' then 'PAID' when upper(coalesce(u.ai_cost_mode,'')) like '%DIRECT%' then 'DIRECT' else 'UNKNOWN' end cost_mode,
        count(*)::bigint metered_operations,coalesce(sum(u.ai_request_count),0)::bigint ai_requests,coalesce(sum(u.ai_input_tokens+u.ai_output_tokens+u.ai_reasoning_tokens),0)::bigint total_tokens,round(coalesce(sum(u.cost_microusd),0)::numeric/1000000*3.6725,6) known_cost_aed,count(*) filter(where u.cost_microusd is null)::bigint unpriced_operations
      from public.dabbir_operation_outcomes u join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=u.business_id
      where u.source='ai_usage_meter' and u.completed_at>=v_start and u.completed_at<v_end and (p_business_id is null or u.business_id=p_business_id) and (p_branch_id is null or u.branch_id=p_branch_id) and (v_channel is null or lower(coalesce(u.ai_channel,''))=v_channel) and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider) and (v_model is null or coalesce(u.ai_model,'')=v_model)
      group by u.ai_provider,u.ai_model,u.ai_cost_mode
    ) x),'[]'::jsonb),
    'operation_type',coalesce((select jsonb_agg(x order by x.ai_requests desc) from (
      select u.operation_type,count(*)::bigint metered_operations,coalesce(sum(u.ai_request_count),0)::bigint ai_requests,coalesce(sum(u.ai_input_tokens+u.ai_output_tokens+u.ai_reasoning_tokens),0)::bigint total_tokens,round(coalesce(sum(u.cost_microusd),0)::numeric/1000000*3.6725,6) known_cost_aed,count(*) filter(where u.cost_microusd is null)::bigint unpriced_operations from public.dabbir_operation_outcomes u join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=u.business_id where u.source='ai_usage_meter' and u.completed_at>=v_start and u.completed_at<v_end and (p_business_id is null or u.business_id=p_business_id) and (p_branch_id is null or u.branch_id=p_branch_id) and (v_channel is null or lower(coalesce(u.ai_channel,''))=v_channel) and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider) and (v_model is null or coalesce(u.ai_model,'')=v_model) group by u.operation_type
    ) x),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(x order by x.day) from (
      select date_trunc('day',u.completed_at) day,coalesce(sum(u.ai_request_count),0)::bigint ai_requests,coalesce(sum(u.ai_input_tokens+u.ai_output_tokens+u.ai_reasoning_tokens),0)::bigint total_tokens,round(coalesce(sum(u.cost_microusd),0)::numeric/1000000*3.6725,6) known_cost_aed,count(*) filter(where u.cost_microusd is null)::bigint unpriced_operations from public.dabbir_operation_outcomes u join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=u.business_id where u.source='ai_usage_meter' and u.completed_at>=v_start and u.completed_at<v_end and (p_business_id is null or u.business_id=p_business_id) and (p_branch_id is null or u.branch_id=p_branch_id) and (v_channel is null or lower(coalesce(u.ai_channel,''))=v_channel) and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider) and (v_model is null or coalesce(u.ai_model,'')=v_model) group by date_trunc('day',u.completed_at)
    ) x),'[]'::jsonb)
  ) into v_breakdowns;

  -- Activity-aware booking funnel. Unsupported stages are explicit NOT_MEASURED, never zero.
  select coalesce(jsonb_agg(j order by activity_type),'[]'::jsonb) into v_funnels from (
    select b.business_type activity_type,
      jsonb_build_array(
        jsonb_build_object('stage','INQUIRY','measurement_state','COMPLETE','count',count(distinct c.id)),
        jsonb_build_object('stage','QUALIFIED','measurement_state',v_funnel_state,'count',count(distinct f.conversation_id) filter(where f.stage='QUALIFIED')),
        case when b.business_type='car_wash' then jsonb_build_object('stage','OFFERED','measurement_state','NOT_MEASURED','count',null) else null end,
        jsonb_build_object('stage','CONFIRMED','measurement_state',v_funnel_state,'count',count(distinct f.conversation_id) filter(where f.stage='CONFIRMED')),
        case when b.business_type='car_wash' then jsonb_build_object('stage','ASSIGNED','measurement_state',v_funnel_state,'count',count(distinct f.conversation_id) filter(where f.appointment_id is not null and exists(select 1 from public.dabbir_appointments a where a.id=f.appointment_id and a.business_id=f.business_id and a.worker_id is not null))) else null end,
        case when b.business_type='car_wash' then jsonb_build_object('stage','REMINDED','measurement_state','NOT_MEASURED','count',null) else null end,
        jsonb_build_object('stage','COMPLETED','measurement_state',v_funnel_state,'count',count(distinct f.conversation_id) filter(where f.stage='COMPLETED')),
        jsonb_build_object('stage','PAID','measurement_state',v_funnel_state,'count',count(distinct f.conversation_id) filter(where f.stage='PAYMENT_RECORDED'))
      ) stages,
      v_funnel_state measurement_state
    from public.dabbir_businesses b
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=b.id
    left join public.dabbir_conversations c on c.business_id=b.id and c.created_at<v_end and c.updated_at>=v_start and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
    left join public.dabbir_ai_booking_funnel_events f on f.business_id=b.id and f.conversation_id=c.id and f.occurred_at>=v_start and f.occurred_at<v_end
    where (p_business_id is null or b.id=p_business_id) and b.business_type in ('car_wash','salon','clinic','services','laundry','other')
      and v_provider is null and v_model is null
    group by b.business_type
  ) j;

  -- Previous-period values for trends. Direction is withheld until at least 20 conversations in both periods.
  with current_prev as (
    select count(distinct c.id)::bigint conv
    from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id join public.dabbir_messages m on m.business_id=c.business_id and m.conversation_id=c.id
    where m.created_at>=v_prev_start and m.created_at<v_start and coalesce(m.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
  ) select conv into v_prev_conv from current_prev;
  select count(distinct f.conversation_id) into v_prev_success from public.dabbir_ai_booking_funnel_events f join public.dabbir_conversations c on c.id=f.conversation_id and c.business_id=f.business_id join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id where f.stage in ('CONFIRMED','COMPLETED','PAYMENT_RECORDED') and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED') and f.occurred_at>=v_prev_start and f.occurred_at<v_start and (p_business_id is null or f.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel);
  select count(distinct e.source_id) into v_prev_human_required from public.dabbir_ai_operator_events e join public.dabbir_conversations c on c.id=e.conversation_id and c.business_id=e.business_id join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=e.business_id where e.event_type='human_required' and e.occurred_at>=v_prev_start and e.occurred_at<v_start and (p_business_id is null or e.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel);
  select count(*) filter(where e.metrics->'quality_violations' ? 'ASKED_CONFIRMED_FACT') into v_prev_repeated from public.dabbir_ai_understanding_events e join public.dabbir_conversations c on c.id=e.conversation_id and c.business_id=e.business_id join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=e.business_id where e.event_type='UNDERSTOOD' and e.created_at>=v_prev_start and e.created_at<v_start and (p_business_id is null or e.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel);
  select count(*) into v_prev_reqfail from public.dabbir_handoffs h join public.dabbir_conversations c on c.id=h.conversation_id and c.business_id=h.business_id join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=h.business_id where upper(coalesce(h.reason,'')) like '%REQUIREMENT%FAIL%' and h.created_at>=v_prev_start and h.created_at<v_start and (p_business_id is null or h.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel);
  select count(*) into v_prev_provider_fail from public.dabbir_operation_outcomes o join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id where o.operation_type='operator.ai_planning' and o.outcome<>'VERIFIED_SUCCESS' and o.created_at>=v_prev_start and o.created_at<v_start and (p_business_id is null or o.business_id=p_business_id);
  select coalesce(sum(u.ai_request_count),0),coalesce(sum(u.cost_microusd),0) into v_prev_ai_requests,v_prev_cost_micro from public.dabbir_operation_outcomes u join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=u.business_id where u.source='ai_usage_meter' and u.completed_at>=v_prev_start and u.completed_at<v_start and (p_business_id is null or u.business_id=p_business_id) and (p_branch_id is null or u.branch_id=p_branch_id) and (v_channel is null or lower(coalesce(u.ai_channel,''))=v_channel) and (v_provider is null or lower(coalesce(u.ai_provider,''))=v_provider) and (v_model is null or coalesce(u.ai_model,'')=v_model);

  v_sample_ok:=v_conv>=20 and v_prev_conv>=20;
  v_current_conversion:=case when v_conv>0 then v_success::numeric/v_conv else null end;
  v_prev_conversion:=case when v_prev_conv>0 then v_prev_success::numeric/v_prev_conv else null end;
  v_current_autonomy:=case when v_conv>0 then v_autonomous_success::numeric/v_conv else null end;
  v_current_handoff_rate:=case when v_conv>0 then v_human_required::numeric/v_conv else null end;
  v_prev_handoff_rate:=case when v_prev_conv>0 then v_prev_human_required::numeric/v_prev_conv else null end;
  v_trends:=jsonb_build_object(
    'sample_state',case when v_sample_ok then 'COMPLETE' else 'INSUFFICIENT_SAMPLE' end,
    'current_conversations',v_conv,'previous_conversations',v_prev_conv,
    'conversion',case when v_sample_ok and v_prev_conversion is not null then jsonb_build_object('current',round(v_current_conversion*100,2),'previous',round(v_prev_conversion*100,2),'direction',case when v_current_conversion>v_prev_conversion*1.05 then 'IMPROVING' when v_current_conversion<v_prev_conversion*0.95 then 'WORSENING' else 'STABLE' end) else jsonb_build_object('current',case when v_current_conversion is null then null else round(v_current_conversion*100,2) end,'previous',case when v_prev_conversion is null then null else round(v_prev_conversion*100,2) end,'direction','UNKNOWN') end,
    'human_required_rate',case when v_sample_ok and v_prev_handoff_rate is not null then jsonb_build_object('current',round(v_current_handoff_rate*100,2),'previous',round(v_prev_handoff_rate*100,2),'direction',case when v_current_handoff_rate<v_prev_handoff_rate*0.95 then 'IMPROVING' when v_current_handoff_rate>v_prev_handoff_rate*1.05 then 'WORSENING' else 'STABLE' end) else jsonb_build_object('current',case when v_current_handoff_rate is null then null else round(v_current_handoff_rate*100,2) end,'previous',case when v_prev_handoff_rate is null then null else round(v_prev_handoff_rate*100,2) end,'direction','UNKNOWN') end,
    'ai_requests',jsonb_build_object('current',v_ai_requests,'previous',v_prev_ai_requests,'direction',case when v_sample_ok then case when v_ai_requests>v_prev_ai_requests*1.05 then 'UP' when v_ai_requests<v_prev_ai_requests*0.95 then 'DOWN' else 'STABLE' end else 'UNKNOWN' end),
    'confirmed_cost_aed',jsonb_build_object('current',v_known_cost_aed,'previous',round(v_prev_cost_micro::numeric/1000000*3.6725,6),'direction',case when v_sample_ok and v_cost_state='COMPLETE' then case when v_known_cost_microusd>v_prev_cost_micro*1.05 then 'UP' when v_known_cost_microusd<v_prev_cost_micro*0.95 then 'DOWN' else 'STABLE' end else 'UNKNOWN' end)
  );

  if v_sample_ok and v_prev_handoff_rate is not null and v_current_handoff_rate>v_prev_handoff_rate*1.5 and v_current_handoff_rate-v_prev_handoff_rate>=0.10 then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','HUMAN_REQUIRED_REGRESSION','severity','WARNING')); end if;
  if v_sample_ok and v_prev_conversion is not null and v_prev_conversion-v_current_conversion>=0.10 and v_current_conversion<v_prev_conversion*0.70 then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','CONVERSION_REGRESSION','severity','WARNING')); end if;
  if v_sample_ok and v_repeated_questions>=5 and v_repeated_questions>greatest(v_prev_repeated*2,4) then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','REPEATED_QUESTION_REGRESSION','severity','WARNING')); end if;
  if v_sample_ok and v_requirement_failures>=5 and v_requirement_failures>greatest(v_prev_reqfail*2,4) then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','REQUIREMENT_FAILURE_REGRESSION','severity','WARNING')); end if;
  if v_sample_ok and v_provider_failures>=5 and v_provider_failures>greatest(v_prev_provider_fail*2,4) then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','PROVIDER_FAILURE_REGRESSION','severity','WARNING')); end if;
  v_critical_failures:=jsonb_array_length(v_warnings);

  return jsonb_build_object(
    'version',1,'generated_at',v_now,
    'window',jsonb_build_object('start',v_start,'end',v_end,'previous_start',v_prev_start,'timezone','UTC'),
    'scope',jsonb_build_object('business_id',p_business_id,'branch_id',p_branch_id,'channel',v_channel,'provider',v_provider,'model',v_model,'authority_role',v_role),
    'summary',jsonb_build_object(
      'conversations',dabbir_private.owner_metric_v1(to_jsonb(v_conv),'COMPLETE','dabbir_messages + dabbir_conversations','Distinct real conversations with at least one non-simulated message in the selected window.','COUNT DISTINCT conversation_id'),
      'autonomous_completion_rate',dabbir_private.owner_metric_v1(case when v_conv=0 then null else to_jsonb(round(v_autonomous_success::numeric/v_conv*100,2)) end,v_funnel_state,'dabbir_ai_booking_funnel_events + dabbir_handoffs + dabbir_messages','Outcome-grounded successful conversations completed without human message or handoff before the success.','autonomous successful conversations / real conversations * 100'),
      'successful_business_outcomes',dabbir_private.owner_metric_v1(to_jsonb(v_success),v_funnel_state,'dabbir_ai_booking_funnel_events + dabbir_conversation_outcomes','Distinct conversations with a committed booking success or externally verified durable outcome.','COUNT DISTINCT conversation_id'),
      'conversion_rate',dabbir_private.owner_metric_v1(case when v_conv=0 then null else to_jsonb(round(v_success::numeric/v_conv*100,2)) end,v_funnel_state,'durable conversation + outcome ledgers','Successful outcome conversations divided by real conversations.','successful outcomes / conversations * 100'),
      'confirmed_ai_spend_aed',dabbir_private.owner_metric_v1(to_jsonb(v_known_cost_aed),v_cost_state,'dabbir_operation_outcomes + gateway reconciliation','Provider/gateway-confirmed monetary cost only. Unpriced operations are never treated as zero.','non-overlapping confirmed microusd converted at AED 3.6725/USD'),
      'cost_per_success_aed',dabbir_private.owner_metric_v1(case when v_success=0 or v_cost_state='UNKNOWN' then null else to_jsonb(round(v_known_cost_aed/v_success,6)) end,case when v_success=0 then 'UNKNOWN' else v_cost_state end,'confirmed AI cost + durable outcomes','Confirmed AI spend in the selected scope divided by successful outcome conversations.','confirmed cost / successful outcomes'),
      'human_required_rate',dabbir_private.owner_metric_v1(case when v_conv=0 then null else to_jsonb(round(v_human_required::numeric/v_conv*100,2)) end,v_operator_state,'dabbir_ai_operator_events','Distinct message batches that entered HUMAN_REQUIRED divided by real conversations.','distinct HUMAN_REQUIRED batch source_id / conversations * 100'),
      'active_critical_failures',dabbir_private.owner_metric_v1(to_jsonb(v_critical_failures),case when v_sample_ok then 'COMPLETE' else 'INSUFFICIENT_SAMPLE' end,'period-over-period regression rules','Material regressions only; low-sample comparisons do not alert.','COUNT regression warnings')
    ),
    'ai_usage',jsonb_build_object(
      'requests',dabbir_private.owner_metric_v1(to_jsonb(v_ai_requests),v_cost_state,'dabbir_operation_outcomes source=ai_usage_meter','Actual provider attempts recorded by the AI meter.','SUM ai_request_count'),
      'input_tokens',dabbir_private.owner_metric_v1(to_jsonb(v_input_tokens),v_cost_state,'dabbir_operation_outcomes','Provider-reported input tokens.','SUM ai_input_tokens'),
      'output_tokens',dabbir_private.owner_metric_v1(to_jsonb(v_output_tokens),v_cost_state,'dabbir_operation_outcomes','Provider-reported output tokens.','SUM ai_output_tokens'),
      'reasoning_tokens',dabbir_private.owner_metric_v1(to_jsonb(v_reasoning_tokens),v_cost_state,'dabbir_operation_outcomes','Provider-reported reasoning tokens where exposed.','SUM ai_reasoning_tokens'),
      'total_tokens',dabbir_private.owner_metric_v1(to_jsonb(v_input_tokens+v_output_tokens+v_reasoning_tokens),v_cost_state,'dabbir_operation_outcomes','Input + output + reasoning tokens; zero is only shown for metered rows.','SUM token components'),
      'confirmed_cost_usd',dabbir_private.owner_metric_v1(to_jsonb(v_known_cost_usd),v_cost_state,'dabbir_operation_outcomes + gateway reconciliation','Confirmed provider/gateway cost only.','confirmed microusd / 1,000,000'),
      'confirmed_cost_aed',dabbir_private.owner_metric_v1(to_jsonb(v_known_cost_aed),v_cost_state,'dabbir_operation_outcomes + gateway reconciliation','Confirmed provider/gateway cost only.','confirmed USD * 3.6725'),
      'unpriced_operations',dabbir_private.owner_metric_v1(to_jsonb(v_unpriced),case when v_has_usage then 'COMPLETE' else v_cost_state end,'dabbir_operation_outcomes','Metered operations without a confirmed per-operation cost and without an included covering gateway reconciliation.','COUNT unpriced usage rows'),
      'cost_measurement_state',v_cost_state,'attribution_state',v_attribution_state
    ),
    'conversation_intelligence',jsonb_build_object(
      'total_conversations',dabbir_private.owner_metric_v1(to_jsonb(v_conv),'COMPLETE','dabbir_messages + dabbir_conversations','Real conversations active in the selected window.','COUNT DISTINCT conversation_id'),
      'total_messages',dabbir_private.owner_metric_v1(to_jsonb(v_messages),'COMPLETE','dabbir_messages','Non-simulated customer, AI and human messages.','COUNT messages'),
      'customer_messages',dabbir_private.owner_metric_v1(to_jsonb(v_customer_messages),'COMPLETE','dabbir_messages','Non-simulated customer messages.','COUNT sender_type=customer'),
      'ai_messages',dabbir_private.owner_metric_v1(to_jsonb(v_ai_messages),'COMPLETE','dabbir_messages','Non-simulated AI messages.','COUNT sender_type=ai'),
      'autonomous_conversations',dabbir_private.owner_metric_v1(to_jsonb(v_ai_only),'COMPLETE','dabbir_messages + dabbir_handoffs','Conversations with AI replies and no human message or handoff in the selected window.','COUNT DISTINCT conversation_id'),
      'human_required_count',dabbir_private.owner_metric_v1(to_jsonb(v_human_required),v_operator_state,'dabbir_ai_operator_events','Distinct AI batches entering HUMAN_REQUIRED.','COUNT DISTINCT source_id'),
      'human_required_rate',dabbir_private.owner_metric_v1(case when v_conv=0 then null else to_jsonb(round(v_human_required::numeric/v_conv*100,2)) end,v_operator_state,'dabbir_ai_operator_events + conversations','HUMAN_REQUIRED transitions relative to real conversations.','distinct HUMAN_REQUIRED batches / conversations * 100'),
      'handoff_count',dabbir_private.owner_metric_v1(to_jsonb(v_handoff),v_operator_state,'dabbir_handoffs','Durable human handoff rows created in the selected window.','COUNT handoff rows'),
      'requirement_extraction_failure_count',dabbir_private.owner_metric_v1(to_jsonb(v_requirement_failures),v_operator_state,'dabbir_handoffs.reason','Explicit handoff reasons classified as requirement failures.','COUNT explicit requirement-failure handoffs'),
      'repeated_requirement_failure_count',dabbir_private.owner_metric_v1(to_jsonb(v_repeated_requirement_failures),v_operator_state,'dabbir_handoffs.reason','Explicit REPEATED_REQUIREMENT_EXTRACTION_FAILURE handoffs.','COUNT exact reason'),
      'stale_context_failure_count',dabbir_private.owner_metric_v1(null,'NOT_MEASURED','none','No authoritative production event currently distinguishes stale-context failure from other context failures.','NOT MEASURED'),
      'clarification_count',dabbir_private.owner_metric_v1(to_jsonb(v_clarifications),v_understanding_state,'dabbir_ai_understanding_events.metrics.clarification_count','Explicit clarification actions recorded by the understanding engine.','SUM clarification_count'),
      'repeated_question_count',dabbir_private.owner_metric_v1(to_jsonb(v_repeated_questions),v_understanding_state,'dabbir_ai_understanding_events.metrics.quality_violations','Questions blocked/flagged because a fact was already confirmed.','COUNT ASKED_CONFIRMED_FACT violations'),
      'fallback_count',dabbir_private.owner_metric_v1(to_jsonb(v_fallbacks),v_cost_state,'dabbir_operation_outcomes.metadata.attempts','Successful metered calls that required more than one provider attempt.','COUNT usage rows with attempts length > 1'),
      'provider_failure_count',dabbir_private.owner_metric_v1(to_jsonb(v_provider_failures),'PARTIAL','dabbir_operation_outcomes operator.ai_planning','Explicit failed AI planning operations. Failed provider attempts that never reach the operation ledger are not yet complete.','COUNT failed operator.ai_planning outcomes'),
      'brain_failure_count',dabbir_private.owner_metric_v1(to_jsonb(v_brain_failures),v_understanding_state,'dabbir_ai_understanding_events.metrics.planner_failure_code','Understanding turns with an explicit planner failure code.','COUNT UNDERSTOOD events with planner_failure_code'),
      'tool_failure_count',dabbir_private.owner_metric_v1(to_jsonb(v_tool_actions-v_tool_success),v_operator_state,'dabbir_ai_action_ledger.result.verified','Deterministic AI business actions without a verified result.','actions - verified actions'),
      'unresolved_reference_count',dabbir_private.owner_metric_v1(to_jsonb(v_unresolved_refs),v_understanding_state,'dabbir_ai_understanding_events.metrics.unresolved_count','Understanding turns that retain at least one unresolved reference.','COUNT turns with unresolved_count > 0'),
      'low_confidence_count',dabbir_private.owner_metric_v1(to_jsonb(v_low_confidence),v_understanding_state,'dabbir_ai_understanding_events.metrics.operational_confidence','Understanding turns below operational confidence 0.65.','COUNT operational_confidence < 0.65'),
      'successful_goal_completion_count',dabbir_private.owner_metric_v1(to_jsonb(v_success),v_funnel_state,'durable verified outcomes','Distinct conversations reaching a committed/verified business success.','COUNT DISTINCT conversation_id'),
      'abandoned_conversation_count',dabbir_private.owner_metric_v1(null,'NOT_MEASURED','none','No durable abandonment event or agreed timeout semantics exist yet.','NOT MEASURED'),
      'average_turns_per_success',dabbir_private.owner_metric_v1(case when v_avg_turns_success is null then null else to_jsonb(v_avg_turns_success) end,v_funnel_state,'dabbir_messages + booking funnel','Average real messages up to the first committed success.','AVG message count per successful conversation'),
      'average_turns_before_handoff',dabbir_private.owner_metric_v1(case when v_avg_turns_handoff is null then null else to_jsonb(v_avg_turns_handoff) end,v_operator_state,'dabbir_messages + dabbir_handoffs','Average real messages up to the first handoff.','AVG message count per handed-off conversation')
    ),
    'quality',jsonb_build_object(
      'goal_completion_rate',dabbir_private.owner_metric_v1(case when v_conv=0 then null else to_jsonb(round(v_success::numeric/v_conv*100,2)) end,v_funnel_state,'durable verified outcomes','Outcome-grounded successful conversation rate.','success / conversations * 100'),
      'autonomous_completion_rate',dabbir_private.owner_metric_v1(case when v_conv=0 then null else to_jsonb(round(v_autonomous_success::numeric/v_conv*100,2)) end,v_funnel_state,'booking funnel + handoffs + messages','Successful outcomes completed without human intervention.','autonomous success / conversations * 100'),
      'handoff_rate',dabbir_private.owner_metric_v1(case when v_conv=0 then null else to_jsonb(round(v_handoff::numeric/v_conv*100,2)) end,v_operator_state,'dabbir_handoffs','Handoff rows relative to real conversations.','handoffs / conversations * 100'),
      'repeated_question_rate',dabbir_private.owner_metric_v1(case when v_clarifications=0 then null else to_jsonb(round(v_repeated_questions::numeric/v_clarifications*100,2)) end,v_understanding_state,'understanding quality violations','Repeated confirmed-fact questions relative to clarification actions.','ASKED_CONFIRMED_FACT / clarifications * 100'),
      'requirement_failure_rate',dabbir_private.owner_metric_v1(case when v_conv=0 then null else to_jsonb(round(v_requirement_failures::numeric/v_conv*100,2)) end,v_operator_state,'handoff reasons','Explicit requirement failures relative to real conversations.','requirement failures / conversations * 100'),
      'tool_execution_success_rate',dabbir_private.owner_metric_v1(case when v_tool_actions=0 then null else to_jsonb(round(v_tool_success::numeric/v_tool_actions*100,2)) end,v_operator_state,'dabbir_ai_action_ledger','Verified deterministic action receipts.','verified actions / actions * 100'),
      'conversation_recovery_rate',dabbir_private.owner_metric_v1(case when v_handoff=0 then null else to_jsonb(round(v_recovered::numeric/v_handoff*100,2)) end,v_operator_state,'handoffs + operator events','Handed-off conversations returned to AI and subsequently processed.','recovered conversations / handoffs * 100'),
      'customer_journey_completion_rate',dabbir_private.owner_metric_v1(case when v_conv=0 then null else to_jsonb(round(v_completed_journeys::numeric/v_conv*100,2)) end,v_funnel_state,'booking funnel','Conversations reaching COMPLETED or PAYMENT_RECORDED.','completed journey conversations / conversations * 100'),
      'context_failure_rate',dabbir_private.owner_metric_v1(case when v_has_understanding then to_jsonb(round((v_repeated_questions+v_unresolved_refs)::numeric/greatest(1,v_conv)*100,2)) else null end,v_understanding_state,'understanding quality violations + unresolved references','Observable context failures only: repeated confirmed-fact questions plus unresolved references.','observable context failures / conversations * 100'),
      'provider_failure_rate',dabbir_private.owner_metric_v1(case when v_ai_requests=0 then null else to_jsonb(round(v_provider_failures::numeric/v_ai_requests*100,2)) end,'PARTIAL','operation outcomes + AI meter','Explicit planning/provider failures divided by metered provider attempts; failed attempts outside the ledger remain partial.','provider failures / metered requests * 100'),
      'brain_failure_rate',dabbir_private.owner_metric_v1(case when v_conv=0 then null else to_jsonb(round(v_brain_failures::numeric/v_conv*100,2)) end,v_understanding_state,'understanding events','Planner failure-coded turns relative to real conversations.','brain failures / conversations * 100'),
      'first_contact_resolution',dabbir_private.owner_metric_v1(null,'NOT_MEASURED','none','No authoritative first-contact-resolution contract exists across all activity types.','NOT MEASURED')
    ),
    'business_outcomes',jsonb_build_object(
      'bookings',dabbir_private.owner_metric_v1(to_jsonb(v_booking_count),v_funnel_state,'dabbir_ai_booking_funnel_events','Distinct AI-attributed booking conversations reaching BOOKED or CONFIRMED.','COUNT DISTINCT conversation_id'),
      'completed_bookings',dabbir_private.owner_metric_v1(to_jsonb(v_completed_booking_count),v_funnel_state,'dabbir_ai_booking_funnel_events','Distinct AI-attributed booking conversations reaching COMPLETED.','COUNT DISTINCT conversation_id'),
      'paid_bookings',dabbir_private.owner_metric_v1(to_jsonb(v_paid_booking_count),v_funnel_state,'dabbir_ai_booking_funnel_events','Distinct AI-attributed booking conversations with PAYMENT_RECORDED.','COUNT DISTINCT conversation_id'),
      'orders',dabbir_private.owner_metric_v1(to_jsonb(v_order_count),case when v_channel is null and v_provider is null and v_model is null then 'COMPLETE' else 'UNKNOWN' end,'dabbir_orders','Real orders created in the selected business/branch scope; order-to-conversation attribution is not assumed.','COUNT non-simulated orders'),
      'completed_orders',dabbir_private.owner_metric_v1(to_jsonb(v_completed_order_count),case when v_channel is null and v_provider is null and v_model is null then 'COMPLETE' else 'UNKNOWN' end,'dabbir_orders','Real orders with durable completed/fulfilled/delivered status.','COUNT completed orders'),
      'paid_orders',dabbir_private.owner_metric_v1(to_jsonb(v_paid_order_count),case when v_channel is null and v_provider is null and v_model is null then 'COMPLETE' else 'UNKNOWN' end,'dabbir_orders','Real orders with durable positive paid amount.','COUNT paid orders'),
      'converted_customers',dabbir_private.owner_metric_v1(to_jsonb(v_converted_customers),v_funnel_state,'verified conversation outcomes','Distinct customers attached to successful outcome conversations.','COUNT DISTINCT customer_id')
    ),
    'unit_costs',jsonb_build_object(
      'cost_per_conversation_aed',dabbir_private.owner_metric_v1(case when v_conv=0 or v_cost_state='UNKNOWN' then null else to_jsonb(round(v_known_cost_aed/v_conv,6)) end,case when v_conv=0 then 'UNKNOWN' else v_cost_state end,'confirmed AI cost + conversations','Confirmed AI spend divided by real conversations.','confirmed cost / conversations'),
      'cost_per_autonomous_conversation_aed',dabbir_private.owner_metric_v1(case when v_ai_only=0 or v_cost_state='UNKNOWN' then null else to_jsonb(round(v_known_cost_aed/v_ai_only,6)) end,case when v_ai_only=0 then 'UNKNOWN' else v_cost_state end,'confirmed AI cost + autonomous conversations','Confirmed AI spend divided by AI-only conversations.','confirmed cost / autonomous conversations'),
      'cost_per_successful_goal_aed',dabbir_private.owner_metric_v1(case when v_success=0 or v_cost_state='UNKNOWN' then null else to_jsonb(round(v_known_cost_aed/v_success,6)) end,case when v_success=0 then 'UNKNOWN' else v_cost_state end,'confirmed AI cost + successful outcomes','Confirmed AI spend divided by successful outcome conversations.','confirmed cost / successful outcomes'),
      'cost_per_booking_aed',dabbir_private.owner_metric_v1(case when v_booking_count=0 or v_cost_state='UNKNOWN' then null else to_jsonb(round(v_known_cost_aed/v_booking_count,6)) end,case when v_booking_count=0 then 'UNKNOWN' else v_cost_state end,'confirmed AI cost + booking funnel','Confirmed AI spend divided by booked/confirmed conversations.','confirmed cost / bookings'),
      'cost_per_completed_booking_aed',dabbir_private.owner_metric_v1(case when v_completed_booking_count=0 or v_cost_state='UNKNOWN' then null else to_jsonb(round(v_known_cost_aed/v_completed_booking_count,6)) end,case when v_completed_booking_count=0 then 'UNKNOWN' else v_cost_state end,'confirmed AI cost + booking funnel','Confirmed AI spend divided by completed booking conversations.','confirmed cost / completed bookings'),
      'cost_per_order_aed',dabbir_private.owner_metric_v1(case when v_order_count=0 or v_cost_state='UNKNOWN' then null else to_jsonb(round(v_known_cost_aed/v_order_count,6)) end,case when v_order_count=0 then 'UNKNOWN' else case when v_channel is null and v_provider is null and v_model is null then v_cost_state else 'UNKNOWN' end end,'confirmed AI cost + orders','Scope-level cost divided by real orders; only valid without channel/provider/model attribution assumptions.','confirmed cost / orders'),
      'cost_per_completed_order_aed',dabbir_private.owner_metric_v1(case when v_completed_order_count=0 or v_cost_state='UNKNOWN' then null else to_jsonb(round(v_known_cost_aed/v_completed_order_count,6)) end,case when v_completed_order_count=0 then 'UNKNOWN' else case when v_channel is null and v_provider is null and v_model is null then v_cost_state else 'UNKNOWN' end end,'confirmed AI cost + orders','Scope-level cost divided by completed orders.','confirmed cost / completed orders'),
      'cost_per_paid_outcome_aed',dabbir_private.owner_metric_v1(case when (v_paid_booking_count+v_paid_order_count)=0 or v_cost_state='UNKNOWN' then null else to_jsonb(round(v_known_cost_aed/(v_paid_booking_count+v_paid_order_count),6)) end,case when (v_paid_booking_count+v_paid_order_count)=0 then 'UNKNOWN' else v_cost_state end,'confirmed AI cost + durable paid outcomes','Confirmed AI spend divided by durable paid booking/order outcomes.','confirmed cost / paid outcomes'),
      'cost_per_converted_customer_aed',dabbir_private.owner_metric_v1(case when v_converted_customers=0 or v_cost_state='UNKNOWN' then null else to_jsonb(round(v_known_cost_aed/v_converted_customers,6)) end,case when v_converted_customers=0 then 'UNKNOWN' else v_cost_state end,'confirmed AI cost + verified customer outcomes','Confirmed AI spend divided by distinct converted customers.','confirmed cost / converted customers'),
      'revenue',dabbir_private.owner_metric_v1(null,'UNKNOWN','business payment ledgers are activity-specific','Revenue is intentionally not inferred from quotes or order totals in this AI measurement layer.','REVENUE_NOT_AVAILABLE'),
      'cost_completeness',case when v_cost_state='COMPLETE' then 'COMPLETE_COST' when v_cost_state='PARTIAL' then 'PARTIAL_COST' else 'UNKNOWN' end
    ),
    'funnels',v_funnels,'breakdowns',v_breakdowns,'trends',v_trends,'regression_warnings',v_warnings,
    'measurement_health',jsonb_build_object(
      'overall',case when v_cost_state='UNKNOWN' and v_understanding_state='UNKNOWN' and v_operator_state='UNKNOWN' then 'UNKNOWN' when v_cost_state='PARTIAL' or v_understanding_state='PARTIAL' or v_operator_state='PARTIAL' or v_funnel_state='PARTIAL' or v_attr_missing then 'PARTIAL' else 'COMPLETE' end,
      'cost',v_cost_state,'understanding',v_understanding_state,'operator',v_operator_state,'conversion_funnel',v_funnel_state,'attribution',v_attribution_state,
      'not_measured',jsonb_build_array('stale_context_failure_count','abandoned_conversation_count','first_contact_resolution'),
      'truth_rule','UNKNOWN/PARTIAL is preserved; absence of evidence is never rendered as zero.'
    )
  );
end;
$$;
revoke all on function public.dabbir_owner_measurement_snapshot_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_owner_measurement_snapshot_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) to service_role;
comment on function public.dabbir_owner_measurement_snapshot_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) is
  'Server-only owner executive measurement snapshot. Fixed-query server-side aggregation with explicit truth states and tenant scope.';
