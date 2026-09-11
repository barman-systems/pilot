-- BARMAN Executive OS closed-loop repair v1.
-- Reuses the existing executive tables and execution/verifier trust boundary.
-- No parallel CEO/agent/model/schema is introduced.

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
begin
  if jsonb_typeof(coalesce(p_observation,'{}'::jsonb)) <> 'object' then
    raise exception 'REALITY_OBSERVATION_OBJECT_REQUIRED';
  end if;
  begin
    v_observed_at := (p_observation->>'observed_at')::timestamptz;
  exception when others then
    raise exception 'REALITY_OBSERVED_AT_INVALID';
  end;
  if v_observed_at is null then raise exception 'REALITY_OBSERVED_AT_REQUIRED'; end if;
  v_source := left(btrim(coalesce(p_observation->>'source','')),120);
  v_subject := left(btrim(coalesce(p_observation->>'subject','DABBIR production reality')),240);
  if v_source='' then raise exception 'REALITY_SOURCE_REQUIRED'; end if;
  begin
    v_confidence := greatest(0,least(1,coalesce((p_observation->>'confidence')::numeric,0)));
  exception when others then
    raise exception 'REALITY_CONFIDENCE_INVALID';
  end;
  v_freshness := case
    when v_observed_at > now()+interval '1 minute' then 'INVALID_FUTURE'
    when v_observed_at >= now()-interval '10 minutes' then 'FRESH'
    else 'STALE'
  end;
  v_status := case when v_freshness='FRESH' then 'HEALTHY' else 'DEGRADED' end;
  v_evidence := case when jsonb_typeof(p_observation->'evidence_refs')='array' then p_observation->'evidence_refs' else '[]'::jsonb end;

  insert into dabbir_private.executive_health_checks(component,status,checked_at,details,evidence)
  values(
    'BARMAN Executive OS / REALITY',v_status,now(),
    coalesce(p_observation,'{}'::jsonb)||jsonb_build_object(
      'source',v_source,'subject',v_subject,'observed_at',v_observed_at,
      'freshness',v_freshness,'confidence',v_confidence,
      'age_seconds',greatest(0,extract(epoch from now()-v_observed_at)::integer)
    ),
    v_evidence
  ) returning id into v_health_id;

  if v_freshness<>'FRESH' then
    insert into dabbir_private.executive_incidents(
      incident_key,project_key,severity,status,title,root_cause,containment,evidence,detected_at,resolved_at
    ) values(
      'BARMAN-REALITY-FRESHNESS-GAP','DABBIR','HIGH','OPEN',
      'DABBIR CEO external reality is stale',
      'The executive runtime has no sufficiently fresh external observation.',
      'Fail closed for autonomous decisions until a fresh observation is recorded.',
      jsonb_build_array(jsonb_build_object('health_check_id',v_health_id,'observed_at',v_observed_at,'source',v_source)),
      now(),null
    ) on conflict (incident_key) do update
      set status='OPEN',severity='HIGH',title=excluded.title,root_cause=excluded.root_cause,
          containment=excluded.containment,evidence=excluded.evidence,resolved_at=null;
  else
    update dabbir_private.executive_incidents
    set status='RESOLVED',resolution='Fresh external reality observation restored.',resolved_at=now()
    where incident_key='BARMAN-REALITY-FRESHNESS-GAP' and status<>'RESOLVED';
  end if;

  return jsonb_build_object(
    'ok',true,'health_check_id',v_health_id,'source',v_source,'subject',v_subject,
    'observed_at',v_observed_at,'freshness',v_freshness,'confidence',v_confidence
  );
end;
$function$;

