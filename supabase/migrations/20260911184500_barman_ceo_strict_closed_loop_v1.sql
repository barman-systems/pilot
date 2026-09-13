-- DABBIR CEO strict closed-loop enforcement v1.
-- Reuses the existing BARMAN Executive OS schema and executors.
-- No new table, agent, model, executor, verifier, or autonomy level.

create or replace function public.barman_executive_claim_v1(
  p_worker_id text,
  p_lane text,
  p_lease_seconds integer default 300
)
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
  v_reality_sufficient boolean:=false;
  v_route text;
  v_expected_lane text;
begin
  if v_worker='' then raise exception 'WORKER_ID_REQUIRED'; end if;
  if v_lane not in ('runtime','tool_agent','read_only','planner') then raise exception 'EXECUTION_LANE_INVALID'; end if;

  select * into v_reality
  from dabbir_private.executive_health_checks
  where component='BARMAN Executive Reality'
  order by checked_at desc
  limit 1;

  if found then
    begin v_observed_at:=nullif(v_reality.details->>'observed_at','')::timestamptz; exception when others then v_observed_at:=null; end;
    begin v_reality_sufficient:=coalesce((v_reality.details->>'sufficient')::boolean,false); exception when others then v_reality_sufficient:=false; end;
  end if;

  if v_observed_at is null
     or v_observed_at < now()-interval '10 minutes'
     or v_observed_at > now()+interval '1 minute'
     or coalesce(v_reality.status,'DEGRADED')<>'HEALTHY'
     or not v_reality_sufficient then
    return jsonb_build_object(
      'ok',true,
      'claimed',false,
      'reason',case when v_observed_at is null or v_observed_at < now()-interval '10 minutes' or v_observed_at > now()+interval '1 minute' then 'STALE_REALITY' else 'INSUFFICIENT_FRESH_EVIDENCE' end,
      'observed_at',v_observed_at
    );
  end if;

  select c.* into v_command
  from dabbir_private.dabbir_ceo_commands c
  where c.status in ('QUEUED','ACCEPTED','IN_PROGRESS')
    and c.attempt_count<12
    and (c.lease_until is null or c.lease_until<now())
    and c.execution_lane=v_lane
    and exists(
      select 1
      from dabbir_private.executive_decisions d
      where d.command_id=c.id
    )
  order by case c.priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end,c.created_at
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('ok',true,'claimed',false,'reason','NO_DECIDED_WORK');
  end if;

  select * into v_decision
  from dabbir_private.executive_decisions
  where command_id=v_command.id
  order by created_at desc
  limit 1;

  if not found then raise exception 'EXECUTIVE_DECISION_REQUIRED_BEFORE_ACTION'; end if;
  if v_decision.owner_required then raise exception 'OWNER_REQUIRED_DECISION_NOT_EXECUTABLE'; end if;

  v_route:=upper(coalesce(v_decision.effects->>'route',''));
  v_expected_lane:=case v_route
    when 'REPO_CHANGE' then 'tool_agent'
    when 'DATA_QUERY' then 'read_only'
    when 'RUNTIME_CHECK' then 'runtime'
    when 'MULTI_STEP' then 'planner'
    else null
  end;

  if v_expected_lane is null then raise exception 'DECISION_ROUTE_NOT_EXECUTABLE'; end if;
  if v_expected_lane<>v_lane or v_command.execution_lane<>v_lane then raise exception 'DECISION_ROUTE_LANE_MISMATCH'; end if;

  begin v_goal_id:=nullif(v_decision.effects->>'affected_goal','')::uuid; exception when others then v_goal_id:=null; end;

  select * into v_event
  from dabbir_private.executive_events e
  where e.source='owner-directive'
    and e.kind='ceo_command'
    and e.external_ref=v_command.id::text
  order by e.detected_at desc
  for update
  limit 1;

  update dabbir_private.dabbir_ceo_commands
  set status='IN_PROGRESS',
      orchestration_state=case when v_lane='planner' then 'PLANNING' else 'EXECUTING' end,
      claimed_at=coalesce(claimed_at,now()),
      updated_at=now(),
      attempt_count=attempt_count+1,
      lease_until=now()+make_interval(secs=>v_lease),
      worker_id=v_worker,
      last_error=null,
      execution_plan=coalesce(execution_plan,'{}'::jsonb)||jsonb_build_object(
        'executive_decision_id',v_decision.id,
        'goal_id',v_goal_id,
        'reality_health_check_id',v_reality.id,
        'reality_observed_at',v_observed_at
      )
  where id=v_command.id
  returning * into v_command;

  if v_event.id is not null then
    update dabbir_private.executive_events
    set status='claimed',
        payload=payload||jsonb_build_object(
          'worker_id',v_worker,
          'execution_lane',v_lane,
          'claimed_at',now(),
          'attempt_count',v_command.attempt_count,
          'executive_decision_id',v_decision.id,
          'goal_id',v_goal_id
        )
    where id=v_event.id
    returning * into v_event;
  end if;

  insert into dabbir_private.executive_runs(id,trigger_type,trigger_ref,status,started_at,metrics)
  values(
    v_run_id,'owner',v_command.id::text,'running',now(),
    jsonb_build_object(
      'worker_id',v_worker,
      'lane',v_lane,
      'attempt',v_command.attempt_count,
      'decision_id',v_decision.id,
      'goal_id',v_goal_id,
      'reality_health_check_id',v_reality.id
    )
  );

  insert into dabbir_private.executive_actions(
    id,run_id,event_id,goal_id,action_type,authority_level,status,description,owner_interruption,started_at
  ) values(
    v_action_id,v_run_id,v_event.id,v_goal_id,
    case when v_lane='planner' then 'plan_owner_command' when v_lane='read_only' then 'read_owner_data' else 'execute_owner_command' end,
    'auto','running',v_command.command_text,false,now()
  );

  update dabbir_private.executive_decisions
  set effects=effects||jsonb_build_object('run_id',v_run_id,'action_id',v_action_id,'claimed_at',now())
  where id=v_decision.id;

  return jsonb_build_object(
    'ok',true,
    'claimed',true,
    'command',to_jsonb(v_command),
    'event_id',v_event.id,
    'run_id',v_run_id,
    'action_id',v_action_id,
    'decision_id',v_decision.id,
    'goal_id',v_goal_id,
    'situation',coalesce(v_decision.effects->'situation','{}'::jsonb)
  );
