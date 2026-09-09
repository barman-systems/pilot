-- DABBIR Intelligence Flywheel V1 clarification-truth follow-up.
-- A first, necessary clarification is safe behavior, not an AI failure.
-- Only repeated or unresolved clarification is mined as friction.

create or replace function public.dabbir_ai_eval_ingest_recent_v1(p_since interval default interval '24 hours',p_limit integer default 500)
returns integer
language plpgsql security definer
set search_path = pg_catalog, public
as $fn$
declare n integer:=0;
begin
  with parsed as (
    select e.*,
      case
        when char_length(coalesce(e.metrics->>'operational_confidence',''))<=32
          and coalesce(e.metrics->>'operational_confidence','') ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
        then least(1::numeric,greatest(0::numeric,(e.metrics->>'operational_confidence')::numeric))
        else 1::numeric
      end as operational_confidence_value,
      case
        when char_length(coalesce(e.metrics->>'clarification_count',''))<=12
          and coalesce(e.metrics->>'clarification_count','') ~ '^[0-9]+$'
        then least(1000,(e.metrics->>'clarification_count')::integer)
        else 0
      end as clarification_count_value,
      case
        when char_length(coalesce(e.metrics->>'unresolved_count',''))<=12
          and coalesce(e.metrics->>'unresolved_count','') ~ '^[0-9]+$'
        then least(1000,(e.metrics->>'unresolved_count')::integer)
        else 0
      end as unresolved_count_value
    from public.dabbir_ai_understanding_events e
    where e.created_at>=now()-least(greatest(coalesce(p_since,interval '24 hours'),interval '1 hour'),interval '30 days')
  ), candidates as (
    select p.*,
      case
        when coalesce(p.metrics->>'planner_failure_code','')<>'' then 'PLANNER_FAILURE'
        when upper(coalesce(p.metrics->>'action',''))='HANDOFF' then 'HANDOFF'
        when upper(coalesce(p.metrics->>'action',''))='CLARIFY'
          and (p.clarification_count_value>=2 or p.unresolved_count_value>0) then 'CLARIFICATION_FRICTION'
        when upper(coalesce(p.metrics->>'action',''))='CLARIFY' then null
        when p.operational_confidence_value<0.65 then 'LOW_OPERATIONAL_CONFIDENCE'
        else null
      end as mined_failure_class
    from parsed p
  )
  insert into public.dabbir_ai_eval_cases(source_event_id,business_id,conversation_id,batch_id,event_type,failure_class,metrics,created_at,updated_at)
  select e.id,e.business_id,e.conversation_id,e.batch_id,e.event_type,e.mined_failure_class,
    jsonb_strip_nulls(jsonb_build_object(
      'intent',e.metrics->>'intent','action',e.metrics->>'action','tool_selection',e.metrics->>'tool_selection',
      'planner_failure_code',e.metrics->>'planner_failure_code','semantic_interpreter',e.metrics->>'semantic_interpreter',
      'semantic_override',e.metrics->>'semantic_override','semantic_confidence',e.metrics->'semantic_confidence',
      'operational_confidence',e.metrics->'operational_confidence','missing_count',e.metrics->'missing_count',
      'unresolved_count',e.metrics->'unresolved_count','clarification_count',e.metrics->'clarification_count',
      'voice',e.metrics->'voice','session_reset',e.metrics->'session_reset')),
    e.created_at,now()
  from candidates e
  where e.mined_failure_class is not null
  order by e.created_at asc
  limit least(greatest(coalesce(p_limit,500),1),2000)
  on conflict (source_event_id) do nothing;
  get diagnostics n=row_count;
  return n;
end $fn$;

-- Repair only the new flywheel evidence produced by V1. Preserve source events.
update public.dabbir_ai_eval_cases e
set status='dismissed',updated_at=now()
where e.failure_class='CLARIFICATION'
  and not (
    (case when char_length(coalesce(e.metrics->>'clarification_count',''))<=12
      and coalesce(e.metrics->>'clarification_count','') ~ '^[0-9]+$'
      then least(1000,(e.metrics->>'clarification_count')::integer) else 0 end)>=2
    or
    (case when char_length(coalesce(e.metrics->>'unresolved_count',''))<=12
      and coalesce(e.metrics->>'unresolved_count','') ~ '^[0-9]+$'
      then least(1000,(e.metrics->>'unresolved_count')::integer) else 0 end)>0
  );

update public.dabbir_ai_eval_cases
set failure_class='CLARIFICATION_FRICTION',updated_at=now()
where failure_class='CLARIFICATION' and status='open';

update public.dabbir_ai_improvement_proposals p
set status='superseded',reviewed_at=coalesce(p.reviewed_at,now())
from public.dabbir_ai_failure_clusters c
where p.cluster_id=c.id and c.failure_class='CLARIFICATION' and p.status='proposed';

