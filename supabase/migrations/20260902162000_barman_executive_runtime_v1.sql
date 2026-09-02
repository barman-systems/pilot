-- Durable runtime for BARMAN Executive OS.
-- The command ledger lives in the private schema in Mumbai; only server-side
-- service-role workers may claim or finalize work through these RPCs.

alter table dabbir_private.dabbir_ceo_commands
  add column if not exists attempt_count integer not null default 0,
  add column if not exists lease_until timestamptz,
  add column if not exists worker_id text,
  add column if not exists execution_lane text,
  add column if not exists execution_plan jsonb not null default '{}'::jsonb,
  add column if not exists last_error text,
  add column if not exists completed_at timestamptz;

alter table dabbir_private.dabbir_ceo_commands
  drop constraint if exists dabbir_ceo_commands_attempt_count_check;
alter table dabbir_private.dabbir_ceo_commands
  add constraint dabbir_ceo_commands_attempt_count_check
  check (attempt_count between 0 and 12);

alter table dabbir_private.dabbir_ceo_commands
  drop constraint if exists dabbir_ceo_commands_execution_plan_check;
alter table dabbir_private.dabbir_ceo_commands
  add constraint dabbir_ceo_commands_execution_plan_check
  check (jsonb_typeof(execution_plan) = 'object');

create index if not exists dabbir_ceo_commands_runtime_claim_idx
  on dabbir_private.dabbir_ceo_commands(status, execution_lane, priority, created_at)
  where status in ('QUEUED','ACCEPTED','IN_PROGRESS');

