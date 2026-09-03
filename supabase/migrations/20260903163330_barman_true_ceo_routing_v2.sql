create or replace function public.barman_executive_claim_v1(p_worker_id text,p_lane text,p_lease_seconds integer default 300)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private','pg_temp'
as $$
declare
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_event dabbir_private.executive_events%rowtype;
  v_run_id uuid:=gen_random_uuid();
  v_action_id uuid:=gen_random_uuid();
  v_worker text:=left(btrim(coalesce(p_worker_id,'')),120);
  v_lane text:=lower(left(btrim(coalesce(p_lane,'')),40));
  v_lease integer:=greatest(60,least(coalesce(p_lease_seconds,300),3600));
begin
  if v_worker='' then raise exception 'WORKER_ID_REQUIRED'; end if;
  if v_lane not in ('runtime','tool_agent','read_only','planner') then raise exception 'EXECUTION_LANE_INVALID'; end if;

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
        when btrim(c.command_text) ~* '(^|[[:space:]])(كم|ما عدد|عدد|احصاء|إحصاء|إحصائية|احصائية|statistics?|count|how many|نشاط|activity)([[:space:]]|$)'
          then 'read_only'
        when btrim(c.command_text) ~ E'(^|\n)[[:space:]]*([0-9]+[.)]|[-•])[[:space:]]+(.|\n)*\n[[:space:]]*([0-9]+[.)]|[-•])[[:space:]]+'
          then 'planner'
        when btrim(c.command_text) ~* '(راجع|افحص|حلل|دقق|audit|review|inspect|analy[sz]e)'
          and btrim(c.command_text) ~* '(نفذ|أصلح|اصلح|طوّر|طور|عدّل|عدل|implement|fix|execute|repair|develop)'
          then 'planner'
        else 'tool_agent'
      end
    )=v_lane
  order by case c.priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end,c.created_at
  for update skip locked limit 1;

  if not found then return jsonb_build_object('ok',true,'claimed',false); end if;

  select * into v_event from dabbir_private.executive_events e
  where e.source='owner-directive' and e.kind='ceo_command' and e.external_ref=v_command.id::text
  order by e.detected_at desc for update limit 1;

  update dabbir_private.dabbir_ceo_commands
  set status='IN_PROGRESS',orchestration_state=case when v_lane='planner' then 'PLANNING' else 'EXECUTING' end,
      claimed_at=coalesce(claimed_at,now()),updated_at=now(),attempt_count=attempt_count+1,
      lease_until=now()+make_interval(secs=>v_lease),worker_id=v_worker,execution_lane=v_lane,last_error=null
  where id=v_command.id returning * into v_command;

  if v_event.id is not null then
    update dabbir_private.executive_events set status='claimed',payload=payload||jsonb_build_object('worker_id',v_worker,'execution_lane',v_lane,'claimed_at',now(),'attempt_count',v_command.attempt_count) where id=v_event.id returning * into v_event;
  end if;

  insert into dabbir_private.executive_runs(id,trigger_type,trigger_ref,status,started_at,metrics)
  values(v_run_id,'owner',v_command.id::text,'running',now(),jsonb_build_object('worker_id',v_worker,'lane',v_lane,'attempt',v_command.attempt_count));
  insert into dabbir_private.executive_actions(id,run_id,event_id,action_type,authority_level,status,description,owner_interruption,started_at)
  values(v_action_id,v_run_id,v_event.id,case when v_lane='planner' then 'plan_owner_command' when v_lane='read_only' then 'read_owner_data' else 'execute_owner_command' end,'auto','running',v_command.command_text,false,now());

  return jsonb_build_object('ok',true,'claimed',true,'command',to_jsonb(v_command),'event_id',v_event.id,'run_id',v_run_id,'action_id',v_action_id);
end;
$$;
revoke all on function public.barman_executive_claim_v1(text,text,integer) from public,anon,authenticated;
grant execute on function public.barman_executive_claim_v1(text,text,integer) to service_role;