end;
$function$;

create or replace function public.barman_executive_verify_command_v1(
  p_command_id uuid,
  p_verifier text,
  p_method text,
  p_reference text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_method text:=upper(btrim(coalesce(p_method,'')));
  v_verifier text:=left(btrim(coalesce(p_verifier,'')),120);
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_decision dabbir_private.executive_decisions%rowtype;
  v_action_id uuid;
  v_run_id uuid;
  v_goal_id uuid;
  v_executor_evidence_count integer;
  v_memory_id bigint;
  v_goal_impact text:=upper(btrim(coalesce(p_details->>'goal_impact','UNCHANGED')));
  v_goal_state text;
begin
  if v_verifier='' then raise exception 'VERIFIER_REQUIRED'; end if;
  if v_method not in ('INDEPENDENT_VERIFIER','EXTERNAL_RECHECK','CI_AND_PRODUCTION_RECHECK') then raise exception 'VERIFICATION_METHOD_DENIED'; end if;
  if v_goal_impact not in ('IMPROVED','UNCHANGED','DEGRADED','ACHIEVED','BLOCKED') then v_goal_impact:='UNCHANGED'; end if;
  v_goal_state:=case when v_goal_impact='ACHIEVED' then 'GOAL_ACHIEVED' when v_goal_impact='IMPROVED' then 'GOAL_IMPROVED' when v_goal_impact='DEGRADED' then 'GOAL_DEGRADED' when v_goal_impact='BLOCKED' then 'GOAL_BLOCKED' else 'ACTION_SUCCESS_GOAL_NOT_ACHIEVED' end;

  select * into v_command
  from dabbir_private.dabbir_ceo_commands
  where id=p_command_id
  for update;

  if not found then raise exception 'COMMAND_NOT_FOUND'; end if;
  if v_command.status<>'DONE' or v_command.verification_status<>'INDEPENDENT_REQUIRED' then raise exception 'COMMAND_NOT_AWAITING_VERIFICATION'; end if;
  if nullif(v_command.worker_id,'') is not null and v_verifier=v_command.worker_id then raise exception 'EXECUTOR_CANNOT_VERIFY_OWN_COMMAND'; end if;

  select a.id,a.run_id into v_action_id,v_run_id
  from dabbir_private.executive_actions a
  join dabbir_private.executive_runs r on r.id=a.run_id
  where r.trigger_ref=p_command_id::text
  order by a.started_at desc
  limit 1;

  if v_action_id is null then raise exception 'EXECUTION_ACTION_NOT_FOUND'; end if;

  select count(*) into v_executor_evidence_count
  from dabbir_private.executive_evidence e
  where e.action_id=v_action_id and e.verified=false;

  if v_executor_evidence_count<1 then raise exception 'EXECUTOR_EVIDENCE_REQUIRED_BEFORE_VERIFICATION'; end if;

  select * into v_decision
  from dabbir_private.executive_decisions
  where command_id=p_command_id
  order by created_at desc
  limit 1
  for update;

  if not found then raise exception 'EXECUTIVE_DECISION_REQUIRED_BEFORE_VERIFICATION'; end if;
  begin v_goal_id:=nullif(v_decision.effects->>'affected_goal','')::uuid; exception when others then v_goal_id:=null; end;

  insert into dabbir_private.executive_evidence(
    action_id,evidence_type,reference,details,verified,produced_by,verified_by,verified_at,verification_method
  ) values(
    v_action_id,
    'test',
    left(coalesce(nullif(p_reference,''),'independent-verification:'||p_command_id::text),1000),
    coalesce(p_details,'{}'::jsonb)||jsonb_build_object('trust_boundary','INDEPENDENT_VERIFIER'),
    true,
    'independent-verifier',
    v_verifier,
    now(),
    v_method
  );

  update dabbir_private.executive_actions
  set status='verified',completed_at=now(),error_message=null
  where id=v_action_id;

  update dabbir_private.executive_runs
  set status='completed',
      finished_at=now(),
      metrics=metrics||jsonb_build_object(
        'trusted_evidence_count',1,
        'verification_status','VERIFIED',
        'verified_by',v_verifier,
        'verification_method',v_method
      )
  where id=v_run_id;

  update dabbir_private.dabbir_ceo_commands
  set verification_status='VERIFIED',orchestration_state='COMPLETED',updated_at=now()
  where id=p_command_id;

  update dabbir_private.executive_events
  set status='resolved',
      resolved_at=now(),
      payload=payload||jsonb_build_object(
        'independent_verified_at',now(),
        'verified_by',v_verifier,
        'verification_method',v_method,
        'decision_id',v_decision.id,
        'goal_id',v_goal_id,
        'goal_impact',v_goal_impact
      )
  where source='owner-directive' and kind='ceo_command' and external_ref=p_command_id::text;

  insert into dabbir_private.executive_memory(scope,project_key,memory_key,value,source,confidence)
  values(
    'DECISION',
    'DABBIR',
    'verified-decision:'||v_decision.id::text,
    jsonb_build_object(
      'decision_id',v_decision.id,
      'command_id',p_command_id,
      'action_id',v_action_id,
      'goal_id',v_goal_id,
      'execution_lane',v_command.execution_lane,
      'route',coalesce(v_decision.effects->>'route',v_decision.decision),
      'expected_outcome',coalesce(v_decision.effects->'expected_outcome','{}'::jsonb),
      'observed_outcome',coalesce(p_details,'{}'::jsonb),
      'difference',jsonb_build_object('goal_impact',v_goal_impact,'verification_status','VERIFIED'),
      'lesson',left('Verified outcome: '||coalesce(v_command.result_summary,'command completed')||'. Reuse only when the route, execution lane, evidence context, and goal are materially similar.',2000),
      'applicability',jsonb_build_object('execution_lane',v_command.execution_lane,'route',coalesce(v_decision.effects->>'route',v_decision.decision),'goal_id',v_goal_id),
      'goal_impact',v_goal_impact,
      'goal_state',v_goal_state,
      'evidence_ref',left(coalesce(p_reference,''),1000),
      'verification_method',v_method
    ),
    'INDEPENDENT_VERIFIER',
    0.90
  ) returning id into v_memory_id;

  update dabbir_private.executive_decisions
  set effects=effects||jsonb_build_object(
    'action_id',v_action_id,
    'verified_at',now(),
    'verification_method',v_method,
    'observed_outcome',coalesce(p_details,'{}'::jsonb),
    'memory_id',v_memory_id,
    'goal_impact',v_goal_impact,
    'goal_state',v_goal_state
  )
  where id=v_decision.id;

  if v_goal_id is not null then
    update dabbir_private.executive_goals
    set success_metrics=coalesce(success_metrics,'{}'::jsonb)||jsonb_build_object(
          'last_verified_outcome',jsonb_build_object(
            'decision_id',v_decision.id,
            'action_id',v_action_id,
            'memory_id',v_memory_id,
            'impact',v_goal_impact,
            'state',v_goal_state,
            'verified_at',now(),
            'evidence_ref',left(coalesce(p_reference,''),1000)
          )
        ),
        status=case when v_goal_impact='ACHIEVED' then 'completed' else status end,
        updated_at=now()
    where id=v_goal_id;
  end if;

  insert into dabbir_private.executive_audit_logs(
    execution_id,command_id,actor,action,project_key,reason,result,artifact_ref,metadata
  ) values(
    v_run_id,p_command_id,v_verifier,'INDEPENDENT_VERIFY','DABBIR',v_method,'VERIFIED',left(p_reference,1000),
    coalesce(p_details,'{}'::jsonb)||jsonb_build_object(
      'trust_boundary','INDEPENDENT_VERIFIER',
      'decision_id',v_decision.id,
      'memory_id',v_memory_id,
      'goal_id',v_goal_id,
      'goal_impact',v_goal_impact,
      'goal_state',v_goal_state
    )
  );

  return jsonb_build_object(
    'ok',true,
    'command_id',p_command_id,
    'verification_status','VERIFIED',
    'verified_by',v_verifier,
    'method',v_method,
    'decision_id',v_decision.id,
    'action_id',v_action_id,
    'memory_id',v_memory_id,
    'goal_id',v_goal_id,
    'goal_impact',v_goal_impact,
    'goal_state',v_goal_state
  );
end;
$function$;

create or replace function public.barman_executive_rollup_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  p record;
  v_total integer;v_done integer;v_verified_done integer;v_blocked integer;v_active integer;
  v_run uuid;v_action uuid;v_evidence jsonb;
  v_completed integer:=0;v_failed integer:=0;v_waiting_verify integer:=0;
  v_decision dabbir_private.executive_decisions%rowtype;
  v_goal_id uuid;
  v_memory_id bigint;
begin
  for p in
    select id
    from dabbir_private.dabbir_ceo_commands
    where parent_command_id is null and orchestration_state='WAITING' and status='IN_PROGRESS'
    order by created_at
    for update skip locked
  loop
    select count(*),
           count(*) filter(where status='DONE'),
           count(*) filter(where status='DONE' and verification_status='VERIFIED'),
           count(*) filter(where status in ('BLOCKED','CANCELLED')),
           count(*) filter(where status in ('QUEUED','ACCEPTED','IN_PROGRESS'))
    into v_total,v_done,v_verified_done,v_blocked,v_active
    from dabbir_private.dabbir_ceo_commands
    where parent_command_id=p.id;

    if v_total=0 then continue; end if;

    update dabbir_private.executive_task_nodes n
    set status=case c.status
          when 'DONE' then case when c.verification_status='VERIFIED' then 'COMPLETED' else 'VERIFYING' end
          when 'BLOCKED' then 'BLOCKED'
          when 'CANCELLED' then 'CANCELLED'
          when 'IN_PROGRESS' then 'RUNNING'
          else n.status
        end,
        verification_status=c.verification_status,
        completed_at=case when c.status='DONE' and c.verification_status='VERIFIED' then coalesce(n.completed_at,now()) when c.status in ('BLOCKED','CANCELLED') then coalesce(n.completed_at,now()) else n.completed_at end,
        output=jsonb_build_object('child_status',c.status,'verification_status',c.verification_status,'result_summary',c.result_summary,'evidence',c.evidence)
    from dabbir_private.dabbir_ceo_commands c
    where n.command_id=p.id and n.child_command_id=c.id;

    if v_verified_done=v_total then
      select * into v_decision
      from dabbir_private.executive_decisions
      where command_id=p.id
      order by created_at desc
      limit 1;

      if not found then raise exception 'PARENT_EXECUTIVE_DECISION_REQUIRED_BEFORE_ROLLUP'; end if;
      begin v_goal_id:=nullif(v_decision.effects->>'affected_goal','')::uuid; exception when others then v_goal_id:=null; end;

      v_run:=gen_random_uuid();
      v_action:=gen_random_uuid();

      insert into dabbir_private.executive_runs(id,trigger_type,trigger_ref,status,started_at,metrics)
      values(v_run,'recovery',p.id::text,'running',now(),jsonb_build_object('rollup',true,'child_count',v_total,'decision_id',v_decision.id,'goal_id',v_goal_id));

      insert into dabbir_private.executive_actions(id,run_id,goal_id,action_type,authority_level,status,description,owner_interruption,started_at)
      values(v_action,v_run,v_goal_id,'aggregate_child_results','auto','running','Aggregate independently verified child commands for parent '||p.id,false,now());

      select coalesce(jsonb_agg(jsonb_build_object(
        'type','child-command','reference',id::text,'verified',true,
        'details',jsonb_build_object('summary',result_summary,'verification_status',verification_status,'evidence',evidence)
      ) order by created_at),'[]'::jsonb)
      into v_evidence
      from dabbir_private.dabbir_ceo_commands
      where parent_command_id=p.id;

      insert into dabbir_private.executive_evidence(
        action_id,evidence_type,reference,details,verified,produced_by,verified_by,verified_at,verification_method
      )
      select v_action,'artifact','child-command:'||id::text,
             jsonb_build_object('status',status,'verification_status',verification_status,'summary',result_summary,'evidence_count',jsonb_array_length(evidence)),
             true,'child-executor','barman-rollup',now(),'INDEPENDENT_VERIFIER'
      from dabbir_private.dabbir_ceo_commands
      where parent_command_id=p.id;

      update dabbir_private.executive_actions set status='verified',completed_at=now() where id=v_action;
      update dabbir_private.executive_runs set status='completed',finished_at=now(),summary='ALL_CHILD_COMMANDS_INDEPENDENTLY_VERIFIED',metrics=metrics||jsonb_build_object('outcome','DONE','trusted_evidence_count',v_total) where id=v_run;
      update dabbir_private.dabbir_ceo_commands set status='DONE',orchestration_state='COMPLETED',verification_status='VERIFIED',result_summary='اكتملت جميع المهام الفرعية وتم التحقق منها ('||v_total||'/'||v_total||').',evidence=v_evidence,completed_at=now(),lease_until=null,updated_at=now() where id=p.id;
      update dabbir_private.executive_events set status='resolved',resolved_at=now(),payload=payload||jsonb_build_object('rollup','DONE','child_count',v_total,'verified_child_count',v_verified_done,'decision_id',v_decision.id,'goal_id',v_goal_id) where source='owner-directive' and kind='ceo_command' and external_ref=p.id::text;

      insert into dabbir_private.executive_memory(scope,project_key,memory_key,value,source,confidence)
      values(
        'DECISION','DABBIR','verified-rollup:'||v_decision.id::text,
        jsonb_build_object(
          'decision_id',v_decision.id,
          'command_id',p.id,
          'action_id',v_action,
          'goal_id',v_goal_id,
          'execution_lane','planner',
          'route',coalesce(v_decision.effects->>'route','MULTI_STEP'),
          'expected_outcome',coalesce(v_decision.effects->'expected_outcome','{}'::jsonb),
          'observed_outcome',jsonb_build_object('verified_children',v_verified_done,'total_children',v_total),
          'difference',jsonb_build_object('goal_impact','UNCHANGED','verification_status','VERIFIED'),
          'lesson','All decomposed child commands completed with independent verification. This proves execution completion, not business-goal achievement.',
          'applicability',jsonb_build_object('execution_lane','planner','goal_id',v_goal_id),
          'goal_impact','UNCHANGED',
          'goal_state','ACTION_SUCCESS_GOAL_NOT_ACHIEVED',
          'evidence_ref','verified-children:'||p.id::text,
          'verification_method','INDEPENDENT_CHILD_ROLLUP'
        ),
        'BARMAN_ROLLUP',0.90
      ) returning id into v_memory_id;

      update dabbir_private.executive_decisions
      set effects=effects||jsonb_build_object(
        'action_id',v_action,
        'verified_at',now(),
        'verification_method','INDEPENDENT_CHILD_ROLLUP',
        'memory_id',v_memory_id,
        'goal_impact','UNCHANGED',
        'goal_state','ACTION_SUCCESS_GOAL_NOT_ACHIEVED'
      )
      where id=v_decision.id;

      if v_goal_id is not null then
        update dabbir_private.executive_goals
        set success_metrics=coalesce(success_metrics,'{}'::jsonb)||jsonb_build_object(
              'last_verified_outcome',jsonb_build_object(
                'decision_id',v_decision.id,
                'action_id',v_action,
                'memory_id',v_memory_id,
                'impact','UNCHANGED',
                'state','ACTION_SUCCESS_GOAL_NOT_ACHIEVED',
                'verified_at',now(),
                'evidence_ref','verified-children:'||p.id::text
              )
            ),
            updated_at=now()
        where id=v_goal_id;
      end if;

      v_completed:=v_completed+1;
    elsif v_active=0 and v_blocked>0 then
      update dabbir_private.dabbir_ceo_commands set status='BLOCKED',orchestration_state='BLOCKED',verification_status='FAILED',blocked_reason='One or more child commands were blocked after decomposition.',result_summary='تعذر إكمال الأمر لأن '||v_blocked||' من '||v_total||' مهام فرعية توقفت.',completed_at=now(),lease_until=null,updated_at=now() where id=p.id;
      update dabbir_private.executive_events set status='escalated',resolved_at=now(),payload=payload||jsonb_build_object('rollup','BLOCKED','child_count',v_total,'blocked_count',v_blocked) where source='owner-directive' and kind='ceo_command' and external_ref=p.id::text;
      v_failed:=v_failed+1;
    elsif v_active=0 and v_done=v_total and v_verified_done<v_total then
      update dabbir_private.dabbir_ceo_commands set execution_plan=execution_plan||jsonb_build_object('progress',jsonb_build_object('total',v_total,'done',v_done,'verified',v_verified_done,'waiting_verification',v_total-v_verified_done),'last_rollup_at',now()),updated_at=now() where id=p.id;
      v_waiting_verify:=v_waiting_verify+1;
    else
      update dabbir_private.dabbir_ceo_commands set execution_plan=execution_plan||jsonb_build_object('progress',jsonb_build_object('total',v_total,'done',v_done,'verified',v_verified_done,'blocked',v_blocked,'active',v_active),'last_rollup_at',now()),updated_at=now() where id=p.id;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'completed_parents',v_completed,'blocked_parents',v_failed,'waiting_verification_parents',v_waiting_verify,'checked_at',now());