create or replace function public.dabbir_ai_failure_mine_v1(p_since interval default interval '7 days')
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $fn$
declare ingested integer:=0; clusters integer:=0; proposals integer:=0;
begin
  ingested:=public.dabbir_ai_eval_ingest_recent_v1(least(greatest(coalesce(p_since,interval '7 days'),interval '1 hour'),interval '30 days'),2000);
  with grouped as (
    select md5(concat_ws('|',failure_class,coalesce(metrics->>'intent',''),coalesce(metrics->>'action',''),coalesce(metrics->>'tool_selection',''),coalesce(metrics->>'planner_failure_code',''))) as cluster_key,
      failure_class,metrics->>'intent' as intent,metrics->>'action' as action,metrics->>'tool_selection' as reason_code,
      nullif(metrics->>'planner_failure_code','') as planner_failure_code,count(*)::bigint as occurrences,
      min(created_at) as first_seen,max(created_at) as last_seen,
      jsonb_build_object(
        'avg_semantic_confidence',round(avg(
          case
            when char_length(coalesce(metrics->>'semantic_confidence',''))<=32
              and coalesce(metrics->>'semantic_confidence','') ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
            then least(1::numeric,greatest(0::numeric,(metrics->>'semantic_confidence')::numeric))
            else 0::numeric
          end
        ),3),
        'avg_operational_confidence',round(avg(
          case
            when char_length(coalesce(metrics->>'operational_confidence',''))<=32
              and coalesce(metrics->>'operational_confidence','') ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
            then least(1::numeric,greatest(0::numeric,(metrics->>'operational_confidence')::numeric))
            else 0::numeric
          end
        ),3),
        'voice_cases',count(*) filter (where lower(coalesce(metrics->>'voice',''))='true')) as evidence
    from public.dabbir_ai_eval_cases
    where status='open'
      and created_at>=now()-least(greatest(coalesce(p_since,interval '7 days'),interval '1 hour'),interval '30 days')
    group by failure_class,metrics->>'intent',metrics->>'action',metrics->>'tool_selection',metrics->>'planner_failure_code'
  )
  insert into public.dabbir_ai_failure_clusters(cluster_key,failure_class,intent,action,reason_code,planner_failure_code,occurrences,first_seen,last_seen,evidence,updated_at)
  select cluster_key,failure_class,intent,action,reason_code,planner_failure_code,occurrences,first_seen,last_seen,evidence,now() from grouped
  on conflict (cluster_key) do update set occurrences=excluded.occurrences,first_seen=least(public.dabbir_ai_failure_clusters.first_seen,excluded.first_seen),
    last_seen=greatest(public.dabbir_ai_failure_clusters.last_seen,excluded.last_seen),evidence=excluded.evidence,updated_at=now();
  get diagnostics clusters=row_count;

  insert into public.dabbir_ai_improvement_proposals(cluster_id,proposal_type,recommended_action,evidence,status)
  select c.id,'EVAL_DRIVEN_REVIEW',
    jsonb_build_object('mode','proposal_only','auto_apply',false,'review_target',
      case when c.failure_class='CLARIFICATION_FRICTION' then 'grounding_or_retrieval'
           when c.failure_class='PLANNER_FAILURE' then 'provider_contract_or_fallback'
           when c.failure_class='LOW_OPERATIONAL_CONFIDENCE' then 'entity_requirements_or_evidence'
           else 'journey_or_handoff' end),
    jsonb_build_object('failure_class',c.failure_class,'intent',c.intent,'action',c.action,'reason_code',c.reason_code,'occurrences',c.occurrences,'window',p_since::text),
    'proposed'
  from public.dabbir_ai_failure_clusters c
  where c.last_seen>=now()-least(greatest(coalesce(p_since,interval '7 days'),interval '1 hour'),interval '30 days')
    and c.occurrences>=2
    and exists (
      select 1 from public.dabbir_ai_eval_cases e
      where e.status='open'
        and md5(concat_ws('|',e.failure_class,coalesce(e.metrics->>'intent',''),coalesce(e.metrics->>'action',''),coalesce(e.metrics->>'tool_selection',''),coalesce(e.metrics->>'planner_failure_code','')))=c.cluster_key
    )
  on conflict (cluster_id,proposal_type) do update set evidence=excluded.evidence,recommended_action=excluded.recommended_action
    where public.dabbir_ai_improvement_proposals.status='proposed';
  get diagnostics proposals=row_count;
  return jsonb_build_object('ok',true,'cases_ingested',ingested,'clusters_updated',clusters,'proposals_touched',proposals,'auto_apply',false);
end $fn$;

revoke all on function public.dabbir_ai_eval_ingest_recent_v1(interval,integer) from public, anon, authenticated;
revoke all on function public.dabbir_ai_failure_mine_v1(interval) from public, anon, authenticated;
grant execute on function public.dabbir_ai_eval_ingest_recent_v1(interval,integer) to service_role;
grant execute on function public.dabbir_ai_failure_mine_v1(interval) to service_role;
