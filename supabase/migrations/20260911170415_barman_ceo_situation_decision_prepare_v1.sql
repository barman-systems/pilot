-- BARMAN Executive OS closed-loop preparation: select unprepared commands and persist Situation -> Decision before execution.
create or replace function public.barman_executive_next_unprepared_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare v_command dabbir_private.dabbir_ceo_commands%rowtype;
begin
  select c.* into v_command
  from dabbir_private.dabbir_ceo_commands c
  where c.status in ('QUEUED','ACCEPTED') and c.attempt_count<12
    and not exists(select 1 from dabbir_private.executive_decisions d where d.command_id=c.id)
    and (c.lease_until is null or c.lease_until<now())
  order by case c.priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end,c.created_at
  for update skip locked limit 1;
  if not found then return jsonb_build_object('ok',true,'selected',false); end if;
  update dabbir_private.dabbir_ceo_commands
  set status='ACCEPTED',orchestration_state='PLANNING',worker_id='vercel-ceo-understanding',lease_until=now()+interval '2 minutes',updated_at=now()
  where id=v_command.id returning * into v_command;
  return jsonb_build_object('ok',true,'selected',true,'command',to_jsonb(v_command));
end;
$function$;

create or replace function public.barman_executive_decide_v1(p_command_id uuid,p_reality jsonb,p_situation jsonb,p_decision jsonb,p_memory_refs jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_observed_at timestamptz;v_confidence numeric:=0;v_fresh boolean:=false;
  v_route text:=upper(btrim(coalesce(p_decision->>'route','REVIEW_REQUIRED')));
  v_risk text:=upper(btrim(coalesce(p_decision->>'risk',p_situation->>'severity','MEDIUM')));
  v_owner_required boolean:=coalesce((p_decision->>'owner_required')::boolean,false);
  v_goal_id uuid;v_decision_id uuid:=gen_random_uuid();v_lane text;v_block_reason text;v_ref text;v_existing uuid;
begin
  if jsonb_typeof(coalesce(p_reality,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_situation,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_decision,'{}'::jsonb))<>'object' then raise exception 'EXECUTIVE_DECISION_OBJECTS_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_decision->'options','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_decision->'options','[]'::jsonb))<2 then raise exception 'EXECUTIVE_DECISION_OPTIONS_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_memory_refs,'[]'::jsonb))<>'array' then raise exception 'EXECUTIVE_MEMORY_REFS_ARRAY_REQUIRED'; end if;
  if v_route not in ('REPO_CHANGE','DATA_QUERY','MULTI_STEP','EXTERNAL_ACTION','REVIEW_REQUIRED','OWNER_GATE') then raise exception 'EXECUTIVE_ROUTE_INVALID'; end if;
  if v_risk not in ('LOW','MEDIUM','HIGH','CRITICAL') then v_risk:='MEDIUM'; end if;
  select * into v_command from dabbir_private.dabbir_ceo_commands where id=p_command_id for update;
  if not found then raise exception 'COMMAND_NOT_FOUND'; end if;
  if v_command.status not in ('QUEUED','ACCEPTED') then raise exception 'COMMAND_NOT_DECIDABLE'; end if;
  select id into v_existing from dabbir_private.executive_decisions where command_id=p_command_id order by created_at desc limit 1;
  if v_existing is not null then
    update dabbir_private.dabbir_ceo_commands set lease_until=null,worker_id=null,updated_at=now() where id=p_command_id;
    return jsonb_build_object('ok',true,'decision_id',v_existing,'state','ALREADY_DECIDED');
  end if;
  begin v_observed_at:=nullif(p_reality->>'observed_at','')::timestamptz; exception when others then v_observed_at:=null; end;
  begin v_confidence:=greatest(0,least(1,coalesce((p_reality->>'confidence')::numeric,0))); exception when others then v_confidence:=0; end;
  v_fresh:=v_observed_at is not null and v_observed_at>=now()-interval '10 minutes' and v_observed_at<=now()+interval '1 minute' and upper(coalesce(p_reality->>'freshness',''))='FRESH';
  if not v_fresh or v_confidence<0.70 then
    v_block_reason:=case when not v_fresh then 'STALE_REALITY' else 'INSUFFICIENT_FRESH_EVIDENCE' end;
    update dabbir_private.dabbir_ceo_commands set status='BLOCKED',orchestration_state='BLOCKED',verification_status='FAILED',blocked_reason=v_block_reason,last_error=v_block_reason,lease_until=null,worker_id=null,updated_at=now() where id=p_command_id;
    update dabbir_private.executive_events set status='escalated',resolved_at=now(),payload=payload||jsonb_build_object('executive_gate',v_block_reason,'reality',p_reality) where source='owner-directive' and kind='ceo_command' and external_ref=p_command_id::text;
    insert into dabbir_private.executive_audit_logs(command_id,actor,action,project_key,reason,result,metadata) values(p_command_id,'BARMAN Executive OS','EXECUTIVE_REALITY_GATE','DABBIR',v_block_reason,'BLOCKED',jsonb_build_object('reality',p_reality));
    return jsonb_build_object('ok',true,'decision_id',null,'state',v_block_reason);
  end if;
  for v_ref in select value from jsonb_array_elements_text(p_memory_refs) loop
    if not exists(select 1 from dabbir_private.executive_memory m where m.id::text=v_ref and m.superseded_by is null and (m.valid_until is null or m.valid_until>now())) then raise exception 'EXECUTIVE_MEMORY_REFERENCE_INVALID'; end if;
  end loop;
  begin v_goal_id:=nullif(p_situation->>'affected_goal','')::uuid; exception when others then v_goal_id:=null; end;
  if v_goal_id is not null and not exists(select 1 from dabbir_private.executive_goals g where g.id=v_goal_id and g.status='active') then v_goal_id:=null; end if;
  if v_goal_id is null then select g.id into v_goal_id from dabbir_private.executive_goals g where g.status='active' and lower(g.project_key)='dabbir' order by g.priority,g.updated_at desc limit 1; end if;
  insert into dabbir_private.executive_decisions(id,command_id,context,options,decision,reason,decided_by,owner_required,effects,created_at)
  values(v_decision_id,p_command_id,p_situation::text,p_decision->'options',left(coalesce(p_decision->>'chosen_option',v_route),2000),left(coalesce(p_decision->>'reason',''),4000),'BARMAN Executive OS',v_owner_required,
    jsonb_build_object('route',v_route,'risk',v_risk,'expected_outcome',coalesce(p_decision->>'expected_outcome',''),'rollback',coalesce(p_decision->>'rollback','NO_MUTATION'),'affected_goal',v_goal_id,'reality',p_reality,'situation',p_situation,'memory_refs',p_memory_refs,'health_domains',coalesce(p_situation->'health_domains','{}'::jsonb),'understanding_source',p_decision->>'understanding_source','model',p_decision->>'model'),now());
  v_lane:=case v_route when 'REPO_CHANGE' then 'tool_agent' when 'DATA_QUERY' then 'read_only' when 'MULTI_STEP' then 'planner' else null end;
  if v_owner_required or v_route in ('OWNER_GATE','EXTERNAL_ACTION','REVIEW_REQUIRED') then
    v_block_reason:=case when v_owner_required or v_route='OWNER_GATE' then 'OWNER_REQUIRED' when v_route='EXTERNAL_ACTION' then 'EXTERNAL_ACTION_NO_SAFE_EXECUTOR' else 'SEMANTIC_REVIEW_REQUIRED' end;
    update dabbir_private.dabbir_ceo_commands set status='BLOCKED',orchestration_state='BLOCKED',risk_level=v_risk,verification_status='FAILED',blocked_reason=v_block_reason,last_error=v_block_reason,execution_lane=null,execution_plan=coalesce(execution_plan,'{}'::jsonb)||jsonb_build_object('executive_decision_id',v_decision_id,'route',v_route,'situation',p_situation,'memory_refs',p_memory_refs),lease_until=null,worker_id=null,updated_at=now() where id=p_command_id;
  else
    update dabbir_private.dabbir_ceo_commands set status='QUEUED',orchestration_state='QUEUED',risk_level=v_risk,verification_status='PENDING',blocked_reason=null,last_error=null,execution_lane=v_lane,execution_plan=coalesce(execution_plan,'{}'::jsonb)||jsonb_build_object('executive_decision_id',v_decision_id,'route',v_route,'situation',p_situation,'memory_refs',p_memory_refs,'reality_observed_at',v_observed_at),lease_until=null,worker_id=null,updated_at=now() where id=p_command_id;
  end if;
  update dabbir_private.executive_events set status=case when v_lane is null then 'escalated' else 'open' end,payload=payload||jsonb_build_object('executive_decision_id',v_decision_id,'semantic_route',v_route,'affected_goal',v_goal_id,'memory_refs',p_memory_refs,'reality_observed_at',v_observed_at) where source='owner-directive' and kind='ceo_command' and external_ref=p_command_id::text;
  insert into dabbir_private.executive_audit_logs(command_id,actor,action,project_key,reason,result,metadata) values(p_command_id,'BARMAN Executive OS','EXECUTIVE_DECISION','DABBIR','SITUATION_BEFORE_ACTION',case when v_lane is null then 'BLOCKED' else 'DECIDED' end,jsonb_build_object('decision_id',v_decision_id,'route',v_route,'goal_id',v_goal_id,'memory_refs',p_memory_refs,'reality',p_reality,'situation',p_situation));
  return jsonb_build_object('ok',true,'decision_id',v_decision_id,'state',case when v_lane is null then v_block_reason else 'DECIDED' end,'execution_lane',v_lane,'goal_id',v_goal_id);
end;
$function$;
revoke all on function public.barman_executive_next_unprepared_v1() from public, anon, authenticated;
revoke all on function public.barman_executive_decide_v1(uuid,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.barman_executive_next_unprepared_v1() to service_role;
grant execute on function public.barman_executive_decide_v1(uuid,jsonb,jsonb,jsonb,jsonb) to service_role;
