-- BARMAN Executive OS truth repair v8.
-- Preserve historical records, but remove trust from legacy self-asserted evidence
-- and normalize legacy task/integration state so health cannot look better than reality.

alter table dabbir_private.executive_integrations
  drop constraint if exists executive_integrations_status_check;

alter table dabbir_private.executive_integrations
  add constraint executive_integrations_status_check
  check (status = any (array['CONNECTED'::text,'PARTIAL'::text,'BROKEN'::text,'MISSING'::text,'UNAUTHORIZED'::text,'RETIRED'::text]));

update dabbir_private.executive_integrations
set status='RETIRED',
    can_read=false,
    can_analyze=false,
    can_execute=false,
    can_verify=false,
    last_checked_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'retired_at',now(),
      'retirement_reason','REPLACED_BY_DABBIR_CANONICAL_RUNTIME',
      'replacement_vercel_project_id','prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq',
      'replacement_supabase_project_ref','fphpoysqdsceniwduxjq'
    ),
    evidence=coalesce(evidence,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'type','decision',
      'reference','BARMAN_TRUTH_REPAIR_V8',
      'verified',true,
      'details',jsonb_build_object('decision','RETIRED_LEGACY_RUNTIME','replacement','DABBIR canonical runtime')
    ))
where integration_key='vercel_barman_live_ceo';

insert into dabbir_private.executive_audit_logs(
  command_id,actor,action,project_key,reason,result,metadata
)
select c.id,
       'BARMAN Truth Repair v8',
       'LEGACY_STATE_NORMALIZE',
       'DABBIR',
       'PRE_HARDENING_STATE_WAS_NOT_INDEPENDENTLY_VERIFIED',
       'NORMALIZING',
       jsonb_build_object(
         'previous_status',c.status,
         'previous_orchestration_state',c.orchestration_state,
         'previous_verification_status',c.verification_status,
         'created_at',c.created_at
       )
from dabbir_private.dabbir_ceo_commands c
where (c.status='DONE' and c.verification_status='PENDING')
   or (c.status='BLOCKED' and (c.orchestration_state<>'BLOCKED' or c.verification_status='PENDING'))
   or (c.status='CANCELLED' and (c.orchestration_state<>'CANCELLED' or c.verification_status<>'NOT_APPLICABLE'));

update dabbir_private.executive_evidence
set details=coalesce(details,'{}'::jsonb) || jsonb_build_object(
      'truth_repair_v8',jsonb_strip_nulls(jsonb_build_object(
        'original_verified',true,
        'original_verified_by',verified_by,
        'original_verified_at',verified_at,
        'original_verification_method',verification_method,
        'repaired_at',now(),
        'reason','LEGACY_SELF_ASSERTED_EVIDENCE_CANNOT_SUPPORT_VERIFIED_STATE'
      ))
    ),
    verified=false,
    verified_by=null,
    verified_at=null
where verified=true
  and coalesce(verification_method,'') in ('LEGACY_SELF_ASSERTED','SELF_ASSERTED');

update dabbir_private.dabbir_ceo_commands
set status='BLOCKED',
    orchestration_state='BLOCKED',
    verification_status='FAILED',
    blocked_reason=coalesce(nullif(blocked_reason,''),'LEGACY_PRE_HARDENING_RESULT_HAS_NO_INDEPENDENT_VERIFICATION'),
    updated_at=now()
where status='DONE'
  and verification_status='PENDING';

update dabbir_private.dabbir_ceo_commands
set orchestration_state='BLOCKED',
    verification_status='FAILED',
    blocked_reason=coalesce(nullif(blocked_reason,''),'BLOCKED_COMMAND_NORMALIZED_BY_TRUTH_REPAIR'),
    updated_at=now()
where status='BLOCKED'
  and (orchestration_state<>'BLOCKED' or verification_status='PENDING');

update dabbir_private.dabbir_ceo_commands
set orchestration_state='CANCELLED',
    verification_status='NOT_APPLICABLE',
    updated_at=now()
where status='CANCELLED'
  and (orchestration_state<>'CANCELLED' or verification_status<>'NOT_APPLICABLE');

create or replace function public.barman_executive_self_diagnostic_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $$
declare
  v_broken integer;
  v_partial integer;
  v_retired integer;
  v_stale integer;
  v_queue integer;
  v_weak integer;
  v_legacy_untrusted integer;
  v_pending_verify integer;
  v_cron integer;
  v_status text;
begin
  select count(*) into v_broken
  from dabbir_private.executive_integrations
  where status in ('BROKEN','MISSING','UNAUTHORIZED');

  select count(*) into v_partial
  from dabbir_private.executive_integrations
  where status='PARTIAL';

  select count(*) into v_retired
  from dabbir_private.executive_integrations
  where status='RETIRED';

  select count(*) into v_stale
  from dabbir_private.dabbir_ceo_commands
  where status='IN_PROGRESS'
    and coalesce(lease_until,now()-interval '1 second')<now();

  select count(*) into v_queue
  from dabbir_private.dabbir_ceo_commands
  where status='QUEUED';

  select count(*) into v_pending_verify
  from dabbir_private.dabbir_ceo_commands
  where status='DONE' and verification_status='INDEPENDENT_REQUIRED';

  select count(*) into v_weak
  from dabbir_private.executive_evidence
  where verified=true
    and coalesce(verification_method,'') in ('','LEGACY_SELF_ASSERTED','SELF_ASSERTED');

  select count(*) into v_legacy_untrusted
  from dabbir_private.executive_evidence
  where verified=false
    and coalesce(verification_method,'') in ('LEGACY_SELF_ASSERTED','SELF_ASSERTED');

  select count(*) into v_cron
  from cron.job
  where active=true
    and jobname in ('barman-executive-rollup','barman-executive-heartbeat');

  v_status:=case
    when v_broken>0 then 'PARTIAL'
    when v_stale>0 or v_cron<2 or v_pending_verify>0 or v_weak>0 or v_partial>0 then 'DEGRADED'
    else 'HEALTHY'
  end;

  return jsonb_build_object(
    'ok',true,
    'service','BARMAN Executive OS',
    'status',v_status,
    'autonomy_level','A3',
    'canonical_database','fphpoysqdsceniwduxjq',
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
$$;

revoke all on function public.barman_executive_self_diagnostic_v1() from public, anon, authenticated;
grant execute on function public.barman_executive_self_diagnostic_v1() to service_role;

comment on function public.barman_executive_self_diagnostic_v1() is
  'Truthful BARMAN health diagnostic. Partial integrations, stale tasks, weak trusted evidence, missing cron, or pending independent verification prevent HEALTHY.';
