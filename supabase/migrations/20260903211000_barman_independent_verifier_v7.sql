-- BARMAN Executive OS independent verifier v7.
-- The executor and verifier are separated at the application identity boundary.

create or replace function public.barman_executive_claim_verification_v1(
  p_verifier_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $$
declare
  v_verifier text := left(btrim(coalesce(p_verifier_id,'')),120);
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_action_id uuid;
  v_evidence jsonb := '[]'::jsonb;
begin
  if v_verifier !~ '^github-independent-verifier:[0-9]+$' then
    raise exception 'VERIFIER_ID_DENIED';
  end if;

  select * into v_command
  from dabbir_private.dabbir_ceo_commands c
  where c.status='DONE'
    and c.verification_status='INDEPENDENT_REQUIRED'
    and c.orchestration_state='VERIFYING'
  order by c.updated_at asc, c.created_at asc
  limit 1;

  if not found then
    return jsonb_build_object('claimed',false);
  end if;

  select a.id into v_action_id
  from dabbir_private.executive_runs r
  join dabbir_private.executive_actions a on a.run_id=r.id
  where r.trigger_ref=v_command.id::text
  order by a.started_at desc nulls last, r.started_at desc
  limit 1;

  if v_action_id is null then
    raise exception 'VERIFICATION_ACTION_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'type',e.evidence_type,
    'reference',e.reference,
    'details',e.details,
    'produced_by',e.produced_by,
    'created_at',e.created_at
  ) order by e.created_at),'[]'::jsonb)
  into v_evidence
  from dabbir_private.executive_evidence e
  where e.action_id=v_action_id
    and e.verified=false;

  if jsonb_array_length(v_evidence)=0 then
    raise exception 'VERIFICATION_EVIDENCE_NOT_FOUND';
  end if;

  insert into dabbir_private.executive_audit_logs(
    command_id,actor,action,project_key,reason,result,metadata
  ) values (
    v_command.id,v_verifier,'VERIFICATION_CLAIM','DABBIR',
    'SEPARATE_GITHUB_OIDC_VERIFIER','CLAIMED',
    jsonb_build_object('action_id',v_action_id,'evidence_count',jsonb_array_length(v_evidence))
  );

  return jsonb_build_object(
    'claimed',true,
    'verifier_id',v_verifier,
    'command',jsonb_build_object(
      'id',v_command.id,
      'worker_id',v_command.worker_id,
      'execution_lane',v_command.execution_lane,
      'result_summary',v_command.result_summary,
      'action_id',v_action_id,
      'evidence',v_evidence
    )
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
  if v_verifier !~ '^github-independent-verifier:[0-9]+$' then
    raise exception 'VERIFIER_ID_DENIED';
  end if;
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
  order by a.started_at desc nulls last, r.started_at desc
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
    coalesce(p_details,'{}'::jsonb) || jsonb_build_object('trust_boundary','GITHUB_OIDC_INDEPENDENT_VERIFIER'),
    true,
    'github-independent-verifier',
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
    coalesce(p_details,'{}'::jsonb) || jsonb_build_object('trust_boundary','GITHUB_OIDC_INDEPENDENT_VERIFIER')
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

create or replace function public.barman_executive_fail_verification_v1(
  p_command_id uuid,
  p_verifier text,
  p_reason text,
  p_reference text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $$
declare
  v_verifier text := left(btrim(coalesce(p_verifier,'')),120);
  v_reason text := left(btrim(coalesce(p_reason,'')),2000);
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_action_id uuid;
begin
  if v_verifier !~ '^github-independent-verifier:[0-9]+$' then
    raise exception 'VERIFIER_ID_DENIED';
  end if;
  if v_reason='' then raise exception 'VERIFICATION_FAILURE_REASON_REQUIRED'; end if;

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
  order by a.started_at desc nulls last, r.started_at desc
  limit 1;

  if v_action_id is null then raise exception 'EXECUTION_ACTION_NOT_FOUND'; end if;

  insert into dabbir_private.executive_evidence(
    action_id,evidence_type,reference,details,verified,
    produced_by,verified_by,verified_at,verification_method
  ) values (
    v_action_id,
    'test',
    left(coalesce(nullif(p_reference,''),'verification-failure:'||p_command_id::text),1000),
    coalesce(p_details,'{}'::jsonb) || jsonb_build_object(
      'trust_boundary','GITHUB_OIDC_INDEPENDENT_VERIFIER',
      'failure_reason',v_reason
    ),
    true,
    'github-independent-verifier',
    v_verifier,
    now(),
    'CI_AND_PRODUCTION_RECHECK'
  );

  update dabbir_private.executive_actions
  set status='failed',completed_at=now(),error_message=v_reason
  where id=v_action_id;

  update dabbir_private.dabbir_ceo_commands
  set status='BLOCKED',
      orchestration_state='BLOCKED',
      verification_status='FAILED',
      blocked_reason=v_reason,
      last_error=v_reason,
      updated_at=now()
  where id=p_command_id;

  update dabbir_private.executive_events
  set status='escalated',
      resolved_at=null,
      payload=payload || jsonb_build_object(
        'independent_verification_failed_at',now(),
        'verified_by',v_verifier,
        'verification_failure_reason',v_reason
      )
  where source='owner-directive' and kind='ceo_command' and external_ref=p_command_id::text;

  insert into dabbir_private.executive_audit_logs(
    command_id,actor,action,project_key,reason,result,artifact_ref,metadata
  ) values (
    p_command_id,v_verifier,'INDEPENDENT_VERIFY','DABBIR',v_reason,'FAILED',
    left(p_reference,1000),
    coalesce(p_details,'{}'::jsonb) || jsonb_build_object('trust_boundary','GITHUB_OIDC_INDEPENDENT_VERIFIER')
  );

  return jsonb_build_object(
    'ok',true,
    'command_id',p_command_id,
    'verification_status','FAILED',
    'verified_by',v_verifier,
    'reason',v_reason
  );
end;
$$;

revoke all on function public.barman_executive_claim_verification_v1(text) from public, anon, authenticated;
revoke all on function public.barman_executive_verify_command_v1(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.barman_executive_fail_verification_v1(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.barman_executive_claim_verification_v1(text) to service_role;
grant execute on function public.barman_executive_verify_command_v1(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.barman_executive_fail_verification_v1(uuid,text,text,text,jsonb) to service_role;

comment on function public.barman_executive_claim_verification_v1(text) is
  'Returns the oldest DONE command awaiting independent verification and its executor evidence to the dedicated GitHub OIDC verifier.';
comment on function public.barman_executive_fail_verification_v1(uuid,text,text,text,jsonb) is
  'Fail-closes a command when the separate GitHub OIDC verifier proves the executor evidence does not match GitHub/Production reality.';
