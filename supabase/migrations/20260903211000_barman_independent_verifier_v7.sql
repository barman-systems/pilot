-- BARMAN Executive OS independent verifier v7.
-- The executor and verifier are separated at the application identity boundary.
-- A mismatch is fail-closed by leaving the command INDEPENDENT_REQUIRED; only
-- a successful recheck is allowed to call the existing promotion RPC.

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

revoke all on function public.barman_executive_claim_verification_v1(text) from public, anon, authenticated;
grant execute on function public.barman_executive_claim_verification_v1(text) to service_role;

comment on function public.barman_executive_claim_verification_v1(text) is
  'Returns the oldest DONE command awaiting independent verification and its executor evidence to the dedicated GitHub OIDC verifier. Mismatches remain INDEPENDENT_REQUIRED and cannot be promoted.';