create or replace function public.barman_executive_context_for_worker_v1(p_worker_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_worker text:=left(btrim(coalesce(p_worker_id,'')),120);
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_decision dabbir_private.executive_decisions%rowtype;
  v_memories jsonb:='[]'::jsonb;
begin
  if v_worker='' then raise exception 'WORKER_ID_REQUIRED'; end if;
  select * into v_command from dabbir_private.dabbir_ceo_commands
  where worker_id=v_worker and status='IN_PROGRESS'
  order by updated_at desc limit 1;
  if not found then return jsonb_build_object('ok',true,'found',false); end if;
  select * into v_decision from dabbir_private.executive_decisions
  where command_id=v_command.id order by created_at desc limit 1;
  select coalesce(jsonb_agg(x.item),'[]'::jsonb) into v_memories
  from (
    select jsonb_build_object(
      'id',m.id,'memory_key',m.memory_key,'confidence',m.confidence,
      'lesson',m.value->>'lesson','route',m.value->>'route','execution_lane',m.value->>'execution_lane',
      'goal_impact',m.value->>'goal_impact','evidence_ref',m.value->>'evidence_ref'
    ) as item
    from dabbir_private.executive_memory m
    where m.project_key='DABBIR'
      and m.scope in ('DECISION','KNOWLEDGE')
      and m.superseded_by is null
      and (m.valid_until is null or m.valid_until>now())
      and m.confidence>=0.5
    order by m.confidence desc,m.created_at desc
    limit 5
  ) x;
  return jsonb_build_object(
    'ok',true,'found',true,'command_id',v_command.id,'execution_lane',v_command.execution_lane,
    'risk_level',v_command.risk_level,'decision_id',v_decision.id,
    'situation',coalesce(v_decision.effects->'situation','{}'::jsonb),
    'decision',v_decision.decision,'reason',v_decision.reason,'memories',v_memories
  );
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
  v_risk text:=upper(btrim(coalesce(p_route->>'risk_level','')));
  v_memories jsonb:='[]'::jsonb;
  v_owner_required boolean:=false;
begin
  if v_worker='' then raise exception 'WORKER_ID_REQUIRED'; end if;
  if v_route not in ('REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED','OWNER_GATE','MULTI_STEP') then
    raise exception 'SEMANTIC_ROUTE_INVALID';
  end if;
  if v_risk not in ('LOW','MEDIUM','HIGH','CRITICAL') then v_risk:='MEDIUM'; end if;
  v_owner_required := v_route='OWNER_GATE';
  select * into v_command from dabbir_private.dabbir_ceo_commands
  where worker_id=v_worker and status='IN_PROGRESS'
  order by updated_at desc limit 1 for update;
  if not found then raise exception 'WORKER_COMMAND_NOT_FOUND'; end if;
  select * into v_decision from dabbir_private.executive_decisions
  where command_id=v_command.id order by created_at desc limit 1 for update;
  if not found then raise exception 'EXECUTIVE_DECISION_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(x.item),'[]'::jsonb) into v_memories
  from (
    select jsonb_build_object('id',m.id,'memory_key',m.memory_key,'confidence',m.confidence,'lesson',m.value->>'lesson','evidence_ref',m.value->>'evidence_ref') as item
    from dabbir_private.executive_memory m
    where m.project_key='DABBIR'
      and m.scope in ('DECISION','KNOWLEDGE')
      and m.superseded_by is null
      and (m.valid_until is null or m.valid_until>now())
      and m.confidence>=0.5
      and coalesce(m.value->>'route','')=v_route
    order by m.confidence desc,m.created_at desc
    limit 3
  ) x;

  update dabbir_private.executive_decisions
  set decision=v_route,
      reason=v_reason,
      owner_required=v_owner_required,
      options=case when jsonb_typeof(p_route->'options')='array' then p_route->'options' else options end,
      effects=effects||jsonb_build_object(
        'semantic_route',v_route,'semantic_risk',v_risk,
        'semantic_situation',coalesce(p_route->'situation','{}'::jsonb),
        'required_phases',coalesce(p_route->'required_phases','[]'::jsonb),
        'understanding_source',coalesce(nullif(p_route->>'understanding_source',''),'AI_GATEWAY'),
        'memory_refs',v_memories,'route_recorded_at',now()
      )
  where id=v_decision.id;

  update dabbir_private.dabbir_ceo_commands
  set risk_level=v_risk,updated_at=now()
  where id=v_command.id;

  return jsonb_build_object('ok',true,'command_id',v_command.id,'decision_id',v_decision.id,'route',v_route,'risk_level',v_risk,'owner_required',v_owner_required,'memory_refs',v_memories);
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
  v_run_id uuid:=gen_random_uuid();
  v_action_id uuid:=gen_random_uuid();
  v_decision_id uuid:=gen_random_uuid();
  v_goal_id uuid;
  v_goal_title text;
  v_worker text:=left(btrim(coalesce(p_worker_id,'')),120);
  v_lane text:=lower(left(btrim(coalesce(p_lane,'')),40));
  v_lease integer:=greatest(60,least(coalesce(p_lease_seconds,300),3600));
  v_observed_at timestamptz;
  v_situation jsonb;
  v_memory_refs jsonb:='[]'::jsonb;
  v_owner_required boolean:=false;
begin
  if v_worker='' then raise exception 'WORKER_ID_REQUIRED'; end if;
  if v_lane not in ('runtime','tool_agent','read_only','planner') then raise exception 'EXECUTION_LANE_INVALID'; end if;

  select * into v_reality
  from dabbir_private.executive_health_checks
  where component='BARMAN Executive OS / REALITY'
  order by checked_at desc limit 1;
  if found then
    begin v_observed_at:=(v_reality.details->>'observed_at')::timestamptz; exception when others then v_observed_at:=null; end;
  end if;
  if v_observed_at is null or v_observed_at<now()-interval '10 minutes' or v_observed_at>now()+interval '1 minute' then
    insert into dabbir_private.executive_incidents(
      incident_key,project_key,severity,status,title,root_cause,containment,evidence,detected_at,resolved_at
    ) values(
      'BARMAN-REALITY-FRESHNESS-GAP','DABBIR','HIGH','OPEN','DABBIR CEO external reality is stale',
      'No fresh external observation exists at autonomous decision time.',
      'Do not claim autonomous work until a fresh observation is recorded.',
      jsonb_build_array(jsonb_build_object('last_observed_at',v_observed_at,'checked_at',v_reality.checked_at)),now(),null
    ) on conflict (incident_key) do update
      set status='OPEN',severity='HIGH',root_cause=excluded.root_cause,containment=excluded.containment,evidence=excluded.evidence,resolved_at=null;
    return jsonb_build_object('ok',true,'claimed',false,'reason','STALE_REALITY','observed_at',v_observed_at);
  end if;

  select c.* into v_command
  from dabbir_private.dabbir_ceo_commands c
  where c.status in ('QUEUED','ACCEPTED','IN_PROGRESS')
    and c.attempt_count<12
    and (c.lease_until is null or c.lease_until<now())
    and coalesce(c.execution_lane,
      case
        when char_length(c.command_text)<=160
          and btrim(c.command_text) ~* '^(اعطني|أعطني|اريد|أريد|give me|show)?[[:space:]]*(تقرير|الحالة|حاله|افحص|فحص|صحة|صحه|status|report|health)([[:space:]]+(دبر|dabbir))?[[:space:]؟?!.]*$'
          then 'runtime'
        when btrim(c.command_text) ~ E'(^|\\n)[[:space:]]*([0-9]+[.)]|[-•])[[:space:]]+(.|\\n)*\\n[[:space:]]*([0-9]+[.)]|[-•])[[:space:]]+'
          then 'planner'
        when btrim(c.command_text) ~* '(راجع|افحص|حلل|دقق|audit|review|inspect|analy[sz]e)'
          and btrim(c.command_text) ~* '(نفذ|أصلح|اصلح|طوّر|طور|عدّل|عدل|implement|fix|execute|repair|develop)'
          then 'planner'
        when btrim(c.command_text) ~* '(^|[[:space:]])(كم|ما عدد|عدد|احصاء|إحصاء|إحصائية|احصائية|statistics?|count|how many|نشاط|activity)([[:space:]]|$)'
          then 'read_only'
        else 'tool_agent'
      end
    )=v_lane
  order by case c.priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end,c.created_at
  for update skip locked limit 1;
  if not found then return jsonb_build_object('ok',true,'claimed',false,'reason','NO_WORK'); end if;

  select * into v_event from dabbir_private.executive_events e
  where e.source='owner-directive' and e.kind='ceo_command' and e.external_ref=v_command.id::text
  order by e.detected_at desc for update limit 1;

  v_owner_required := btrim(v_command.command_text) ~* '(otp|one[- ]time password|kyc|اعرف عميلك|رمز تحقق|رمز التحقق|توقيع قانوني|legal signature|دفع مالي|تحويل مالي|بيانات بطاقة|card details)';

  select g.id,g.title into v_goal_id,v_goal_title
  from dabbir_private.executive_goals g
  where lower(g.project_key)='dabbir' and g.status='active'
  order by
    case when (coalesce(v_command.objective,'')||' '||v_command.command_text) ~* '(barman|ceo|executive|مدير تنفيذي|الرئيس التنفيذي)' and (g.title||' '||g.objective) ~* '(barman|ceo|executive|مدير تنفيذي|الرئيس التنفيذي)' then 0 else 1 end,
    g.priority,g.created_at
  limit 1;

  select coalesce(jsonb_agg(x.item),'[]'::jsonb) into v_memory_refs
  from (
    select jsonb_build_object('id',m.id,'memory_key',m.memory_key,'confidence',m.confidence,'lesson',m.value->>'lesson','route',m.value->>'route','evidence_ref',m.value->>'evidence_ref') as item
    from dabbir_private.executive_memory m
    where m.project_key='DABBIR' and m.scope in ('DECISION','KNOWLEDGE')
      and m.superseded_by is null and (m.valid_until is null or m.valid_until>now())
      and m.confidence>=0.5 and coalesce(m.value->>'execution_lane',v_lane)=v_lane
    order by m.confidence desc,m.created_at desc limit 3
  ) x;

  v_situation:=jsonb_build_object(
    'what_changed',v_command.command_text,
    'why_it_matters',coalesce(nullif(v_command.objective,''),'Owner-directed DABBIR executive work'),
    'affected_goal',jsonb_build_object('id',v_goal_id,'title',v_goal_title),
    'severity',case v_command.priority when 'P0' then 'CRITICAL' when 'P1' then 'HIGH' when 'P2' then 'MEDIUM' else 'LOW' end,
    'known_facts',jsonb_build_array(
      jsonb_build_object('source','owner-command','objective',v_command.objective,'acceptance_criteria',v_command.acceptance_criteria),
      jsonb_build_object('source','fresh-reality','health_check_id',v_reality.id,'details',v_reality.details)
    ),
    'unknowns',jsonb_build_array('execution_outcome','independent_verification_outcome','goal_impact'),
    'freshness','FRESH','confidence',coalesce((v_reality.details->>'confidence')::numeric,0),
    'observed_at',v_observed_at,'evidence_refs',v_reality.evidence,'memory_refs',v_memory_refs
  );

  insert into dabbir_private.executive_decisions(
    id,command_id,context,options,decision,reason,decided_by,owner_required,effects
  ) values(
    v_decision_id,v_command.id,v_situation::text,
    jsonb_build_array(
      jsonb_build_object('option','PROCEED_EXISTING_LANE','risk','bounded by existing executor and independent verifier'),
      jsonb_build_object('option','DEFER_STALE_REALITY','risk','no execution when external reality is stale'),
      jsonb_build_object('option','OWNER_ESCALATION','risk','required for owner-only authority')
    ),
    case when v_owner_required then 'OWNER_REQUIRED' else 'PROCEED_EXISTING_LANE' end,
    case when v_owner_required then 'Owner-only authority detected before execution.' else 'Fresh reality is present; use the existing governed execution lane and require independent verification.' end,
    'BARMAN Executive OS',v_owner_required,
    jsonb_build_object(
      'situation',v_situation,'goal_id',v_goal_id,'goal_title',v_goal_title,
      'expected_outcome',jsonb_build_object('command_status','VERIFIED','goal_impact','MEASURE_AFTER_VERIFICATION'),
      'rollback',coalesce(v_command.rollback_plan,'{}'::jsonb),'execution_lane',v_lane,
      'reality_health_check_id',v_reality.id,'memory_refs',v_memory_refs,
      'run_id',v_run_id,'action_id',v_action_id
    )
  );

  if v_owner_required then
    update dabbir_private.dabbir_ceo_commands
    set status='BLOCKED',orchestration_state='BLOCKED',verification_status='FAILED',blocked_reason='OWNER_REQUIRED',
        result_summary='يتطلب هذا الإجراء صلاحية المالك ولا يمكن تنفيذه ذاتيًا.',completed_at=now(),lease_until=null,worker_id=null,updated_at=now()
    where id=v_command.id;
    if v_event.id is not null then
      update dabbir_private.executive_events set status='escalated',resolved_at=now(),payload=payload||jsonb_build_object('decision_id',v_decision_id,'owner_required',true) where id=v_event.id;
    end if;
    insert into dabbir_private.executive_audit_logs(command_id,actor,action,project_key,reason,result,metadata)
    values(v_command.id,'BARMAN Executive OS','OWNER_BOUNDARY','DABBIR','OWNER_ONLY_AUTHORITY','BLOCKED',jsonb_build_object('decision_id',v_decision_id,'goal_id',v_goal_id));
    return jsonb_build_object('ok',true,'claimed',false,'reason','OWNER_REQUIRED','command_id',v_command.id,'decision_id',v_decision_id,'goal_id',v_goal_id);
  end if;

  update dabbir_private.dabbir_ceo_commands
  set status='IN_PROGRESS',orchestration_state=case when v_lane='planner' then 'PLANNING' else 'EXECUTING' end,
      claimed_at=coalesce(claimed_at,now()),updated_at=now(),attempt_count=attempt_count+1,
      lease_until=now()+make_interval(secs=>v_lease),worker_id=v_worker,execution_lane=v_lane,last_error=null,
      execution_plan=coalesce(execution_plan,'{}'::jsonb)||jsonb_build_object('decision_id',v_decision_id,'goal_id',v_goal_id,'reality_health_check_id',v_reality.id)
  where id=v_command.id returning * into v_command;
  if v_event.id is not null then
    update dabbir_private.executive_events
    set status='claimed',payload=payload||jsonb_build_object('worker_id',v_worker,'execution_lane',v_lane,'claimed_at',now(),'attempt_count',v_command.attempt_count,'decision_id',v_decision_id,'goal_id',v_goal_id)
    where id=v_event.id returning * into v_event;
  end if;
  insert into dabbir_private.executive_runs(id,trigger_type,trigger_ref,status,started_at,metrics)
  values(v_run_id,'owner',v_command.id::text,'running',now(),jsonb_build_object('worker_id',v_worker,'lane',v_lane,'attempt',v_command.attempt_count,'decision_id',v_decision_id,'goal_id',v_goal_id,'reality_health_check_id',v_reality.id));
  insert into dabbir_private.executive_actions(id,run_id,event_id,goal_id,action_type,authority_level,status,description,owner_interruption,started_at)
  values(v_action_id,v_run_id,v_event.id,v_goal_id,case when v_lane='planner' then 'plan_owner_command' when v_lane='read_only' then 'read_owner_data' else 'execute_owner_command' end,'auto','running',v_command.command_text,false,now());
  return jsonb_build_object('ok',true,'claimed',true,'command',to_jsonb(v_command),'event_id',v_event.id,'run_id',v_run_id,'action_id',v_action_id,'decision_id',v_decision_id,'goal_id',v_goal_id,'situation',v_situation);
end;
$function$;

create or replace function public.barman_executive_verify_command_v1(
  p_command_id uuid,p_verifier text,p_method text,p_reference text,p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $function$
declare
  v_method text := upper(btrim(coalesce(p_method,'')));
  v_verifier text := left(btrim(coalesce(p_verifier,'')),120);
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_action_id uuid;
  v_executor_evidence_count integer;
  v_decision dabbir_private.executive_decisions%rowtype;
  v_memory_id bigint;
  v_goal_id uuid;
  v_goal_impact text:=upper(btrim(coalesce(p_details->>'goal_impact','UNCHANGED')));
begin
  if v_verifier='' then raise exception 'VERIFIER_REQUIRED'; end if;
  if v_method not in ('INDEPENDENT_VERIFIER','EXTERNAL_RECHECK','CI_AND_PRODUCTION_RECHECK') then raise exception 'VERIFICATION_METHOD_DENIED'; end if;
  if v_goal_impact not in ('IMPROVED','UNCHANGED','DEGRADED','ACHIEVED','BLOCKED') then v_goal_impact:='UNCHANGED'; end if;

  select * into v_command from dabbir_private.dabbir_ceo_commands where id=p_command_id for update;
  if not found then raise exception 'COMMAND_NOT_FOUND'; end if;
  if v_command.status<>'DONE' or v_command.verification_status<>'INDEPENDENT_REQUIRED' then raise exception 'COMMAND_NOT_AWAITING_VERIFICATION'; end if;
  if nullif(v_command.worker_id,'') is not null and v_verifier=v_command.worker_id then raise exception 'EXECUTOR_CANNOT_VERIFY_OWN_COMMAND'; end if;

  select a.id into v_action_id
  from dabbir_private.executive_actions a join dabbir_private.executive_runs r on r.id=a.run_id
  where r.trigger_ref=p_command_id::text order by a.started_at desc limit 1;
  if v_action_id is null then raise exception 'EXECUTION_ACTION_NOT_FOUND'; end if;
  select count(*) into v_executor_evidence_count from dabbir_private.executive_evidence e where e.action_id=v_action_id and e.verified=false;
  if v_executor_evidence_count<1 then raise exception 'EXECUTOR_EVIDENCE_REQUIRED_BEFORE_VERIFICATION'; end if;

  insert into dabbir_private.executive_evidence(action_id,evidence_type,reference,details,verified,produced_by,verified_by,verified_at,verification_method)
  values(v_action_id,'test',left(coalesce(nullif(p_reference,''),'independent-verification:'||p_command_id::text),1000),coalesce(p_details,'{}'::jsonb)||jsonb_build_object('trust_boundary','INDEPENDENT_VERIFIER'),true,'independent-verifier',v_verifier,now(),v_method);
  update dabbir_private.executive_actions set status='verified',completed_at=now(),error_message=null where id=v_action_id;
  update dabbir_private.dabbir_ceo_commands set verification_status='VERIFIED',orchestration_state='COMPLETED',updated_at=now() where id=p_command_id;
  update dabbir_private.executive_events
  set status='resolved',resolved_at=now(),payload=payload||jsonb_build_object('independent_verified_at',now(),'verified_by',v_verifier,'verification_method',v_method)
  where source='owner-directive' and kind='ceo_command' and external_ref=p_command_id::text;

  select * into v_decision from dabbir_private.executive_decisions where command_id=p_command_id order by created_at desc limit 1 for update;
  if found then
    begin v_goal_id:=(v_decision.effects->>'goal_id')::uuid; exception when others then v_goal_id:=null; end;
    insert into dabbir_private.executive_memory(scope,project_key,memory_key,value,source,confidence)
    values(
      'DECISION','DABBIR','verified-decision:'||v_decision.id::text,
      jsonb_build_object(
        'decision_id',v_decision.id,'command_id',p_command_id,'action_id',v_action_id,'goal_id',v_goal_id,
        'execution_lane',v_command.execution_lane,'route',coalesce(v_decision.effects->>'semantic_route',v_decision.decision),
        'expected_outcome',coalesce(v_decision.effects->'expected_outcome','{}'::jsonb),
        'observed_outcome',coalesce(p_details,'{}'::jsonb),
        'difference',jsonb_build_object('goal_impact',v_goal_impact,'verification_status','VERIFIED'),
        'lesson',left('Verified outcome: '||coalesce(v_command.result_summary,'command completed')||'. Reuse only when the execution lane, semantic route, evidence context, and goal are materially similar.',2000),
        'applicability',jsonb_build_object('execution_lane',v_command.execution_lane,'route',coalesce(v_decision.effects->>'semantic_route',v_decision.decision),'goal_id',v_goal_id),
        'goal_impact',v_goal_impact,'evidence_ref',left(coalesce(p_reference,''),1000),'verification_method',v_method
      ),
      'INDEPENDENT_VERIFIER',0.90
    ) returning id into v_memory_id;

    update dabbir_private.executive_decisions
    set effects=effects||jsonb_build_object(
      'action_id',v_action_id,'verified_at',now(),'verification_method',v_method,
      'observed_outcome',coalesce(p_details,'{}'::jsonb),'memory_id',v_memory_id,'goal_impact',v_goal_impact
    ) where id=v_decision.id;

    if v_goal_id is not null then
      update dabbir_private.executive_goals
      set success_metrics=coalesce(success_metrics,'{}'::jsonb)||jsonb_build_object(
            'last_verified_outcome',jsonb_build_object(
              'decision_id',v_decision.id,'action_id',v_action_id,'memory_id',v_memory_id,
              'impact',v_goal_impact,'verified_at',now(),'evidence_ref',left(coalesce(p_reference,''),1000)
            )
          ),
          status=case when v_goal_impact='ACHIEVED' then 'completed' else status end,
          updated_at=now()
      where id=v_goal_id;
    end if;
  end if;

  insert into dabbir_private.executive_audit_logs(command_id,actor,action,project_key,reason,result,artifact_ref,metadata)
  values(p_command_id,v_verifier,'INDEPENDENT_VERIFY','DABBIR',v_method,'VERIFIED',left(p_reference,1000),coalesce(p_details,'{}'::jsonb)||jsonb_build_object('trust_boundary','INDEPENDENT_VERIFIER','decision_id',v_decision.id,'memory_id',v_memory_id,'goal_id',v_goal_id,'goal_impact',v_goal_impact));

  return jsonb_build_object('ok',true,'command_id',p_command_id,'verification_status','VERIFIED','verified_by',v_verifier,'method',v_method,'decision_id',v_decision.id,'memory_id',v_memory_id,'goal_id',v_goal_id,'goal_impact',v_goal_impact);
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
  v_reality_at timestamptz;v_reality_age integer;v_reality_fresh boolean:=false;
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
  select (details->>'observed_at')::timestamptz into v_reality_at
  from dabbir_private.executive_health_checks where component='BARMAN Executive OS / REALITY' order by checked_at desc limit 1;
  if v_reality_at is not null then
    v_reality_age:=greatest(0,extract(epoch from now()-v_reality_at)::integer);
    v_reality_fresh:=v_reality_at>=now()-interval '10 minutes' and v_reality_at<=now()+interval '1 minute';
  end if;
  v_status:=case when v_broken>0 then 'PARTIAL' when not v_reality_fresh or v_stale>0 or v_cron<2 or v_pending_verify>0 or v_weak>0 or v_partial>0 then 'DEGRADED' else 'HEALTHY' end;
  return jsonb_build_object(
    'ok',true,'service','BARMAN Executive OS','status',v_status,'autonomy_level','A3','canonical_database','fphpoysqdsceniwduxjq',
    'reality',jsonb_build_object('observed_at',v_reality_at,'age_seconds',v_reality_age,'fresh',v_reality_fresh),
    'metrics',jsonb_build_object('broken_integrations',v_broken,'partial_integrations',v_partial,'retired_integrations',v_retired,'queued_commands',v_queue,'stale_in_progress',v_stale,'commands_waiting_independent_verification',v_pending_verify,'weak_verified_evidence',v_weak,'legacy_untrusted_evidence',v_legacy_untrusted,'active_core_cron_jobs',v_cron),
    'checked_at',now()
  );
end;
$function$;

revoke all on function public.barman_executive_observe_v1(jsonb) from public,anon,authenticated;
revoke all on function public.barman_executive_context_for_worker_v1(text) from public,anon,authenticated;
revoke all on function public.barman_executive_record_route_for_worker_v1(text,jsonb) from public,anon,authenticated;
revoke all on function public.barman_executive_claim_v1(text,text,integer) from public,anon,authenticated;
revoke all on function public.barman_executive_verify_command_v1(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.barman_executive_self_diagnostic_v1() from public,anon,authenticated;
grant execute on function public.barman_executive_observe_v1(jsonb) to service_role;
grant execute on function public.barman_executive_context_for_worker_v1(text) to service_role;
grant execute on function public.barman_executive_record_route_for_worker_v1(text,jsonb) to service_role;
grant execute on function public.barman_executive_claim_v1(text,text,integer) to service_role;
grant execute on function public.barman_executive_verify_command_v1(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.barman_executive_self_diagnostic_v1() to service_role;

comment on function public.barman_executive_observe_v1(jsonb) is 'Persists the existing CEO external reality snapshot and freshness without creating a parallel control plane.';
comment on function public.barman_executive_claim_v1(text,text,integer) is 'Claims existing CEO work only when reality is fresh, persists Situation/Decision, links the active Goal, and then creates the existing Action.';
comment on function public.barman_executive_verify_command_v1(uuid,text,text,text,jsonb) is 'Preserves independent verification and, only after VERIFIED, persists a reusable executive lesson and updates goal outcome metadata.';