end;
$function$;

create or replace function public.barman_executive_self_diagnostic_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_broken integer;v_partial integer;v_retired integer;v_stale integer;v_queue integer;
  v_weak integer;v_legacy_untrusted integer;v_pending_verify integer;v_cron integer;v_status text;
  v_reality_at timestamptz;v_reality_age integer;v_reality_fresh boolean:=false;v_reality_sufficient boolean:=false;v_reality_status text;
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

  select status,
         nullif(details->>'observed_at','')::timestamptz,
         coalesce((details->>'sufficient')::boolean,false)
  into v_reality_status,v_reality_at,v_reality_sufficient
  from dabbir_private.executive_health_checks
  where component='BARMAN Executive Reality'
  order by checked_at desc
  limit 1;

  if v_reality_at is not null then
    v_reality_age:=greatest(0,extract(epoch from now()-v_reality_at)::integer);
    v_reality_fresh:=v_reality_at>=now()-interval '10 minutes' and v_reality_at<=now()+interval '1 minute' and v_reality_sufficient;
  end if;

  v_status:=case
    when v_broken>0 then 'PARTIAL'
    when not v_reality_fresh or coalesce(v_reality_status,'DEGRADED')<>'HEALTHY' or v_stale>0 or v_cron<2 or v_pending_verify>0 or v_weak>0 or v_partial>0 then 'DEGRADED'
    else 'HEALTHY'
  end;

  return jsonb_build_object(
    'ok',true,
    'service','BARMAN Executive OS',
    'status',v_status,
    'autonomy_level','A3',
    'canonical_database','fphpoysqdsceniwduxjq',
    'reality',jsonb_build_object(
      'observed_at',v_reality_at,
      'age_seconds',v_reality_age,
      'fresh',v_reality_fresh,
      'sufficient',v_reality_sufficient,
      'status',v_reality_status
    ),
    'metrics',jsonb_build_object(
      'broken_integrations',v_broken,
      'partial_integrations',v_partial,
      'retired_integrations',v_retired,
      'queued_commands',v_queue,
      'stale_in_progress',v_stale,
      'commands_waiting_independent_verification',v_pending_verify,
      'weak_verified_evidence',v_weak,
      'legacy_untrusted_evidence',v_legacy_untrusted,
      'active_core_cron_jobs',v_cron
    ),
    'checked_at',now()
  );
end;
$function$;

revoke all on function public.barman_executive_claim_v1(text,text,integer) from public,anon,authenticated;
revoke all on function public.barman_executive_verify_command_v1(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.barman_executive_rollup_v1() from public,anon,authenticated;
revoke all on function public.barman_executive_self_diagnostic_v1() from public,anon,authenticated;

grant execute on function public.barman_executive_claim_v1(text,text,integer) to service_role;
grant execute on function public.barman_executive_verify_command_v1(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.barman_executive_rollup_v1() to service_role;
grant execute on function public.barman_executive_self_diagnostic_v1() to service_role;

comment on function public.barman_executive_claim_v1(text,text,integer) is 'Claims only fresh-reality work with a persisted semantic executive decision and exact existing execution lane.';
comment on function public.barman_executive_verify_command_v1(uuid,text,text,text,jsonb) is 'Preserves independent verification and writes durable executive learning only after VERIFIED.';
comment on function public.barman_executive_rollup_v1() is 'Completes planner parents only after all children are independently verified, then records a derived lesson without claiming business-goal achievement.';
