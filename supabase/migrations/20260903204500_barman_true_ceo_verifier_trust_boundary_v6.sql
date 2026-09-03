-- BARMAN Executive OS verifier trust-boundary hardening v6.
-- Executor-produced evidence is evidence-of-execution only. It must never be
-- able to self-assert independent verification through caller-controlled JSON.

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
  v_verification_status text;
begin
  if v_outcome not in ('DONE','BLOCKED','RETRY') then
    raise exception 'OUTCOME_INVALID';
  end if;
  if jsonb_typeof(v_evidence) <> 'array' then
    raise exception 'EVIDENCE_ARRAY_REQUIRED';
  end if;
  if v_outcome='DONE' and (v_summary='' or jsonb_array_length(v_evidence)=0) then
    raise exception 'DONE_REQUIRES_SUMMARY_AND_EVIDENCE';
  end if;

  select e.id into v_event_id
  from dabbir_private.executive_events e
  where e.source='owner-directive'
    and e.kind='ceo_command'
    and e.external_ref=p_command_id::text
  order by e.detected_at desc
  limit 1;

  -- CRITICAL TRUST BOUNDARY:
  -- Never honor verified/verified_by/verification_method supplied by the
  -- executor. Those fields are claims made by the party being verified.
  -- Independent verification can only be recorded by the dedicated verifier
  -- function after the executor has finished.
  for v_item in select value from jsonb_array_elements(v_evidence)
  loop
    insert into dabbir_private.executive_evidence(
      action_id,
      evidence_type,
      reference,
      details,
      verified,
      produced_by,
      verified_by,
      verified_at,
      verification_method,
      evidence_hash
    ) values (
      p_action_id,
      case
        when coalesce(v_item->>'type','') in ('commit','deployment','test','query','log','url','artifact','decision')
          then v_item->>'type'
        else 'artifact'
      end,
      left(coalesce(nullif(v_item->>'reference',''),'barman-runtime:'||p_command_id::text),1000),
      coalesce(v_item->'details','{}'::jsonb)
        - 'verified_by'
        - 'verification_method'
        || jsonb_build_object(
             'executor_claimed_verified', coalesce((v_item->>'verified')::boolean,false),
             'trust_boundary', 'EXECUTOR_UNVERIFIED'
           ),
      false,
      left(coalesce(nullif(v_item#>>'{details,produced_by}',''),'executing-worker'),120),
      null,
      null,
      null,
      left(nullif(v_item#>>'{details,evidence_hash}',''),256)
    );
  end loop;

  v_final_status := case v_outcome
    when 'DONE' then 'DONE'
    when 'BLOCKED' then 'BLOCKED'
    else 'QUEUED'
  end;

  v_verification_status := case v_outcome
    when 'DONE' then 'INDEPENDENT_REQUIRED'
    when 'BLOCKED' then 'FAILED'
    else 'PENDING'
  end;

  update dabbir_private.dabbir_ceo_commands
  set status=v_final_status,
      orchestration_state=case v_outcome
        when 'DONE' then 'VERIFYING'
        when 'BLOCKED' then 'BLOCKED'
        else 'QUEUED'
      end,
      verification_status=v_verification_status,
      result_summary=nullif(v_summary,''),
      evidence=v_evidence,
      blocked_reason=case when v_outcome='BLOCKED' then left(coalesce(p_error,v_summary),2000) else null end,
      last_error=left(p_error,2000),
      completed_at=case when v_outcome in ('DONE','BLOCKED') then now() else null end,
      lease_until=null,
      worker_id=case when v_outcome='RETRY' then null else worker_id end,
      updated_at=now()
  where id=p_command_id;

  -- A DONE executor action remains non-verified until a separate verifier
  -- records independently checked evidence.
  update dabbir_private.executive_actions
  set status=case
        when v_outcome='DONE' then 'running'
        when v_outcome='BLOCKED' then 'failed'
        else 'failed'
      end,
      completed_at=case when v_outcome='DONE' then null else now() end,
      error_message=left(p_error,2000)
  where id=p_action_id and run_id=p_run_id;

  if v_event_id is not null then
    update dabbir_private.executive_events
    set status=case
          when v_outcome='DONE' then 'claimed'
          when v_outcome='BLOCKED' then 'escalated'
          else 'open'
        end,
        resolved_at=case when v_outcome='BLOCKED' then now() else null end,
        payload=payload || jsonb_build_object(
          'outcome',v_outcome,
          'summary',v_summary,
          'verification_status',v_verification_status,
          'trusted_evidence_count',0,
          'finished_at',now()
        )
    where id=v_event_id;
  end if;

  update dabbir_private.executive_runs
  set status=case
        when v_outcome='DONE' then 'partial'
        when v_outcome='BLOCKED' then 'partial'
        else 'failed'
      end,
      finished_at=now(),
      summary=nullif(v_summary,''),
      metrics=metrics || jsonb_build_object(
        'outcome',v_outcome,
        'evidence_count',jsonb_array_length(v_evidence),
        'trusted_evidence_count',0,
        'verification_status',v_verification_status
      )
  where id=p_run_id;

  insert into dabbir_private.executive_audit_logs(
    execution_id,command_id,actor,action,project_key,reason,result,metadata
  ) values (
    p_run_id,p_command_id,'BARMAN Executive OS','EXECUTOR_FINALIZE','DABBIR',
    'EXECUTOR_EVIDENCE_IS_UNTRUSTED',v_verification_status,
    jsonb_build_object(
      'outcome',v_outcome,
      'evidence_count',jsonb_array_length(v_evidence),
      'trust_boundary','EXECUTOR_UNVERIFIED'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'command_id',p_command_id,
    'status',v_final_status,
    'outcome',v_outcome,
    'verification_status',v_verification_status,
    'trusted_evidence_count',0
  );
end;
$$;

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
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $$
declare
  v_method text := upper(btrim(coalesce(p_method,'')));
  v_verifier text := left(btrim(coalesce(p_verifier,'')),120);
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_action_id uuid;
  v_executor_evidence_count integer;
begin
  if v_verifier='' then raise exception 'VERIFIER_REQUIRED'; end if;
  if v_method not in ('INDEPENDENT_VERIFIER','EXTERNAL_RECHECK','CI_AND_PRODUCTION_RECHECK') then
    raise exception 'VERIFICATION_METHOD_DENIED';
  end if;

  select * into v_command
  from dabbir_private.dabbir_ceo_commands
  where id=p_command_id
  for update;

  if not found then raise exception 'COMMAND_NOT_FOUND'; end if;
  if v_command.status<>'DONE' or v_command.verification_status<>'INDEPENDENT_REQUIRED' then
    raise exception 'COMMAND_NOT_AWAITING_VERIFICATION';
  end if;
  if nullif(v_command.worker_id,'') is not null and v_verifier=v_command.worker_id then
    raise exception 'EXECUTOR_CANNOT_VERIFY_OWN_COMMAND';
  end if;

  select a.id into v_action_id
  from dabbir_private.executive_actions a
  join dabbir_private.executive_runs r on r.id=a.run_id
  where r.trigger_ref=p_command_id::text
  order by a.started_at desc
  limit 1;

  if v_action_id is null then raise exception 'EXECUTION_ACTION_NOT_FOUND'; end if;

  select count(*) into v_executor_evidence_count
  from dabbir_private.executive_evidence e
  where e.action_id=v_action_id
    and e.verified=false;

  if v_executor_evidence_count < 1 then
    raise exception 'EXECUTOR_EVIDENCE_REQUIRED_BEFORE_VERIFICATION';
  end if;

  insert into dabbir_private.executive_evidence(
    action_id,evidence_type,reference,details,verified,
    produced_by,verified_by,verified_at,verification_method
  ) values (
    v_action_id,
    'test',
    left(coalesce(nullif(p_reference,''),'independent-verification:'||p_command_id::text),1000),
    coalesce(p_details,'{}'::jsonb) || jsonb_build_object('trust_boundary','INDEPENDENT_VERIFIER'),
    true,
    'independent-verifier',
    v_verifier,
    now(),
    v_method
  );

  update dabbir_private.executive_actions
  set status='verified',completed_at=now(),error_message=null
  where id=v_action_id;

  update dabbir_private.dabbir_ceo_commands
  set verification_status='VERIFIED',orchestration_state='COMPLETED',updated_at=now()
  where id=p_command_id;

  update dabbir_private.executive_events
  set status='resolved',resolved_at=now(),
      payload=payload || jsonb_build_object(
        'independent_verified_at',now(),
        'verified_by',v_verifier,
        'verification_method',v_method
      )
  where source='owner-directive' and kind='ceo_command' and external_ref=p_command_id::text;

  insert into dabbir_private.executive_audit_logs(
    command_id,actor,action,project_key,reason,result,artifact_ref,metadata
  ) values (
    p_command_id,v_verifier,'INDEPENDENT_VERIFY','DABBIR',v_method,'VERIFIED',
    left(p_reference,1000),
    coalesce(p_details,'{}'::jsonb) || jsonb_build_object('trust_boundary','INDEPENDENT_VERIFIER')
  );

  return jsonb_build_object(
    'ok',true,
    'command_id',p_command_id,
    'verification_status','VERIFIED',
    'verified_by',v_verifier,
    'method',v_method
  );
end;
$$;

revoke all on function public.barman_executive_finalize_v1(uuid,uuid,uuid,text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.barman_executive_verify_command_v1(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.barman_executive_finalize_v1(uuid,uuid,uuid,text,text,jsonb,text) to service_role;
grant execute on function public.barman_executive_verify_command_v1(uuid,text,text,text,jsonb) to service_role;

comment on function public.barman_executive_finalize_v1(uuid,uuid,uuid,text,text,jsonb,text) is
  'Finalizes executor work. Executor evidence is always persisted unverified; DONE always requires independent verification.';
comment on function public.barman_executive_verify_command_v1(uuid,text,text,text,jsonb) is
  'Records a separate verifier result for a DONE command awaiting independent verification; the executor identity cannot verify its own command.';
