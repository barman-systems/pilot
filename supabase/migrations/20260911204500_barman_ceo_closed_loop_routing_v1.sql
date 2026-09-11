-- BARMAN Executive OS closed-loop routing refinement v1.
-- Closes the remaining ordering gap: REALITY -> UNDERSTANDING -> DECISION -> LANE -> ACTION.
-- Reuses the existing executive tables, Vercel cron, execution lanes and verifier.

create or replace function public.barman_executive_observe_v1(p_observation jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_observed_at timestamptz;
  v_source text;
  v_subject text;
  v_confidence numeric;
  v_freshness text;
  v_status text;
  v_health_id bigint;
  v_evidence jsonb;
  v_infra_healthy boolean:=false;
  v_measurement_overall text;
  v_funnel_coverage text;
  v_quality_coverage text;
  v_cost_coverage text;
  v_regression_count integer:=0;
  v_product_health text;
  v_customer_health text;
  v_economic_health text;
  v_strategic_health text;
  v_dimensions jsonb;
begin
  if jsonb_typeof(coalesce(p_observation,'{}'::jsonb)) <> 'object' then raise exception 'REALITY_OBSERVATION_OBJECT_REQUIRED'; end if;
  begin v_observed_at := (p_observation->>'observed_at')::timestamptz; exception when others then raise exception 'REALITY_OBSERVED_AT_INVALID'; end;
  if v_observed_at is null then raise exception 'REALITY_OBSERVED_AT_REQUIRED'; end if;
  v_source := left(btrim(coalesce(p_observation->>'source','')),120);
  v_subject := left(btrim(coalesce(p_observation->>'subject','DABBIR production reality')),240);
  if v_source='' then raise exception 'REALITY_SOURCE_REQUIRED'; end if;
  begin v_confidence := greatest(0,least(1,coalesce((p_observation->>'confidence')::numeric,0))); exception when others then raise exception 'REALITY_CONFIDENCE_INVALID'; end;
  begin v_infra_healthy := coalesce((p_observation#>>'{snapshot,healthy}')::boolean,false); exception when others then v_infra_healthy:=false; end;
  v_freshness := case when v_observed_at > now()+interval '1 minute' then 'INVALID_FUTURE' when v_observed_at >= now()-interval '10 minutes' then 'FRESH' else 'STALE' end;
  v_evidence := case when jsonb_typeof(p_observation->'evidence_refs')='array' then p_observation->'evidence_refs' else '[]'::jsonb end;

  v_measurement_overall:=upper(coalesce(p_observation#>>'{measurement,measurement_health,overall}','NOT_MEASURED'));
  v_funnel_coverage:=upper(coalesce(p_observation#>>'{measurement,measurement_health,funnel}','NOT_MEASURED'));
  v_quality_coverage:=upper(coalesce(p_observation#>>'{measurement,measurement_health,quality}','NOT_MEASURED'));
  v_cost_coverage:=upper(coalesce(p_observation#>>'{measurement,measurement_health,usage_cost}','NOT_MEASURED'));
  if jsonb_typeof(p_observation#>'{measurement,regression_warnings}')='array' then v_regression_count:=jsonb_array_length(p_observation#>'{measurement,regression_warnings}'); end if;

  v_product_health:=case when v_regression_count>0 then 'DEGRADED' when v_funnel_coverage='COMPLETE' and v_quality_coverage='COMPLETE' then 'NO_REGRESSION_SIGNAL' else 'UNPROVEN' end;
  v_customer_health:=case when v_regression_count>0 then 'DEGRADED' when v_funnel_coverage='COMPLETE' then 'NO_REGRESSION_SIGNAL' else 'UNPROVEN' end;
  v_economic_health:=case when v_regression_count>0 then 'DEGRADED' when v_cost_coverage='COMPLETE' then 'NO_REGRESSION_SIGNAL' else 'UNPROVEN' end;
  v_strategic_health:=case when v_regression_count>0 then 'DEGRADED' when v_measurement_overall='COMPLETE' then 'NO_REGRESSION_SIGNAL' else 'UNPROVEN' end;
  v_dimensions:=jsonb_build_object(
    'infrastructure',case when v_infra_healthy then 'HEALTHY' else 'DEGRADED' end,
    'runtime',case when v_infra_healthy then 'HEALTHY' else 'DEGRADED' end,
    'product',v_product_health,
    'customer',v_customer_health,
    'economic',v_economic_health,
    'strategic',v_strategic_health,
    'measurement_coverage',v_measurement_overall,
    'regression_warnings',v_regression_count
  );
  v_status:=case
    when v_freshness<>'FRESH' then 'DEGRADED'
    when not v_infra_healthy then 'DEGRADED'
    when v_measurement_overall<>'COMPLETE' then 'DEGRADED'
    when v_regression_count>0 then 'DEGRADED'
    else 'HEALTHY'
  end;

  insert into dabbir_private.executive_health_checks(component,status,checked_at,details,evidence)
  values('BARMAN Executive OS / REALITY',v_status,now(),coalesce(p_observation,'{}'::jsonb)||jsonb_build_object(
    'source',v_source,'subject',v_subject,'observed_at',v_observed_at,'freshness',v_freshness,'confidence',v_confidence,
    'age_seconds',greatest(0,extract(epoch from now()-v_observed_at)::integer),'health_dimensions',v_dimensions
  ),v_evidence) returning id into v_health_id;

  if v_freshness<>'FRESH' then
    insert into dabbir_private.executive_incidents(incident_key,project_key,severity,status,title,root_cause,containment,evidence,detected_at,resolved_at)
    values('BARMAN-REALITY-FRESHNESS-GAP','DABBIR','HIGH','OPEN','DABBIR CEO external reality is stale','The executive runtime has no sufficiently fresh external observation.','Fail closed for autonomous decisions until a fresh observation is recorded.',jsonb_build_array(jsonb_build_object('health_check_id',v_health_id,'observed_at',v_observed_at,'source',v_source)),now(),null)
    on conflict (incident_key) do update set status='OPEN',severity='HIGH',title=excluded.title,root_cause=excluded.root_cause,containment=excluded.containment,evidence=excluded.evidence,resolved_at=null;
  else
    update dabbir_private.executive_incidents set status='RESOLVED',resolution='Fresh external reality observation restored.',resolved_at=now() where incident_key='BARMAN-REALITY-FRESHNESS-GAP' and status<>'RESOLVED';
  end if;

  return jsonb_build_object('ok',true,'health_check_id',v_health_id,'source',v_source,'subject',v_subject,'observed_at',v_observed_at,'freshness',v_freshness,'confidence',v_confidence,'executive_status',v_status,'health_dimensions',v_dimensions);
end;
$function$;

create or replace function public.barman_executive_pending_for_routing_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_reality dabbir_private.executive_health_checks%rowtype;
  v_observed_at timestamptz;
  v_goals jsonb:='[]'::jsonb;
  v_memories jsonb:='[]'::jsonb;
begin
  select * into v_reality from dabbir_private.executive_health_checks where component='BARMAN Executive OS / REALITY' order by checked_at desc limit 1;
  if found then begin v_observed_at:=(v_reality.details->>'observed_at')::timestamptz; exception when others then v_observed_at:=null; end; end if;
  if v_observed_at is null or v_observed_at<now()-interval '10 minutes' or v_observed_at>now()+interval '1 minute' then
    return jsonb_build_object('ok',true,'found',false,'reason','STALE_REALITY','observed_at',v_observed_at);
  end if;

  select c.* into v_command
  from dabbir_private.dabbir_ceo_commands c
  where c.status in ('QUEUED','ACCEPTED')
    and not exists(select 1 from dabbir_private.executive_decisions d where d.command_id=c.id)
  order by case c.priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end,c.created_at
  limit 1;
  if not found then return jsonb_build_object('ok',true,'found',false,'reason','NO_UNDERSTOOD_WORK'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'title',g.title,'objective',g.objective,'priority',g.priority,'success_metrics',g.success_metrics) order by g.priority,g.created_at),'[]'::jsonb)
  into v_goals from dabbir_private.executive_goals g where lower(g.project_key)='dabbir' and g.status='active';

  select coalesce(jsonb_agg(x.item),'[]'::jsonb) into v_memories from (
    select jsonb_build_object('id',m.id,'memory_key',m.memory_key,'confidence',m.confidence,'lesson',m.value->>'lesson','route',m.value->>'route','execution_lane',m.value->>'execution_lane','goal_impact',m.value->>'goal_impact','evidence_ref',m.value->>'evidence_ref') item
    from dabbir_private.executive_memory m
    where m.project_key='DABBIR' and m.scope in ('DECISION','KNOWLEDGE') and m.superseded_by is null and (m.valid_until is null or m.valid_until>now()) and m.confidence>=0.5
    order by m.confidence desc,m.created_at desc limit 8
  ) x;

  return jsonb_build_object('ok',true,'found',true,'command',jsonb_build_object(
    'id',v_command.id,'command_text',v_command.command_text,'priority',v_command.priority,'objective',v_command.objective,
    'acceptance_criteria',v_command.acceptance_criteria,'risk_level',v_command.risk_level,'parent_command_id',v_command.parent_command_id,'rollback_plan',v_command.rollback_plan
  ),'goals',v_goals,'memories',v_memories,'reality',jsonb_build_object('health_check_id',v_reality.id,'observed_at',v_observed_at,'status',v_reality.status,'details',v_reality.details,'evidence',v_reality.evidence));
end;
$function$;

create or replace function public.barman_executive_route_pending_v1(p_command_id uuid,p_route jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_event dabbir_private.executive_events%rowtype;
  v_reality dabbir_private.executive_health_checks%rowtype;
  v_route text:=upper(btrim(coalesce(p_route->>'route','')));
  v_risk text:=upper(btrim(coalesce(p_route->>'risk_level','MEDIUM')));
  v_reason text:=left(btrim(coalesce(p_route->>'reason','SEMANTIC_EXECUTION_ROUTE')),2000);
  v_lane text;
  v_block_reason text;
  v_decision_id uuid:=gen_random_uuid();
  v_goal_id uuid;
  v_goal_title text;
  v_situation jsonb;
  v_memory_refs jsonb:='[]'::jsonb;
  v_requested_count integer:=0;
  v_valid_count integer:=0;
  v_owner_required boolean:=false;
  v_observed_at timestamptz;
begin
  if p_command_id is null then raise exception 'COMMAND_ID_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_route,'{}'::jsonb))<>'object' then raise exception 'SEMANTIC_ROUTE_OBJECT_REQUIRED'; end if;
  if v_route not in ('RUNTIME_STATUS','REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED','OWNER_GATE','MULTI_STEP') then raise exception 'SEMANTIC_ROUTE_INVALID'; end if;
  if v_risk not in ('LOW','MEDIUM','HIGH','CRITICAL') then v_risk:='MEDIUM'; end if;

  select * into v_command from dabbir_private.dabbir_ceo_commands where id=p_command_id for update;
  if not found then raise exception 'COMMAND_NOT_FOUND'; end if;
  if v_command.status not in ('QUEUED','ACCEPTED') then raise exception 'COMMAND_NOT_PENDING_ROUTING'; end if;
  if exists(select 1 from dabbir_private.executive_decisions d where d.command_id=v_command.id) then raise exception 'COMMAND_ALREADY_DECIDED'; end if;

  select * into v_reality from dabbir_private.executive_health_checks where component='BARMAN Executive OS / REALITY' order by checked_at desc limit 1;
  if found then begin v_observed_at:=(v_reality.details->>'observed_at')::timestamptz; exception when others then v_observed_at:=null; end; end if;
  if v_observed_at is null or v_observed_at<now()-interval '10 minutes' or v_observed_at>now()+interval '1 minute' then raise exception 'STALE_REALITY'; end if;

  if jsonb_typeof(p_route->'memory_refs_used')='array' then
    select count(*) into v_requested_count from jsonb_array_elements(p_route->'memory_refs_used');
    with requested as (
      select distinct value::bigint id from jsonb_array_elements_text(p_route->'memory_refs_used') where value ~ '^[0-9]+$'
    ), valid as (
      select m.* from dabbir_private.executive_memory m join requested r on r.id=m.id
      where m.project_key='DABBIR' and m.scope in ('DECISION','KNOWLEDGE') and m.superseded_by is null and (m.valid_until is null or m.valid_until>now()) and m.confidence>=0.5
    )
    select count(*),coalesce(jsonb_agg(jsonb_build_object('id',id,'memory_key',memory_key,'confidence',confidence,'lesson',value->>'lesson','evidence_ref',value->>'evidence_ref')),'[]'::jsonb)
    into v_valid_count,v_memory_refs from valid;
    if v_valid_count<>v_requested_count then raise exception 'EXECUTIVE_MEMORY_REF_INVALID'; end if;
  end if;

  select g.id,g.title into v_goal_id,v_goal_title
  from dabbir_private.executive_goals g
  where lower(g.project_key)='dabbir' and g.status='active'
  order by
    case when lower(g.title)=lower(coalesce(p_route#>>'{situation,affected_goal}','')) then 0
         when (coalesce(v_command.objective,'')||' '||v_command.command_text) ~* '(barman|ceo|executive|مدير تنفيذي|الرئيس التنفيذي)' and (g.title||' '||g.objective) ~* '(barman|ceo|executive|مدير تنفيذي|الرئيس التنفيذي)' then 1
         else 2 end,
    g.priority,g.created_at
  limit 1;

  v_owner_required:=v_route='OWNER_GATE' or btrim(v_command.command_text) ~* '(otp|one[- ]time password|kyc|اعرف عميلك|رمز تحقق|رمز التحقق|توقيع قانوني|legal signature|دفع مالي|تحويل مالي|بيانات بطاقة|card details)';
  v_lane:=case v_route when 'RUNTIME_STATUS' then 'runtime' when 'DATA_QUERY' then 'read_only' when 'REPO_CHANGE' then 'tool_agent' when 'MULTI_STEP' then 'planner' else null end;
  v_block_reason:=case when v_owner_required then 'OWNER_REQUIRED' when v_route='EXTERNAL_ACTION' then 'EXTERNAL_ACTION_EXECUTOR_UNAVAILABLE' when v_route='REVIEW_REQUIRED' then 'REVIEW_REQUIRED_NO_SAFE_EXECUTION_CLASS' else null end;
  v_situation:=coalesce(p_route->'situation','{}'::jsonb)||jsonb_build_object(
    'affected_goal',jsonb_build_object('id',v_goal_id,'title',v_goal_title),
    'freshness','FRESH','observed_at',v_observed_at,'reality_health_check_id',v_reality.id,
    'reality_status',v_reality.status,'health_dimensions',coalesce(v_reality.details->'health_dimensions','{}'::jsonb),
    'memory_refs_used',v_memory_refs
  );

  insert into dabbir_private.executive_decisions(id,command_id,context,options,decision,reason,decided_by,owner_required,effects)
  values(v_decision_id,v_command.id,v_situation::text,
    case when jsonb_typeof(p_route->'options')='array' then p_route->'options' else jsonb_build_array(v_route,'REVIEW_REQUIRED') end,
    v_route,v_reason,'BARMAN Executive OS',v_owner_required,
    jsonb_build_object('situation',v_situation,'semantic_route',v_route,'semantic_risk',v_risk,'goal_id',v_goal_id,'goal_title',v_goal_title,
      'expected_outcome',jsonb_build_object('command_status','VERIFIED','goal_impact','MEASURE_AFTER_VERIFICATION'),
      'rollback',coalesce(v_command.rollback_plan,'{}'::jsonb),'execution_lane',v_lane,
      'required_phases',coalesce(p_route->'required_phases','[]'::jsonb),'understanding_source',coalesce(nullif(p_route->>'understanding_source',''),'AI_GATEWAY'),
      'memory_refs_used',v_memory_refs,'reality_health_check_id',v_reality.id,'decided_at',now())
  );

  if v_block_reason is not null then
    update dabbir_private.dabbir_ceo_commands set status='BLOCKED',orchestration_state='BLOCKED',verification_status='FAILED',risk_level=v_risk,
      blocked_reason=v_block_reason,result_summary=case when v_owner_required then 'يتطلب هذا الإجراء صلاحية المالك ولا يمكن تنفيذه ذاتيًا.' else 'لا يوجد مسار تنفيذ ذاتي آمن لهذا الطلب ضمن الصلاحيات الحالية.' end,
      completed_at=now(),lease_until=null,worker_id=null,updated_at=now(),
      execution_plan=coalesce(execution_plan,'{}'::jsonb)||jsonb_build_object('decision_id',v_decision_id,'goal_id',v_goal_id,'semantic_route',v_route,'required_phases',coalesce(p_route->'required_phases','[]'::jsonb))
    where id=v_command.id;
    select * into v_event from dabbir_private.executive_events where source='owner-directive' and kind='ceo_command' and external_ref=v_command.id::text order by detected_at desc limit 1;
    if found then update dabbir_private.executive_events set status='escalated',resolved_at=now(),payload=payload||jsonb_build_object('decision_id',v_decision_id,'semantic_route',v_route,'blocked_reason',v_block_reason) where id=v_event.id; end if;
    insert into dabbir_private.executive_audit_logs(command_id,actor,action,project_key,reason,result,metadata)
    values(v_command.id,'BARMAN Executive OS','EXECUTIVE_DECISION','DABBIR',v_reason,'BLOCKED',jsonb_build_object('decision_id',v_decision_id,'semantic_route',v_route,'goal_id',v_goal_id,'memory_refs_used',v_memory_refs));
    return jsonb_build_object('ok',true,'routed',true,'executable',false,'command_id',v_command.id,'decision_id',v_decision_id,'route',v_route,'blocked_reason',v_block_reason,'goal_id',v_goal_id,'memory_refs_used',v_memory_refs);
  end if;

  update dabbir_private.dabbir_ceo_commands set execution_lane=v_lane,risk_level=v_risk,orchestration_state='QUEUED',updated_at=now(),
    execution_plan=coalesce(execution_plan,'{}'::jsonb)||jsonb_build_object('decision_id',v_decision_id,'goal_id',v_goal_id,'semantic_route',v_route,'required_phases',coalesce(p_route->'required_phases','[]'::jsonb),'understanding_source',coalesce(nullif(p_route->>'understanding_source',''),'AI_GATEWAY'),'memory_refs_used',v_memory_refs)
  where id=v_command.id;
  update dabbir_private.executive_events set payload=payload||jsonb_build_object('decision_id',v_decision_id,'semantic_route',v_route,'execution_lane',v_lane,'goal_id',v_goal_id)
  where source='owner-directive' and kind='ceo_command' and external_ref=v_command.id::text;
  insert into dabbir_private.executive_audit_logs(command_id,actor,action,project_key,reason,result,metadata)
  values(v_command.id,'BARMAN Executive OS','EXECUTIVE_DECISION','DABBIR',v_reason,'ROUTED',jsonb_build_object('decision_id',v_decision_id,'semantic_route',v_route,'execution_lane',v_lane,'goal_id',v_goal_id,'memory_refs_used',v_memory_refs));
  return jsonb_build_object('ok',true,'routed',true,'executable',true,'command_id',v_command.id,'decision_id',v_decision_id,'route',v_route,'execution_lane',v_lane,'risk_level',v_risk,'goal_id',v_goal_id,'memory_refs_used',v_memory_refs);
end;
$function$;

create or replace function public.barman_executive_record_route_for_worker_v1(p_worker_id text,p_route jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_worker text:=left(btrim(coalesce(p_worker_id,'')),120);
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_decision dabbir_private.executive_decisions%rowtype;
  v_route text:=upper(btrim(coalesce(p_route->>'route','')));
  v_reason text:=left(btrim(coalesce(p_route->>'reason','SEMANTIC_EXECUTION_ROUTE')),2000);
  v_risk text:=upper(btrim(coalesce(p_route->>'risk_level','MEDIUM')));
  v_memories jsonb:='[]'::jsonb;
  v_requested_count integer:=0;
  v_valid_count integer:=0;
begin
  if v_worker='' then raise exception 'WORKER_ID_REQUIRED'; end if;
  if v_route not in ('RUNTIME_STATUS','REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED','OWNER_GATE','MULTI_STEP') then raise exception 'SEMANTIC_ROUTE_INVALID'; end if;
  if v_risk not in ('LOW','MEDIUM','HIGH','CRITICAL') then v_risk:='MEDIUM'; end if;
  select * into v_command from dabbir_private.dabbir_ceo_commands where worker_id=v_worker and status='IN_PROGRESS' order by updated_at desc limit 1 for update;
  if not found then raise exception 'WORKER_COMMAND_NOT_FOUND'; end if;
  select * into v_decision from dabbir_private.executive_decisions where command_id=v_command.id order by created_at desc limit 1 for update;
  if not found then raise exception 'EXECUTIVE_DECISION_NOT_FOUND'; end if;
  if upper(v_decision.decision)<>v_route then raise exception 'SEMANTIC_ROUTE_DRIFT_DENIED'; end if;

  if jsonb_typeof(p_route->'memory_refs_used')='array' then
    select count(*) into v_requested_count from jsonb_array_elements(p_route->'memory_refs_used');
    with requested as (select distinct value::bigint id from jsonb_array_elements_text(p_route->'memory_refs_used') where value ~ '^[0-9]+$'),
    valid as (select m.* from dabbir_private.executive_memory m join requested r on r.id=m.id where m.project_key='DABBIR' and m.scope in ('DECISION','KNOWLEDGE') and m.superseded_by is null and (m.valid_until is null or m.valid_until>now()) and m.confidence>=0.5)
    select count(*),coalesce(jsonb_agg(jsonb_build_object('id',id,'memory_key',memory_key,'confidence',confidence,'lesson',value->>'lesson','evidence_ref',value->>'evidence_ref')),'[]'::jsonb) into v_valid_count,v_memories from valid;
    if v_valid_count<>v_requested_count then raise exception 'EXECUTIVE_MEMORY_REF_INVALID'; end if;
  end if;

  update dabbir_private.executive_decisions set reason=v_reason,
    effects=effects||jsonb_build_object('semantic_risk',v_risk,'semantic_situation',coalesce(p_route->'situation','{}'::jsonb),'required_phases',coalesce(p_route->'required_phases','[]'::jsonb),'understanding_source',coalesce(nullif(p_route->>'understanding_source',''),'AI_GATEWAY'),'memory_refs_used',v_memories,'route_revalidated_at',now())
  where id=v_decision.id;
  return jsonb_build_object('ok',true,'command_id',v_command.id,'decision_id',v_decision.id,'route',v_route,'risk_level',v_risk,'memory_refs_used',v_memories);
end;
$function$;

create or replace function public.barman_executive_claim_v1(p_worker_id text,p_lane text,p_lease_seconds integer default 300)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_event dabbir_private.executive_events%rowtype;
  v_reality dabbir_private.executive_health_checks%rowtype;
  v_decision dabbir_private.executive_decisions%rowtype;
  v_run_id uuid:=gen_random_uuid();
  v_action_id uuid:=gen_random_uuid();
  v_goal_id uuid;
  v_worker text:=left(btrim(coalesce(p_worker_id,'')),120);
  v_lane text:=lower(left(btrim(coalesce(p_lane,'')),40));
  v_lease integer:=greatest(60,least(coalesce(p_lease_seconds,300),3600));
  v_observed_at timestamptz;
begin
  if v_worker='' then raise exception 'WORKER_ID_REQUIRED'; end if;
  if v_lane not in ('runtime','tool_agent','read_only','planner') then raise exception 'EXECUTION_LANE_INVALID'; end if;
  select * into v_reality from dabbir_private.executive_health_checks where component='BARMAN Executive OS / REALITY' order by checked_at desc limit 1;
  if found then begin v_observed_at:=(v_reality.details->>'observed_at')::timestamptz; exception when others then v_observed_at:=null; end; end if;
  if v_observed_at is null or v_observed_at<now()-interval '10 minutes' or v_observed_at>now()+interval '1 minute' then return jsonb_build_object('ok',true,'claimed',false,'reason','STALE_REALITY','observed_at',v_observed_at); end if;

  select c.* into v_command from dabbir_private.dabbir_ceo_commands c
  where c.status in ('QUEUED','ACCEPTED','IN_PROGRESS') and c.attempt_count<12 and (c.lease_until is null or c.lease_until<now())
    and c.execution_lane=v_lane and exists(select 1 from dabbir_private.executive_decisions d where d.command_id=c.id)
  order by case c.priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end,c.created_at
  for update skip locked limit 1;
  if not found then return jsonb_build_object('ok',true,'claimed',false,'reason','NO_DECIDED_WORK'); end if;
  select * into v_decision from dabbir_private.executive_decisions where command_id=v_command.id order by created_at desc limit 1;
  if v_decision.owner_required or upper(v_decision.decision) in ('OWNER_GATE','EXTERNAL_ACTION','REVIEW_REQUIRED') then raise exception 'DECISION_NOT_EXECUTABLE'; end if;
  begin v_goal_id:=(v_decision.effects->>'goal_id')::uuid; exception when others then v_goal_id:=null; end;
  select * into v_event from dabbir_private.executive_events e where e.source='owner-directive' and e.kind='ceo_command' and e.external_ref=v_command.id::text order by e.detected_at desc for update limit 1;

  update dabbir_private.dabbir_ceo_commands set status='IN_PROGRESS',orchestration_state=case when v_lane='planner' then 'PLANNING' else 'EXECUTING' end,claimed_at=coalesce(claimed_at,now()),updated_at=now(),attempt_count=attempt_count+1,
    lease_until=now()+make_interval(secs=>v_lease),worker_id=v_worker,last_error=null,
    execution_plan=coalesce(execution_plan,'{}'::jsonb)||jsonb_build_object('decision_id',v_decision.id,'goal_id',v_goal_id,'reality_health_check_id',v_reality.id)
  where id=v_command.id returning * into v_command;
  if v_event.id is not null then update dabbir_private.executive_events set status='claimed',payload=payload||jsonb_build_object('worker_id',v_worker,'execution_lane',v_lane,'claimed_at',now(),'attempt_count',v_command.attempt_count,'decision_id',v_decision.id,'goal_id',v_goal_id) where id=v_event.id returning * into v_event; end if;
  insert into dabbir_private.executive_runs(id,trigger_type,trigger_ref,status,started_at,metrics) values(v_run_id,'owner',v_command.id::text,'running',now(),jsonb_build_object('worker_id',v_worker,'lane',v_lane,'attempt',v_command.attempt_count,'decision_id',v_decision.id,'goal_id',v_goal_id,'reality_health_check_id',v_reality.id));
  insert into dabbir_private.executive_actions(id,run_id,event_id,goal_id,action_type,authority_level,status,description,owner_interruption,started_at)
  values(v_action_id,v_run_id,v_event.id,v_goal_id,case when v_lane='planner' then 'plan_owner_command' when v_lane='read_only' then 'read_owner_data' else 'execute_owner_command' end,'auto','running',v_command.command_text,false,now());
  update dabbir_private.executive_decisions set effects=effects||jsonb_build_object('run_id',v_run_id,'action_id',v_action_id,'claimed_at',now()) where id=v_decision.id;
  return jsonb_build_object('ok',true,'claimed',true,'command',to_jsonb(v_command),'event_id',v_event.id,'run_id',v_run_id,'action_id',v_action_id,'decision_id',v_decision.id,'goal_id',v_goal_id,'situation',coalesce(v_decision.effects->'situation','{}'::jsonb));
end;
$function$;

create or replace function public.barman_executive_self_diagnostic_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_broken integer;v_partial integer;v_retired integer;v_stale integer;v_queue integer;v_weak integer;v_legacy_untrusted integer;v_pending_verify integer;v_cron integer;v_status text;
  v_reality_at timestamptz;v_reality_age integer;v_reality_fresh boolean:=false;v_reality_status text;v_dimensions jsonb:='{}'::jsonb;
begin
  select count(*) into v_broken from dabbir_private.executive_integrations where status in ('BROKEN','MISSING','UNAUTHORIZED');
  select count(*) into v_partial from dabbir_private.executive_integrations where status='PARTIAL';
  select count(*) into v_retired from dabbir_private.executive_integrations where status='RETIRED';
  select count(*) into v_stale from dabbir_private.dabbir_ceo_commands where status='IN_PROGRESS' and coalesce(lease_until,now()-interval '1 second')<now();
  select count(*) into v_queue from dabbir_private.dabbir_ceo_commands where status='QUEUED';
  select count(*) into v_pending_verify from dabbir_private.dabbir_ceo_commands where status='DONE' and verification_status='INDEPENDENT_REQUIRED';
  select count(*) into v_weak from dabbir_private.executive_evidence where verified=true and coalesce(verification_method,'') in ('','LEGACY_SELF_ASSERTED','SELF_ASSERTED');
  select count(*) into v_legacy_untrusted from dabbir_private.executive_evidence where verified=false and coalesce(verification_method,'') in ('LEGACY_SELF_ASSERTED','SELF_ASSERTED');
  select count(*) into v_cron from cron.job where active=true and jobname in ('barman-executive-rollup','barman-executive-heartbeat');
  select status,(details->>'observed_at')::timestamptz,coalesce(details->'health_dimensions','{}'::jsonb) into v_reality_status,v_reality_at,v_dimensions
  from dabbir_private.executive_health_checks where component='BARMAN Executive OS / REALITY' order by checked_at desc limit 1;
  if v_reality_at is not null then v_reality_age:=greatest(0,extract(epoch from now()-v_reality_at)::integer);v_reality_fresh:=v_reality_at>=now()-interval '10 minutes' and v_reality_at<=now()+interval '1 minute'; end if;
  v_status:=case when v_broken>0 then 'PARTIAL' when not v_reality_fresh or coalesce(v_reality_status,'DEGRADED')<>'HEALTHY' or v_stale>0 or v_cron<2 or v_pending_verify>0 or v_weak>0 or v_partial>0 then 'DEGRADED' else 'HEALTHY' end;
  return jsonb_build_object('ok',true,'service','BARMAN Executive OS','status',v_status,'autonomy_level','A3','canonical_database','fphpoysqdsceniwduxjq',
    'reality',jsonb_build_object('observed_at',v_reality_at,'age_seconds',v_reality_age,'fresh',v_reality_fresh,'status',v_reality_status,'health_dimensions',v_dimensions),
    'metrics',jsonb_build_object('broken_integrations',v_broken,'partial_integrations',v_partial,'retired_integrations',v_retired,'queued_commands',v_queue,'stale_in_progress',v_stale,'commands_waiting_independent_verification',v_pending_verify,'weak_verified_evidence',v_weak,'legacy_untrusted_evidence',v_legacy_untrusted,'active_core_cron_jobs',v_cron),'checked_at',now());
end;
$function$;

revoke all on function public.barman_executive_observe_v1(jsonb) from public,anon,authenticated;
revoke all on function public.barman_executive_pending_for_routing_v1() from public,anon,authenticated;
revoke all on function public.barman_executive_route_pending_v1(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.barman_executive_record_route_for_worker_v1(text,jsonb) from public,anon,authenticated;
revoke all on function public.barman_executive_claim_v1(text,text,integer) from public,anon,authenticated;
revoke all on function public.barman_executive_self_diagnostic_v1() from public,anon,authenticated;
grant execute on function public.barman_executive_observe_v1(jsonb) to service_role;
grant execute on function public.barman_executive_pending_for_routing_v1() to service_role;
grant execute on function public.barman_executive_route_pending_v1(uuid,jsonb) to service_role;
grant execute on function public.barman_executive_record_route_for_worker_v1(text,jsonb) to service_role;
grant execute on function public.barman_executive_claim_v1(text,text,integer) to service_role;
grant execute on function public.barman_executive_self_diagnostic_v1() to service_role;

comment on function public.barman_executive_pending_for_routing_v1() is 'Returns one fresh-reality pending CEO command plus active goals and verified memories for semantic understanding before execution lane selection.';
comment on function public.barman_executive_route_pending_v1(uuid,jsonb) is 'Persists Situation and Decision, validates exact memory references, then assigns an existing execution lane or fails closed before any Action exists.';