create or replace function public.barman_executive_claim_v1(
  p_worker_id text,
  p_lane text,
  p_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $$
declare
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_event dabbir_private.executive_events%rowtype;
  v_run_id uuid := gen_random_uuid();
  v_action_id uuid := gen_random_uuid();
  v_worker text := left(btrim(coalesce(p_worker_id,'')),120);
  v_lane text := lower(left(btrim(coalesce(p_lane,'')),40));
  v_lease integer := greatest(60,least(coalesce(p_lease_seconds,300),3600));
begin
  if v_worker = '' then raise exception 'WORKER_ID_REQUIRED'; end if;
  if v_lane not in ('runtime','tool_agent') then raise exception 'EXECUTION_LANE_INVALID'; end if;

  select c.* into v_command
  from dabbir_private.dabbir_ceo_commands c
  where c.status in ('QUEUED','ACCEPTED','IN_PROGRESS')
    and c.attempt_count < 12
    and (c.lease_until is null or c.lease_until < now())
    and coalesce(c.execution_lane,
      case
        when char_length(c.command_text) <= 160
          and btrim(c.command_text) ~* '^(اعطني|أعطني|اريد|أريد|give me|show)?[[:space:]]*(تقرير|الحالة|حاله|افحص|فحص|صحة|صحه|status|report|health)([[:space:]]+(دبر|dabbir))?[[:space:]؟?!.]*$'
          then 'runtime'
        else 'tool_agent'
      end
    ) = v_lane
  order by case c.priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end,
           c.created_at
  for update skip locked
  limit 1;

  if not found then return jsonb_build_object('ok',true,'claimed',false); end if;

  select * into v_event
  from dabbir_private.executive_events e
  where e.source='owner-directive' and e.kind='ceo_command' and e.external_ref=v_command.id::text
  order by e.detected_at desc
  for update
  limit 1;

  update dabbir_private.dabbir_ceo_commands
  set status='IN_PROGRESS', claimed_at=coalesce(claimed_at,now()), updated_at=now(),
      attempt_count=attempt_count+1, lease_until=now()+make_interval(secs=>v_lease),
      worker_id=v_worker, execution_lane=v_lane, last_error=null
  where id=v_command.id
  returning * into v_command;

  if v_event.id is not null then
    update dabbir_private.executive_events
    set status='claimed', payload=payload || jsonb_build_object(
      'worker_id',v_worker,'execution_lane',v_lane,'claimed_at',now(),'attempt_count',v_command.attempt_count
    )
    where id=v_event.id
    returning * into v_event;
  end if;

  insert into dabbir_private.executive_runs(id,trigger_type,trigger_ref,status,started_at,metrics)
  values(v_run_id,'owner',v_command.id::text,'running',now(),jsonb_build_object('worker_id',v_worker,'lane',v_lane,'attempt',v_command.attempt_count));

  insert into dabbir_private.executive_actions(
    id,run_id,event_id,action_type,authority_level,status,description,owner_interruption,started_at
  ) values(
    v_action_id,v_run_id,v_event.id,'execute_owner_command','auto','running',v_command.command_text,false,now()
  );

  return jsonb_build_object(
    'ok',true,'claimed',true,'command',to_jsonb(v_command),
    'event_id',v_event.id,'run_id',v_run_id,'action_id',v_action_id
  );
end;
$$;

create or replace function public.barman_executive_finalize_v1(
  p_command_id uuid,
  p_run_id uuid,
  p_action_id uuid,
  p_outcome text,
  p_summary text,
  p_evidence jsonb default '[]'::jsonb,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $$
declare
  v_outcome text := upper(btrim(coalesce(p_outcome,'')));
  v_summary text := left(btrim(coalesce(p_summary,'')),4000);
  v_evidence jsonb := coalesce(p_evidence,'[]'::jsonb);
  v_event_id uuid;
  v_item jsonb;
  v_final_status text;
begin
  if v_outcome not in ('DONE','BLOCKED','RETRY') then raise exception 'OUTCOME_INVALID'; end if;
  if jsonb_typeof(v_evidence) <> 'array' then raise exception 'EVIDENCE_ARRAY_REQUIRED'; end if;
  if v_outcome='DONE' and (v_summary='' or jsonb_array_length(v_evidence)=0) then
    raise exception 'DONE_REQUIRES_SUMMARY_AND_EVIDENCE';
  end if;

  select e.id into v_event_id
  from dabbir_private.executive_events e
  where e.source='owner-directive' and e.kind='ceo_command' and e.external_ref=p_command_id::text
  order by e.detected_at desc limit 1;

  v_final_status := case v_outcome when 'DONE' then 'DONE' when 'BLOCKED' then 'BLOCKED' else 'QUEUED' end;
  update dabbir_private.dabbir_ceo_commands
  set status=v_final_status, result_summary=nullif(v_summary,''), evidence=v_evidence,
      blocked_reason=case when v_outcome='BLOCKED' then left(coalesce(p_error,v_summary),2000) else null end,
      last_error=left(p_error,2000), completed_at=case when v_outcome in ('DONE','BLOCKED') then now() else null end,
      lease_until=null, worker_id=case when v_outcome='RETRY' then null else worker_id end, updated_at=now()
  where id=p_command_id;

  -- Evidence must exist before the action becomes verified. The database
  -- verification trigger intentionally rejects the opposite order.
  for v_item in select value from jsonb_array_elements(v_evidence)
  loop
    insert into dabbir_private.executive_evidence(action_id,evidence_type,reference,details,verified)
    values(
      p_action_id,
      case when coalesce(v_item->>'type','') in ('commit','deployment','test','query','log','url','artifact','decision') then v_item->>'type' else 'artifact' end,
      left(coalesce(nullif(v_item->>'reference',''),'barman-runtime:'||p_command_id::text),1000),
      coalesce(v_item->'details','{}'::jsonb),
      coalesce((v_item->>'verified')::boolean,false)
    );
  end loop;

  update dabbir_private.executive_actions
  set status=case when v_outcome='DONE' then 'verified' when v_outcome='BLOCKED' then 'failed' else 'failed' end,
      completed_at=now(), error_message=left(p_error,2000)
  where id=p_action_id and run_id=p_run_id;

  if v_event_id is not null then
    update dabbir_private.executive_events
    set status=case when v_outcome='DONE' then 'resolved' when v_outcome='BLOCKED' then 'escalated' else 'open' end,
        resolved_at=case when v_outcome in ('DONE','BLOCKED') then now() else null end,
        payload=payload || jsonb_build_object('outcome',v_outcome,'summary',v_summary,'finished_at',now())
    where id=v_event_id;
  end if;

  update dabbir_private.executive_runs
  set status=case when v_outcome='DONE' then 'completed' when v_outcome='BLOCKED' then 'partial' else 'failed' end,
      finished_at=now(), summary=nullif(v_summary,''),
      metrics=metrics || jsonb_build_object('outcome',v_outcome,'evidence_count',jsonb_array_length(v_evidence))
  where id=p_run_id;

  return jsonb_build_object('ok',true,'command_id',p_command_id,'status',v_final_status,'outcome',v_outcome);
end;
$$;

revoke all on function public.barman_executive_claim_v1(text,text,integer) from public, anon, authenticated;
revoke all on function public.barman_executive_finalize_v1(uuid,uuid,uuid,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.barman_executive_claim_v1(text,text,integer) to service_role;
grant execute on function public.barman_executive_finalize_v1(uuid,uuid,uuid,text,text,jsonb,text) to service_role;

comment on function public.barman_executive_claim_v1(text,text,integer) is
  'Atomically claims one DABBIR owner command with a bounded lease and creates its run/action evidence chain.';
comment on function public.barman_executive_finalize_v1(uuid,uuid,uuid,text,text,jsonb,text) is
  'Finalizes a BARMAN command; DONE fails closed unless a summary and at least one evidence item are supplied.';
