-- Conversation, cognitive quality and business-outcome measurement.
-- Outcome-grounded; no LLM self-rating is used as the source of success.

create index if not exists dabbir_ai_understanding_events_measurement_idx
  on public.dabbir_ai_understanding_events (business_id,created_at desc);
create index if not exists dabbir_handoffs_measurement_idx
  on public.dabbir_handoffs (business_id,created_at desc);
create index if not exists dabbir_messages_measurement_idx
  on public.dabbir_messages (business_id,created_at desc) where simulated=false;
create index if not exists dabbir_booking_funnel_measurement_idx
  on public.dabbir_ai_booking_funnel_events (business_id,occurred_at desc,stage);

create or replace function public.dabbir_owner_quality_measurement_v1(
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
  v_conversations bigint:=0; v_messages bigint:=0; v_customer_messages bigint:=0; v_ai_messages bigint:=0; v_human_messages bigint:=0;
  v_autonomous_conversations bigint:=0; v_human_required bigint:=0; v_handoffs bigint:=0;
  v_requirement_failures bigint:=0; v_repeated_requirement_failures bigint:=0;
  v_clarifications bigint:=0; v_repeated_questions bigint:=0; v_unresolved_refs bigint:=0; v_low_confidence bigint:=0; v_brain_failures bigint:=0; v_context_failure_conversations bigint:=0;
  v_fallbacks bigint:=0; v_provider_failures bigint:=0; v_tool_actions bigint:=0; v_tool_success bigint:=0;
  v_success bigint:=0; v_autonomous_success bigint:=0; v_bookings bigint:=0; v_completed_bookings bigint:=0; v_paid_bookings bigint:=0; v_converted_customers bigint:=0;
  v_recovered bigint:=0; v_completed_journeys bigint:=0; v_orders bigint:=0; v_completed_orders bigint:=0; v_paid_orders bigint:=0;
  v_avg_turns_success numeric; v_avg_turns_handoff numeric;
  v_understanding_state text; v_operator_state text; v_funnel_state text; v_outcome_state text; v_attr_state text:='COMPLETE';
  v_unsupported_businesses bigint:=0; v_attr_missing bigint:=0;
  v_understanding_start constant timestamptz:='2026-09-08 02:59:20+00';
  v_operator_start constant timestamptz:='2026-09-07 19:04:20+00';
  v_funnel_start constant timestamptz:='2026-09-07 19:22:29+00';
begin
  if upper(coalesce(p_scope->>'authority_role','')) not in ('ROOT_OWNER','OWNER_DELEGATE') then raise exception 'OWNER_MEASUREMENT_AUTHORITY_REQUIRED'; end if;
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '366 days' then raise exception 'OWNER_MEASUREMENT_WINDOW_INVALID'; end if;
  if p_business_id is not null and not exists(select 1 from dabbir_private.owner_scope_businesses_v1(p_scope) s where s.business_id=p_business_id) then raise exception 'OWNER_MEASUREMENT_BUSINESS_SCOPE_DENIED'; end if;
  if p_branch_id is not null and not exists(select 1 from public.dabbir_business_branches br join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=br.business_id where br.id=p_branch_id and (p_business_id is null or br.business_id=p_business_id)) then raise exception 'OWNER_MEASUREMENT_BRANCH_SCOPE_DENIED'; end if;

  select count(*) into v_attr_missing
  from public.dabbir_ai_usage_fact_v1 f
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
  where f.completed_at>=p_start and f.completed_at<p_end
    and (p_business_id is null or f.business_id=p_business_id)
    and (v_channel is null or lower(f.channel)=v_channel)
    and (v_provider is null or lower(f.provider)=v_provider)
    and (v_model is null or f.model=v_model)
    and ((p_branch_id is not null and f.branch_id is null) or ((v_provider is not null or v_model is not null) and f.conversation_id is null));
  if v_attr_missing>0 then v_attr_state:='PARTIAL'; end if;

  select count(*) into v_unsupported_businesses
  from public.dabbir_businesses b
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=b.id
  where (p_business_id is null or b.id=p_business_id)
    and b.business_type in ('store','creator','real_estate');

  v_understanding_state:=case when v_channel is not null and v_channel<>'whatsapp' then 'UNKNOWN' when p_start<v_understanding_start or v_attr_state='PARTIAL' then 'PARTIAL' else 'COMPLETE' end;
  v_operator_state:=case when p_start<v_operator_start or v_attr_state='PARTIAL' then 'PARTIAL' else 'COMPLETE' end;
  v_funnel_state:=case when p_start<v_funnel_start or v_attr_state='PARTIAL' or v_unsupported_businesses>0 then 'PARTIAL' else 'COMPLETE' end;
  v_outcome_state:=v_funnel_state;

  with scoped_conversations as (
    select distinct c.id,c.business_id,c.customer_id,c.branch_id,c.channel_type
    from public.dabbir_conversations c
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id
    join public.dabbir_messages m on m.business_id=c.business_id and m.conversation_id=c.id
    where m.created_at>=p_start and m.created_at<p_end and coalesce(m.simulated,false)=false
      and (p_business_id is null or c.business_id=p_business_id)
      and (p_branch_id is null or c.branch_id=p_branch_id)
      and (v_channel is null or lower(c.channel_type)=v_channel)
      and ((v_provider is null and v_model is null) or exists(
        select 1 from public.dabbir_ai_usage_fact_v1 f
        where f.business_id=c.business_id and f.conversation_id=c.id
          and f.completed_at>=p_start and f.completed_at<p_end
          and (v_provider is null or lower(f.provider)=v_provider)
          and (v_model is null or f.model=v_model)
      ))
  )
  select count(*) into v_conversations from scoped_conversations;

  with scoped_conversations as (
    select distinct c.id,c.business_id
    from public.dabbir_conversations c
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id
    join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false
      and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id)
      and (v_channel is null or lower(c.channel_type)=v_channel)
      and ((v_provider is null and v_model is null) or exists(select 1 from public.dabbir_ai_usage_fact_v1 f where f.business_id=c.business_id and f.conversation_id=c.id and f.completed_at>=p_start and f.completed_at<p_end and (v_provider is null or lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)))
  )
  select count(*),count(*) filter(where m.sender_type='customer'),count(*) filter(where m.sender_type='ai'),count(*) filter(where m.sender_type='human')
  into v_messages,v_customer_messages,v_ai_messages,v_human_messages
  from public.dabbir_messages m join scoped_conversations sc on sc.business_id=m.business_id and sc.id=m.conversation_id
  where m.created_at>=p_start and m.created_at<p_end and coalesce(m.simulated,false)=false and m.sender_type in ('customer','ai','human');

  with scoped_conversations as (
    select distinct c.id,c.business_id
    from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id
    join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
      and ((v_provider is null and v_model is null) or exists(select 1 from public.dabbir_ai_usage_fact_v1 f where f.business_id=c.business_id and f.conversation_id=c.id and f.completed_at>=p_start and f.completed_at<p_end and (v_provider is null or lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)))
  )
  select count(*) into v_autonomous_conversations from scoped_conversations sc
  where exists(select 1 from public.dabbir_messages m where m.business_id=sc.business_id and m.conversation_id=sc.id and m.created_at>=p_start and m.created_at<p_end and m.sender_type='ai' and coalesce(m.simulated,false)=false)
    and not exists(select 1 from public.dabbir_messages m where m.business_id=sc.business_id and m.conversation_id=sc.id and m.created_at>=p_start and m.created_at<p_end and m.sender_type='human' and coalesce(m.simulated,false)=false)
    and not exists(select 1 from public.dabbir_handoffs h where h.business_id=sc.business_id and h.conversation_id=sc.id and h.created_at>=p_start and h.created_at<p_end);

  with scoped_conversations as (
    select distinct c.id,c.business_id
    from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
      and ((v_provider is null and v_model is null) or exists(select 1 from public.dabbir_ai_usage_fact_v1 f where f.business_id=c.business_id and f.conversation_id=c.id and f.completed_at>=p_start and f.completed_at<p_end and (v_provider is null or lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)))
  )
  select count(distinct coalesce(e.source_id,e.batch_id,e.id)) into v_human_required
  from public.dabbir_ai_operator_events e join scoped_conversations sc on sc.business_id=e.business_id and sc.id=e.conversation_id
  where e.event_type='human_required' and e.status='HUMAN_REQUIRED' and e.occurred_at>=p_start and e.occurred_at<p_end;

  with scoped_conversations as (
    select distinct c.id,c.business_id from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
      and ((v_provider is null and v_model is null) or exists(select 1 from public.dabbir_ai_usage_fact_v1 f where f.business_id=c.business_id and f.conversation_id=c.id and f.completed_at>=p_start and f.completed_at<p_end and (v_provider is null or lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)))
  )
  select count(*),count(*) filter(where upper(coalesce(h.reason,'')) like '%REQUIREMENT%FAIL%'),count(*) filter(where upper(coalesce(h.reason,''))='REPEATED_REQUIREMENT_EXTRACTION_FAILURE')
  into v_handoffs,v_requirement_failures,v_repeated_requirement_failures
  from public.dabbir_handoffs h join scoped_conversations sc on sc.business_id=h.business_id and sc.id=h.conversation_id
  where h.created_at>=p_start and h.created_at<p_end;

  with scoped_conversations as (
    select distinct c.id,c.business_id from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
      and ((v_provider is null and v_model is null) or exists(select 1 from public.dabbir_ai_usage_fact_v1 f where f.business_id=c.business_id and f.conversation_id=c.id and f.completed_at>=p_start and f.completed_at<p_end and (v_provider is null or lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)))
  ), understood as (
    select e.* from public.dabbir_ai_understanding_events e join scoped_conversations sc on sc.business_id=e.business_id and sc.id=e.conversation_id
    where e.event_type='UNDERSTOOD' and e.created_at>=p_start and e.created_at<p_end
  )
  select
    coalesce(sum(case when coalesce(metrics->>'clarification_count','') ~ '^[0-9]+$' then (metrics->>'clarification_count')::bigint else 0 end),0),
    count(*) filter(where coalesce(metrics->'quality_violations','[]'::jsonb) ? 'ASKED_CONFIRMED_FACT'),
    count(*) filter(where coalesce(metrics->>'unresolved_count','') ~ '^[0-9]+$' and (metrics->>'unresolved_count')::bigint>0),
    count(*) filter(where coalesce(metrics->>'operational_confidence','') ~ '^[0-9]+([.][0-9]+)?$' and (metrics->>'operational_confidence')::numeric<0.65),
    count(*) filter(where nullif(metrics->>'planner_failure_code','') is not null),
    count(distinct conversation_id) filter(where coalesce(metrics->'quality_violations','[]'::jsonb) ? 'ASKED_CONFIRMED_FACT' or (coalesce(metrics->>'unresolved_count','') ~ '^[0-9]+$' and (metrics->>'unresolved_count')::bigint>0))
  into v_clarifications,v_repeated_questions,v_unresolved_refs,v_low_confidence,v_brain_failures,v_context_failure_conversations
  from understood;

  select count(*) into v_fallbacks
  from public.dabbir_operation_outcomes o
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id
  where o.source='ai_usage_meter' and o.completed_at>=p_start and o.completed_at<p_end
    and jsonb_typeof(o.metadata->'attempts')='array' and jsonb_array_length(o.metadata->'attempts')>1
    and (p_business_id is null or o.business_id=p_business_id)
    and (p_branch_id is null or o.branch_id=p_branch_id)
    and (v_channel is null or lower(coalesce(o.ai_channel,''))=v_channel)
    and (v_provider is null or lower(coalesce(o.ai_provider,''))=v_provider)
    and (v_model is null or coalesce(o.ai_model,'unknown')=v_model);

  select count(*) into v_provider_failures
  from public.dabbir_operation_outcomes o join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id
  where o.operation_type='operator.ai_planning' and o.outcome<>'VERIFIED_SUCCESS' and o.created_at>=p_start and o.created_at<p_end and (p_business_id is null or o.business_id=p_business_id);

  with scoped_conversations as (
    select distinct c.id,c.business_id from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
      and ((v_provider is null and v_model is null) or exists(select 1 from public.dabbir_ai_usage_fact_v1 f where f.business_id=c.business_id and f.conversation_id=c.id and f.completed_at>=p_start and f.completed_at<p_end and (v_provider is null or lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)))
  )
  select count(*),count(*) filter(where lower(coalesce(l.result->>'verified','false'))='true') into v_tool_actions,v_tool_success
  from public.dabbir_ai_action_ledger l join scoped_conversations sc on sc.business_id=l.business_id and sc.id=l.conversation_id
  where l.created_at>=p_start and l.created_at<p_end;

  with scoped_conversations as (
    select distinct c.id,c.business_id,c.customer_id from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
      and ((v_provider is null and v_model is null) or exists(select 1 from public.dabbir_ai_usage_fact_v1 f where f.business_id=c.business_id and f.conversation_id=c.id and f.completed_at>=p_start and f.completed_at<p_end and (v_provider is null or lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)))
  ), success_conv as (
    select f.business_id,f.conversation_id,min(f.occurred_at) first_success,max(f.customer_id::text)::uuid customer_id
    from public.dabbir_ai_booking_funnel_events f join scoped_conversations sc on sc.business_id=f.business_id and sc.id=f.conversation_id
    where f.stage in ('CONFIRMED','COMPLETED','PAYMENT_RECORDED') and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED') and f.occurred_at>=p_start and f.occurred_at<p_end
    group by f.business_id,f.conversation_id
  )
  select count(*),count(distinct customer_id),count(*) filter(where not exists(select 1 from public.dabbir_handoffs h where h.business_id=success_conv.business_id and h.conversation_id=success_conv.conversation_id and h.created_at<=success_conv.first_success) and not exists(select 1 from public.dabbir_messages m where m.business_id=success_conv.business_id and m.conversation_id=success_conv.conversation_id and m.sender_type='human' and m.created_at<=success_conv.first_success and coalesce(m.simulated,false)=false))
  into v_success,v_converted_customers,v_autonomous_success from success_conv;

  with scoped_conversations as (
    select distinct c.id,c.business_id from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
      and ((v_provider is null and v_model is null) or exists(select 1 from public.dabbir_ai_usage_fact_v1 f where f.business_id=c.business_id and f.conversation_id=c.id and f.completed_at>=p_start and f.completed_at<p_end and (v_provider is null or lower(f.provider)=v_provider) and (v_model is null or f.model=v_model)))
  )
  select count(distinct f.conversation_id) filter(where f.stage in ('BOOKED','CONFIRMED')),count(distinct f.conversation_id) filter(where f.stage='COMPLETED'),count(distinct f.conversation_id) filter(where f.stage='PAYMENT_RECORDED')
  into v_bookings,v_completed_bookings,v_paid_bookings
  from public.dabbir_ai_booking_funnel_events f join scoped_conversations sc on sc.business_id=f.business_id and sc.id=f.conversation_id
  where f.occurred_at>=p_start and f.occurred_at<p_end and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED');

  with scoped_conversations as (
    select distinct c.id,c.business_id from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
  )
  select count(distinct h.conversation_id) into v_recovered
  from public.dabbir_handoffs h join scoped_conversations sc on sc.business_id=h.business_id and sc.id=h.conversation_id
  where h.returned_to_ai_at>=p_start and h.returned_to_ai_at<p_end and exists(select 1 from public.dabbir_ai_operator_events e where e.business_id=h.business_id and e.conversation_id=h.conversation_id and e.event_type='batch_processed' and e.occurred_at>h.returned_to_ai_at);

  with scoped_conversations as (
    select distinct c.id,c.business_id from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
  )
  select count(distinct f.conversation_id) into v_completed_journeys
  from public.dabbir_ai_booking_funnel_events f join scoped_conversations sc on sc.business_id=f.business_id and sc.id=f.conversation_id
  where f.stage in ('COMPLETED','PAYMENT_RECORDED') and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED') and f.occurred_at>=p_start and f.occurred_at<p_end;

  if v_channel is null and v_provider is null and v_model is null then
    select count(*),count(*) filter(where lower(coalesce(o.status,o.workflow_status,'')) in ('completed','fulfilled','delivered')),count(*) filter(where coalesce(o.paid_amount,o.paid_aed,0)>0)
    into v_orders,v_completed_orders,v_paid_orders
    from public.dabbir_orders o join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=o.business_id
    where o.created_at>=p_start and o.created_at<p_end and coalesce(o.simulated,false)=false and (p_business_id is null or o.business_id=p_business_id) and (p_branch_id is null or o.branch_id=p_branch_id);
  end if;

  with scoped_conversations as (
    select distinct c.id,c.business_id from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
  ), success_conv as (
    select f.business_id,f.conversation_id,min(f.occurred_at) first_success from public.dabbir_ai_booking_funnel_events f join scoped_conversations sc on sc.business_id=f.business_id and sc.id=f.conversation_id where f.stage in ('CONFIRMED','COMPLETED','PAYMENT_RECORDED') and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED') and f.occurred_at>=p_start and f.occurred_at<p_end group by f.business_id,f.conversation_id
  ), turns as (
    select sc.business_id,sc.conversation_id,count(m.id)::numeric n from success_conv sc join public.dabbir_messages m on m.business_id=sc.business_id and m.conversation_id=sc.conversation_id and m.created_at<=sc.first_success and coalesce(m.simulated,false)=false and m.sender_type in ('customer','ai','human') group by sc.business_id,sc.conversation_id
  ) select round(avg(n),2) into v_avg_turns_success from turns;

  with scoped_conversations as (
    select distinct c.id,c.business_id from public.dabbir_conversations c join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id join public.dabbir_messages m0 on m0.business_id=c.business_id and m0.conversation_id=c.id
    where m0.created_at>=p_start and m0.created_at<p_end and coalesce(m0.simulated,false)=false and (p_business_id is null or c.business_id=p_business_id) and (p_branch_id is null or c.branch_id=p_branch_id) and (v_channel is null or lower(c.channel_type)=v_channel)
  ), first_handoff as (
    select h.business_id,h.conversation_id,min(h.created_at) first_handoff from public.dabbir_handoffs h join scoped_conversations sc on sc.business_id=h.business_id and sc.id=h.conversation_id where h.created_at>=p_start and h.created_at<p_end group by h.business_id,h.conversation_id
  ), turns as (
    select fh.business_id,fh.conversation_id,count(m.id)::numeric n from first_handoff fh join public.dabbir_messages m on m.business_id=fh.business_id and m.conversation_id=fh.conversation_id and m.created_at<=fh.first_handoff and coalesce(m.simulated,false)=false and m.sender_type in ('customer','ai','human') group by fh.business_id,fh.conversation_id
  ) select round(avg(n),2) into v_avg_turns_handoff from turns;

  return jsonb_build_object(
    'window',jsonb_build_object('start',p_start,'end',p_end),
    'measurement_state',case when v_understanding_state in ('PARTIAL','UNKNOWN') or v_operator_state='PARTIAL' or v_funnel_state='PARTIAL' then 'PARTIAL' else 'COMPLETE' end,
    'conversation_intelligence',jsonb_build_object(
      'total_conversations',dabbir_private.owner_metric_v1(to_jsonb(v_conversations),'COMPLETE','dabbir_messages + dabbir_conversations','Distinct real conversations with at least one non-simulated message in the selected period.','COUNT DISTINCT conversation_id'),
      'total_messages',dabbir_private.owner_metric_v1(to_jsonb(v_messages),'COMPLETE','dabbir_messages','Non-simulated customer, AI and human messages.','COUNT messages'),
      'customer_messages',dabbir_private.owner_metric_v1(to_jsonb(v_customer_messages),'COMPLETE','dabbir_messages','Non-simulated customer messages.','COUNT sender_type=customer'),
      'ai_messages',dabbir_private.owner_metric_v1(to_jsonb(v_ai_messages),'COMPLETE','dabbir_messages','Non-simulated AI messages.','COUNT sender_type=ai'),
      'autonomous_conversations',dabbir_private.owner_metric_v1(to_jsonb(v_autonomous_conversations),'COMPLETE','dabbir_messages + dabbir_handoffs','Conversations with AI reply and no human message or handoff inside the period.','COUNT DISTINCT conversation_id'),
      'human_required_count',dabbir_private.owner_metric_v1(to_jsonb(v_human_required),v_operator_state,'dabbir_ai_operator_events','Distinct source/batch events that entered HUMAN_REQUIRED.','COUNT DISTINCT source_id/batch_id'),
      'human_required_rate',dabbir_private.owner_metric_v1(case when v_conversations=0 then null else to_jsonb(round(v_human_required::numeric/v_conversations*100,2)) end,v_operator_state,'operator events + conversations','HUMAN_REQUIRED transitions relative to real conversations.','human_required / conversations * 100'),
      'handoff_count',dabbir_private.owner_metric_v1(to_jsonb(v_handoffs),v_operator_state,'dabbir_handoffs','Durable handoff records created in the period.','COUNT handoff rows'),
      'requirement_extraction_failure_count',dabbir_private.owner_metric_v1(to_jsonb(v_requirement_failures),v_operator_state,'dabbir_handoffs.reason','Explicit handoff reasons containing requirement failure.','COUNT explicit requirement-failure handoffs'),
      'repeated_requirement_failure_count',dabbir_private.owner_metric_v1(to_jsonb(v_repeated_requirement_failures),v_operator_state,'dabbir_handoffs.reason','Exact REPEATED_REQUIREMENT_EXTRACTION_FAILURE handoffs.','COUNT exact reason'),
      'stale_context_failure_count',dabbir_private.owner_metric_v1(null,'NOT_MEASURED','none','No authoritative production event currently distinguishes stale-context failure.','NOT MEASURED'),
      'clarification_count',dabbir_private.owner_metric_v1(to_jsonb(v_clarifications),v_understanding_state,'dabbir_ai_understanding_events.metrics.clarification_count','Understanding turns that intentionally asked for clarification.','SUM per-turn clarification_count'),
      'repeated_question_count',dabbir_private.owner_metric_v1(to_jsonb(v_repeated_questions),v_understanding_state,'dabbir_ai_understanding_events.metrics.quality_violations','Questions flagged because the requested fact was already confirmed.','COUNT ASKED_CONFIRMED_FACT violations'),
      'fallback_count',dabbir_private.owner_metric_v1(to_jsonb(v_fallbacks),case when v_attr_state='PARTIAL' then 'PARTIAL' else 'COMPLETE' end,'dabbir_operation_outcomes.metadata.attempts','Metered AI calls that required more than one provider attempt.','COUNT attempts arrays with length > 1'),
      'provider_failure_count',dabbir_private.owner_metric_v1(case when p_branch_id is not null or v_channel is not null or v_provider is not null or v_model is not null then null else to_jsonb(v_provider_failures) end,case when p_branch_id is not null or v_channel is not null or v_provider is not null or v_model is not null then 'UNKNOWN' else 'PARTIAL' end,'dabbir_operation_outcomes operator.ai_planning','Explicit failed planning operations; provider attempts that fail before durable ledger write are not fully covered.','COUNT failed operator.ai_planning outcomes'),
      'brain_failure_count',dabbir_private.owner_metric_v1(to_jsonb(v_brain_failures),v_understanding_state,'dabbir_ai_understanding_events.metrics.planner_failure_code','Understanding turns carrying an explicit planner failure code.','COUNT turns with planner_failure_code'),
      'tool_failure_count',dabbir_private.owner_metric_v1(to_jsonb(v_tool_actions-v_tool_success),v_operator_state,'dabbir_ai_action_ledger.result.verified','Deterministic AI business actions without a verified result.','actions - verified actions'),
      'unresolved_reference_count',dabbir_private.owner_metric_v1(to_jsonb(v_unresolved_refs),v_understanding_state,'dabbir_ai_understanding_events.metrics.unresolved_count','Understanding turns retaining one or more unresolved references.','COUNT turns with unresolved_count > 0'),
      'low_confidence_count',dabbir_private.owner_metric_v1(to_jsonb(v_low_confidence),v_understanding_state,'dabbir_ai_understanding_events.metrics.operational_confidence','Understanding turns below operational confidence 0.65.','COUNT confidence < 0.65'),
      'successful_goal_completion_count',dabbir_private.owner_metric_v1(to_jsonb(v_success),v_outcome_state,'dabbir_ai_booking_funnel_events','Distinct conversations reaching a durable CONFIRMED/COMPLETED/PAYMENT_RECORDED result.','COUNT DISTINCT conversation_id'),
      'abandoned_conversation_count',dabbir_private.owner_metric_v1(null,'NOT_MEASURED','none','No authoritative abandonment event or agreed timeout contract exists across activity types.','NOT MEASURED'),
      'average_turns_per_success',dabbir_private.owner_metric_v1(case when v_avg_turns_success is null then null else to_jsonb(v_avg_turns_success) end,v_outcome_state,'dabbir_messages + booking funnel','Average real message turns up to the first durable success.','AVG message count per successful conversation'),
      'average_turns_before_handoff',dabbir_private.owner_metric_v1(case when v_avg_turns_handoff is null then null else to_jsonb(v_avg_turns_handoff) end,v_operator_state,'dabbir_messages + handoffs','Average real message turns up to first handoff.','AVG message count per handed-off conversation')
    ),
    'quality',jsonb_build_object(
      'goal_completion_rate',dabbir_private.owner_metric_v1(case when v_conversations=0 then null else to_jsonb(round(v_success::numeric/v_conversations*100,2)) end,v_outcome_state,'durable booking funnel + conversations','Outcome-grounded successful conversation rate.','successful goal conversations / conversations * 100'),
      'autonomous_completion_rate',dabbir_private.owner_metric_v1(case when v_conversations=0 then null else to_jsonb(round(v_autonomous_success::numeric/v_conversations*100,2)) end,v_outcome_state,'booking funnel + handoffs + human messages','Successful business outcomes completed without human intervention before success.','autonomous successes / conversations * 100'),
      'handoff_rate',dabbir_private.owner_metric_v1(case when v_conversations=0 then null else to_jsonb(round(v_handoffs::numeric/v_conversations*100,2)) end,v_operator_state,'dabbir_handoffs + conversations','Handoff records relative to real conversations.','handoffs / conversations * 100'),
      'repeated_question_rate',dabbir_private.owner_metric_v1(case when v_clarifications=0 then null else to_jsonb(round(v_repeated_questions::numeric/v_clarifications*100,2)) end,v_understanding_state,'understanding quality violations','Repeated confirmed-fact questions relative to clarification actions.','ASKED_CONFIRMED_FACT / clarifications * 100'),
      'requirement_failure_rate',dabbir_private.owner_metric_v1(case when v_conversations=0 then null else to_jsonb(round(v_requirement_failures::numeric/v_conversations*100,2)) end,v_operator_state,'handoff reasons + conversations','Explicit requirement failures relative to real conversations.','requirement failures / conversations * 100'),
      'tool_execution_success_rate',dabbir_private.owner_metric_v1(case when v_tool_actions=0 then null else to_jsonb(round(v_tool_success::numeric/v_tool_actions*100,2)) end,v_operator_state,'dabbir_ai_action_ledger','Verified deterministic AI actions.','verified actions / actions * 100'),
      'conversation_recovery_rate',dabbir_private.owner_metric_v1(case when v_handoffs=0 then null else to_jsonb(round(v_recovered::numeric/v_handoffs*100,2)) end,v_operator_state,'dabbir_handoffs + dabbir_ai_operator_events','Handed-off conversations returned to AI and subsequently processed.','recovered conversations / handoffs * 100'),
      'customer_journey_completion_rate',dabbir_private.owner_metric_v1(case when v_conversations=0 then null else to_jsonb(round(v_completed_journeys::numeric/v_conversations*100,2)) end,v_funnel_state,'dabbir_ai_booking_funnel_events','Conversations reaching COMPLETED or PAYMENT_RECORDED.','completed journey conversations / conversations * 100'),
      'context_failure_rate',dabbir_private.owner_metric_v1(case when v_conversations=0 then null else to_jsonb(round(v_context_failure_conversations::numeric/v_conversations*100,2)) end,v_understanding_state,'understanding quality violations + unresolved references','Distinct conversations with an observable repeated-confirmed-fact or unresolved-reference failure.','context-failure conversations / conversations * 100'),
      'provider_failure_rate',dabbir_private.owner_metric_v1(null,'PARTIAL','operator planning outcomes + usage meter','Provider failure coverage is not yet authoritative for every failed attempt; a precise denominator would mislead.','PARTIAL / no fabricated rate'),
      'brain_failure_rate',dabbir_private.owner_metric_v1(case when v_conversations=0 then null else to_jsonb(round(v_brain_failures::numeric/v_conversations*100,2)) end,v_understanding_state,'understanding planner failure codes','Planner failure-coded turns relative to real conversations.','brain failures / conversations * 100'),
      'first_contact_resolution',dabbir_private.owner_metric_v1(null,'NOT_MEASURED','none','No authoritative cross-activity first-contact-resolution contract exists.','NOT MEASURED')
    ),
    'business_outcomes',jsonb_build_object(
      'bookings',dabbir_private.owner_metric_v1(to_jsonb(v_bookings),v_funnel_state,'dabbir_ai_booking_funnel_events','Distinct AI-attributed booking conversations reaching BOOKED or CONFIRMED.','COUNT DISTINCT conversation_id'),
      'completed_bookings',dabbir_private.owner_metric_v1(to_jsonb(v_completed_bookings),v_funnel_state,'dabbir_ai_booking_funnel_events','Distinct booking conversations reaching COMPLETED.','COUNT DISTINCT conversation_id'),
      'paid_bookings',dabbir_private.owner_metric_v1(to_jsonb(v_paid_bookings),v_funnel_state,'dabbir_ai_booking_funnel_events','Distinct booking conversations with PAYMENT_RECORDED.','COUNT DISTINCT conversation_id'),
      'orders',dabbir_private.owner_metric_v1(case when v_channel is null and v_provider is null and v_model is null then to_jsonb(v_orders) else null end,case when v_channel is null and v_provider is null and v_model is null then 'COMPLETE' else 'UNKNOWN' end,'dabbir_orders','Real non-simulated orders; channel/provider/model attribution is not assumed.','COUNT orders'),
      'completed_orders',dabbir_private.owner_metric_v1(case when v_channel is null and v_provider is null and v_model is null then to_jsonb(v_completed_orders) else null end,case when v_channel is null and v_provider is null and v_model is null then 'COMPLETE' else 'UNKNOWN' end,'dabbir_orders','Real orders with completed/fulfilled/delivered durable state.','COUNT completed orders'),
      'paid_orders',dabbir_private.owner_metric_v1(case when v_channel is null and v_provider is null and v_model is null then to_jsonb(v_paid_orders) else null end,case when v_channel is null and v_provider is null and v_model is null then 'COMPLETE' else 'UNKNOWN' end,'dabbir_orders','Real orders with positive paid amount.','COUNT paid orders'),
      'converted_customers',dabbir_private.owner_metric_v1(to_jsonb(v_converted_customers),v_outcome_state,'dabbir_ai_booking_funnel_events','Distinct customers attached to durable successful booking outcomes.','COUNT DISTINCT customer_id')
    ),
    'measurement_health',jsonb_build_object('understanding',v_understanding_state,'operator',v_operator_state,'conversion_funnel',v_funnel_state,'outcomes',v_outcome_state,'attribution',v_attr_state,'unsupported_businesses',v_unsupported_businesses,'not_measured',jsonb_build_array('stale_context_failure_count','abandoned_conversation_count','first_contact_resolution'))
  );
end;
$$;
revoke all on function public.dabbir_owner_quality_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_owner_quality_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) to service_role;
comment on function public.dabbir_owner_quality_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) is 'Server-only outcome-grounded conversation/cognitive/business quality measurement. No self-rating and no false zero for unmeasured states.';