create or replace function public.barman_executive_finalize_v1(p_command_id uuid,p_run_id uuid,p_action_id uuid,p_outcome text,p_summary text,p_evidence jsonb default '[]'::jsonb,p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private','pg_temp'
as $$
declare
  v_outcome text:=upper(btrim(coalesce(p_outcome,'')));
  v_summary text:=left(btrim(coalesce(p_summary,'')),4000);
  v_evidence jsonb:=coalesce(p_evidence,'[]'::jsonb);
  v_event_id uuid;
  v_item jsonb;
  v_final_status text;
  v_verified boolean;
begin
  if v_outcome not in ('DONE','BLOCKED','RETRY') then raise exception 'OUTCOME_INVALID'; end if;
  if jsonb_typeof(v_evidence)<>'array' then raise exception 'EVIDENCE_ARRAY_REQUIRED'; end if;
  if v_outcome='DONE' and (v_summary='' or jsonb_array_length(v_evidence)=0) then raise exception 'DONE_REQUIRES_SUMMARY_AND_EVIDENCE'; end if;

  select e.id into v_event_id from dabbir_private.executive_events e where e.source='owner-directive' and e.kind='ceo_command' and e.external_ref=p_command_id::text order by e.detected_at desc limit 1;
  v_final_status:=case v_outcome when 'DONE' then 'DONE' when 'BLOCKED' then 'BLOCKED' else 'QUEUED' end;

  update dabbir_private.dabbir_ceo_commands set status=v_final_status,
    orchestration_state=case v_outcome when 'DONE' then 'COMPLETED' when 'BLOCKED' then 'BLOCKED' else 'QUEUED' end,
    verification_status=case v_outcome when 'DONE' then 'VERIFIED' when 'BLOCKED' then 'FAILED' else 'PENDING' end,
    result_summary=nullif(v_summary,''),evidence=v_evidence,
    blocked_reason=case when v_outcome='BLOCKED' then left(coalesce(p_error,v_summary),2000) else null end,
    last_error=left(p_error,2000),completed_at=case when v_outcome in ('DONE','BLOCKED') then now() else null end,
    lease_until=null,worker_id=case when v_outcome='RETRY' then null else worker_id end,updated_at=now()
  where id=p_command_id;

  for v_item in select value from jsonb_array_elements(v_evidence)
  loop
    v_verified:=coalesce((v_item->>'verified')::boolean,false);
    insert into dabbir_private.executive_evidence(action_id,evidence_type,reference,details,verified,produced_by,verified_by,verified_at,verification_method,evidence_hash)
    values(p_action_id,
      case when coalesce(v_item->>'type','') in ('commit','deployment','test','query','log','url','artifact','decision') then v_item->>'type' else 'artifact' end,
      left(coalesce(nullif(v_item->>'reference',''),'barman-runtime:'||p_command_id::text),1000),
      coalesce(v_item->'details','{}'::jsonb),v_verified,
      left(coalesce(v_item#>>'{details,produced_by}','executing-worker'),120),
      case when v_verified then left(coalesce(v_item#>>'{details,verified_by}','self'),120) else null end,
      case when v_verified then now() else null end,
      case when v_verified then left(coalesce(v_item#>>'{details,verification_method}','SELF_ASSERTED'),120) else null end,
      left(nullif(v_item#>>'{details,evidence_hash}',''),256));
  end loop;

  update dabbir_private.executive_actions set status=case when v_outcome='DONE' then 'verified' when v_outcome='BLOCKED' then 'failed' else 'failed' end,completed_at=now(),error_message=left(p_error,2000) where id=p_action_id and run_id=p_run_id;
  if v_event_id is not null then update dabbir_private.executive_events set status=case when v_outcome='DONE' then 'resolved' when v_outcome='BLOCKED' then 'escalated' else 'open' end,resolved_at=case when v_outcome in ('DONE','BLOCKED') then now() else null end,payload=payload||jsonb_build_object('outcome',v_outcome,'summary',v_summary,'finished_at',now()) where id=v_event_id; end if;
  update dabbir_private.executive_runs set status=case when v_outcome='DONE' then 'completed' when v_outcome='BLOCKED' then 'partial' else 'failed' end,finished_at=now(),summary=nullif(v_summary,''),metrics=metrics||jsonb_build_object('outcome',v_outcome,'evidence_count',jsonb_array_length(v_evidence)) where id=p_run_id;
  return jsonb_build_object('ok',true,'command_id',p_command_id,'status',v_final_status,'outcome',v_outcome);
end;
$$;
revoke all on function public.barman_executive_finalize_v1(uuid,uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.barman_executive_finalize_v1(uuid,uuid,uuid,text,text,jsonb,text) to service_role;

create or replace function public.barman_executive_decompose_v1(p_command_id uuid,p_run_id uuid,p_action_id uuid,p_tasks jsonb)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private','pg_temp'
as $$
declare
  v_parent dabbir_private.dabbir_ceo_commands%rowtype;
  v_item jsonb;v_child_id uuid;v_task_id uuid;v_text text;v_title text;v_kind text;v_lane text;v_risk text;v_seq integer:=0;v_children jsonb:='[]'::jsonb;
begin
  if p_command_id is null or p_run_id is null or p_action_id is null then raise exception 'EXECUTION_IDS_REQUIRED'; end if;
  if jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks)<2 or jsonb_array_length(p_tasks)>12 then raise exception 'PLAN_TASKS_INVALID'; end if;
  select * into v_parent from dabbir_private.dabbir_ceo_commands where id=p_command_id for update;
  if not found then raise exception 'PARENT_COMMAND_NOT_FOUND'; end if;
  if v_parent.parent_command_id is not null then raise exception 'NESTED_DECOMPOSITION_DENIED'; end if;
  if v_parent.status<>'IN_PROGRESS' then raise exception 'PARENT_NOT_IN_PROGRESS'; end if;
  for v_item in select value from jsonb_array_elements(p_tasks) loop
    v_seq:=v_seq+1;v_text:=btrim(coalesce(v_item->>'command_text',''));v_title:=left(coalesce(nullif(btrim(v_item->>'title'),''),v_text),240);v_kind:=upper(coalesce(nullif(btrim(v_item->>'kind'),''),'REPO_CHANGE'));v_risk:=upper(coalesce(nullif(btrim(v_item->>'risk_level'),''),'MEDIUM'));
    if char_length(v_text)<4 or char_length(v_text)>1600 then raise exception 'PLAN_TASK_TEXT_INVALID'; end if;
    if v_kind='OWNER_GATE' then raise exception 'PLAN_OWNER_GATE_REQUIRES_ESCALATION'; end if;
    if v_kind not in ('REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED') then v_kind:='REVIEW_REQUIRED'; end if;
    if v_risk not in ('LOW','MEDIUM','HIGH','CRITICAL') then v_risk:='MEDIUM'; end if;
    v_lane:=case v_kind when 'DATA_QUERY' then 'read_only' when 'REPO_CHANGE' then 'tool_agent' else 'tool_agent' end;
    v_child_id:=gen_random_uuid();
    insert into dabbir_private.dabbir_ceo_commands(id,created_by,command_text,priority,status,source,objective,acceptance_criteria,due_at,parent_command_id,orchestration_state,risk_level,autonomy_level,verification_status,idempotency_key,execution_plan,execution_lane)
    values(v_child_id,v_parent.created_by,v_text,v_parent.priority,'QUEUED','owner_command_center',v_parent.objective,'[]'::jsonb,v_parent.due_at,p_command_id,'QUEUED',v_risk,case when v_kind='EXTERNAL_ACTION' then 'A5' else 'A3' end,'PENDING','parent:'||p_command_id::text||':task:'||v_seq,jsonb_build_object('parent_command_id',p_command_id,'sequence',v_seq,'route',v_kind,'planned_by','BARMAN Executive OS'),v_lane);
    insert into dabbir_private.executive_events(id,fingerprint,source,kind,severity,status,project_key,external_ref,summary,payload,detected_at)
    values(gen_random_uuid(),'owner-command:'||v_child_id,'owner-directive','ceo_command',case v_parent.priority when 'P0' then 'critical' when 'P1' then 'high' when 'P2' then 'medium' else 'low' end,'open','DABBIR',v_child_id::text,v_text,jsonb_build_object('parent_command_id',p_command_id,'planned_route',v_kind,'sequence',v_seq),now());
    insert into dabbir_private.executive_task_nodes(command_id,sequence_no,title,command_text,kind,status,priority,risk_level,authority_level,owner_agent,child_command_id,idempotency_key,input)
    values(p_command_id,v_seq,v_title,v_text,v_kind,'QUEUED',v_parent.priority,v_risk,case when v_kind='EXTERNAL_ACTION' then 'owner_only' else 'auto' end,'BARMAN Executive OS',v_child_id,'parent:'||p_command_id::text||':task:'||v_seq,jsonb_build_object('planned_from',p_command_id,'kind',v_kind,'execution_lane',v_lane)) returning id into v_task_id;
    v_children:=v_children||jsonb_build_array(jsonb_build_object('task_id',v_task_id,'command_id',v_child_id,'sequence',v_seq,'title',v_title,'kind',v_kind,'execution_lane',v_lane));
  end loop;
  update dabbir_private.dabbir_ceo_commands set orchestration_state='WAITING',execution_plan=jsonb_build_object('contract','BARMAN_DAG_V2','children',v_children,'planned_at',now()),result_summary='تم تفكيك الأمر إلى '||v_seq||' مهام تنفيذية مستقلة.',lease_until=now()+interval '7 days',updated_at=now() where id=p_command_id;
  update dabbir_private.executive_actions set status='planned',completed_at=now() where id=p_action_id and run_id=p_run_id;
  update dabbir_private.executive_runs set status='partial',finished_at=now(),summary='DECOMPOSED_TO_DAG',metrics=metrics||jsonb_build_object('child_count',v_seq,'planner','BARMAN Executive OS') where id=p_run_id;
  insert into dabbir_private.executive_audit_logs(execution_id,command_id,actor,action,project_key,reason,result,metadata) values(p_run_id,p_command_id,'BARMAN Executive OS','DECOMPOSE_COMMAND','DABBIR','MULTI_STEP_COMMAND','PLANNED',jsonb_build_object('children',v_children));
  return jsonb_build_object('ok',true,'parent_command_id',p_command_id,'child_count',v_seq,'children',v_children,'state','WAITING');
end;
$$;
revoke all on function public.barman_executive_decompose_v1(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.barman_executive_decompose_v1(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.barman_executive_self_diagnostic_v1()
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private','pg_temp' as $$
declare v_broken integer;v_partial integer;v_stale integer;v_queue integer;v_weak integer;v_cron integer;v_status text;
begin
 select count(*) into v_broken from dabbir_private.executive_integrations where status in ('BROKEN','MISSING','UNAUTHORIZED');
 select count(*) into v_partial from dabbir_private.executive_integrations where status='PARTIAL';
 select count(*) into v_stale from dabbir_private.dabbir_ceo_commands where status='IN_PROGRESS' and coalesce(lease_until,now()-interval '1 second')<now();
 select count(*) into v_queue from dabbir_private.dabbir_ceo_commands where status='QUEUED';
 select count(*) into v_weak from dabbir_private.executive_evidence where verified=true and coalesce(verification_method,'') in ('','LEGACY_SELF_ASSERTED','SELF_ASSERTED');
 select count(*) into v_cron from cron.job where active=true and jobname in ('barman-executive-rollup','barman-executive-heartbeat');
 v_status:=case when v_broken>0 then 'PARTIAL' when v_stale>0 or v_cron<2 then 'DEGRADED' else 'HEALTHY' end;
 return jsonb_build_object('ok',true,'service','BARMAN Executive OS','status',v_status,'autonomy_level','A3','canonical_database','fphpoysqdsceniwduxjq','metrics',jsonb_build_object('broken_integrations',v_broken,'partial_integrations',v_partial,'queued_commands',v_queue,'stale_in_progress',v_stale,'weak_verified_evidence',v_weak,'active_core_cron_jobs',v_cron),'checked_at',now());
end;$$;
revoke all on function public.barman_executive_self_diagnostic_v1() from public,anon,authenticated;
grant execute on function public.barman_executive_self_diagnostic_v1() to service_role;
