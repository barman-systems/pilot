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
        when btrim(c.command_text) ~ E'(^|\n)[[:space:]]*([0-9]+[.)]|[-•])[[:space:]]+(.|\n)*\n[[:space:]]*([0-9]+[.)]|[-•])[[:space:]]+'
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

  if not found then return jsonb_build_object('ok',true,'claimed',false); end if;
  select * into v_event from dabbir_private.executive_events e where e.source='owner-directive' and e.kind='ceo_command' and e.external_ref=v_command.id::text order by e.detected_at desc for update limit 1;
  update dabbir_private.dabbir_ceo_commands set status='IN_PROGRESS',orchestration_state=case when v_lane='planner' then 'PLANNING' else 'EXECUTING' end,claimed_at=coalesce(claimed_at,now()),updated_at=now(),attempt_count=attempt_count+1,lease_until=now()+make_interval(secs=>v_lease),worker_id=v_worker,execution_lane=v_lane,last_error=null where id=v_command.id returning * into v_command;
  if v_event.id is not null then update dabbir_private.executive_events set status='claimed',payload=payload||jsonb_build_object('worker_id',v_worker,'execution_lane',v_lane,'claimed_at',now(),'attempt_count',v_command.attempt_count) where id=v_event.id returning * into v_event; end if;
  insert into dabbir_private.executive_runs(id,trigger_type,trigger_ref,status,started_at,metrics) values(v_run_id,'owner',v_command.id::text,'running',now(),jsonb_build_object('worker_id',v_worker,'lane',v_lane,'attempt',v_command.attempt_count));
  insert into dabbir_private.executive_actions(id,run_id,event_id,action_type,authority_level,status,description,owner_interruption,started_at) values(v_action_id,v_run_id,v_event.id,case when v_lane='planner' then 'plan_owner_command' when v_lane='read_only' then 'read_owner_data' else 'execute_owner_command' end,'auto','running',v_command.command_text,false,now());
  return jsonb_build_object('ok',true,'claimed',true,'command',to_jsonb(v_command),'event_id',v_event.id,'run_id',v_run_id,'action_id',v_action_id);
end;
$$;
revoke all on function public.barman_executive_claim_v1(text,text,integer) from public,anon,authenticated;
grant execute on function public.barman_executive_claim_v1(text,text,integer) to service_role;
