-- BARMAN Independent Verifier poison-queue fix.
-- 1) Executive snapshot metrics exclude automated/legacy QA businesses.
-- 2) Independent verification can terminally reject unprovable executor evidence.
-- Rejection is fail-closed: it can never promote a command to VERIFIED.

create or replace function public.barman_executive_read_snapshot_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth','dabbir_private','pg_temp'
as $function$
declare v jsonb;
begin
  with qa_businesses as (
    select b.id
    from public.dabbir_businesses b
    where
      exists (
        select 1
        from auth.users u
        where u.id=b.owner_id
          and lower(coalesce(u.raw_user_meta_data->>'dabbir_qa','false'))='true'
      )
      -- Legacy QA rows predate the structural auth metadata marker.
      or b.name like 'DABBIR AI QA %'
      or b.slug like 'qa-%'
  ), nonqa_businesses as (
    select b.*
    from public.dabbir_businesses b
    where not exists(select 1 from qa_businesses q where q.id=b.id)
  )
  select jsonb_build_object(
    'generated_at',now(),
    'metric_scope','NON_QA_PRODUCTION_V1',
    'registered_accounts',jsonb_build_object(
      'total',(
        select count(*)
        from public.dabbir_user_accounts ua
        left join auth.users u on u.id=ua.user_id
        where lower(coalesce(u.raw_user_meta_data->>'dabbir_qa','false'))<>'true'
      )
    ),
    'businesses',jsonb_build_object(
      'total',(select count(*) from nonqa_businesses),
      'new_7d',(select count(*) from nonqa_businesses where created_at>=now()-interval '7 days')
    ),
    'customers',jsonb_build_object(
      'total',(select count(*) from public.dabbir_customers c where exists(select 1 from nonqa_businesses b where b.id=c.business_id)),
      'new_24h',(select count(*) from public.dabbir_customers c where c.created_at>=now()-interval '24 hours' and exists(select 1 from nonqa_businesses b where b.id=c.business_id)),
      'new_7d',(select count(*) from public.dabbir_customers c where c.created_at>=now()-interval '7 days' and exists(select 1 from nonqa_businesses b where b.id=c.business_id))
    ),
    'appointments',jsonb_build_object(
      'total',(select count(*) from public.dabbir_appointments a where exists(select 1 from nonqa_businesses b where b.id=a.business_id)),
      'created_24h',(select count(*) from public.dabbir_appointments a where a.created_at>=now()-interval '24 hours' and exists(select 1 from nonqa_businesses b where b.id=a.business_id)),
      'created_7d',(select count(*) from public.dabbir_appointments a where a.created_at>=now()-interval '7 days' and exists(select 1 from nonqa_businesses b where b.id=a.business_id)),
      'scheduled_next_24h',(select count(*) from public.dabbir_appointments a where a.starts_at>=now() and a.starts_at<now()+interval '24 hours' and exists(select 1 from nonqa_businesses b where b.id=a.business_id))
    ),
    'orders',jsonb_build_object(
      'total',(select count(*) from public.dabbir_orders o where exists(select 1 from nonqa_businesses b where b.id=o.business_id)),
      'created_24h',(select count(*) from public.dabbir_orders o where o.created_at>=now()-interval '24 hours' and exists(select 1 from nonqa_businesses b where b.id=o.business_id)),
      'created_7d',(select count(*) from public.dabbir_orders o where o.created_at>=now()-interval '7 days' and exists(select 1 from nonqa_businesses b where b.id=o.business_id))
    ),
    'executive',jsonb_build_object(
      'queued',(select count(*) from dabbir_private.dabbir_ceo_commands where status='QUEUED'),
      'in_progress',(select count(*) from dabbir_private.dabbir_ceo_commands where status='IN_PROGRESS'),
      'blocked',(select count(*) from dabbir_private.dabbir_ceo_commands where status='BLOCKED'),
      'weak_verified_evidence',(select count(*) from dabbir_private.executive_evidence where verified=true and coalesce(verification_method,'') in ('','LEGACY_SELF_ASSERTED'))
    ),
    'reality',(select coalesce(jsonb_build_object('checked_at',h.checked_at,'status',h.status,'details',h.details),'{}'::jsonb) from dabbir_private.executive_health_checks h where h.component='BARMAN Executive Reality' order by h.checked_at desc limit 1),
    'goals',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'project_key',g.project_key,'title',g.title,'objective',g.objective,'status',g.status,'priority',g.priority,'success_metrics',g.success_metrics,'updated_at',g.updated_at) order by g.priority,g.updated_at desc),'[]'::jsonb) from dabbir_private.executive_goals g where g.status='active'),
    'memory',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'scope',m.scope,'memory_key',m.memory_key,'value',m.value,'confidence',m.confidence,'created_at',m.created_at) order by m.created_at desc),'[]'::jsonb) from (select * from dabbir_private.executive_memory where superseded_by is null and (valid_until is null or valid_until>now()) order by created_at desc limit 20) m),
    'health_domains',jsonb_build_object(
      'infrastructure',case when exists(select 1 from dabbir_private.executive_health_checks h where h.component='BARMAN Executive Reality' and h.status='HEALTHY' and h.checked_at>=now()-interval '10 minutes') then 'HEALTHY' else 'DEGRADED' end,
      'runtime',case when exists(select 1 from dabbir_private.executive_health_checks h where h.component='BARMAN Executive Reality' and h.status='HEALTHY' and h.checked_at>=now()-interval '10 minutes') then 'HEALTHY' else 'DEGRADED' end,
      'product','UNKNOWN','customer','UNKNOWN','economic','UNKNOWN',
      'strategic',case when exists(select 1 from dabbir_private.executive_goals where status='active') then 'UNKNOWN' else 'DEGRADED' end
    )
  ) into v;
  return v;
end;
$function$;

revoke all on function public.barman_executive_read_snapshot_v1() from public, anon, authenticated;
grant execute on function public.barman_executive_read_snapshot_v1() to service_role;

comment on function public.barman_executive_read_snapshot_v1() is
  'Authoritative BARMAN executive snapshot excluding automated and legacy QA businesses. metric_scope=NON_QA_PRODUCTION_V1.';

create or replace function public.barman_executive_reject_verification_v1(
  p_command_id uuid,
  p_verifier text,
  p_reason text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_verifier text:=left(btrim(coalesce(p_verifier,'')),120);
  v_reason text:=upper(left(btrim(coalesce(p_reason,'')),120));
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_action_id uuid;
  v_run_id uuid;
  v_executor_evidence_count integer;
begin
  if v_verifier !~ '^github-independent-verifier:[0-9]+$' then raise exception 'VERIFIER_ID_DENIED'; end if;
  if v_reason !~ '^[A-Z0-9_:-]{3,120}$' then raise exception 'VERIFICATION_REJECTION_REASON_INVALID'; end if;
  if jsonb_typeof(coalesce(p_details,'{}'::jsonb))<>'object' or octet_length(coalesce(p_details,'{}'::jsonb)::text)>16000 then
    raise exception 'VERIFICATION_REJECTION_DETAILS_INVALID';
  end if;

  select * into v_command
  from dabbir_private.dabbir_ceo_commands
  where id=p_command_id
  for update;

  if not found then raise exception 'COMMAND_NOT_FOUND'; end if;
  if v_command.status<>'DONE' or v_command.verification_status<>'INDEPENDENT_REQUIRED' or v_command.orchestration_state<>'VERIFYING' then
    raise exception 'COMMAND_NOT_AWAITING_VERIFICATION';
  end if;
  if nullif(v_command.worker_id,'') is not null and v_verifier=v_command.worker_id then
    raise exception 'EXECUTOR_CANNOT_REJECT_OWN_COMMAND';
  end if;

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

  if v_executor_evidence_count<1 then raise exception 'EXECUTOR_EVIDENCE_REQUIRED_BEFORE_REJECTION'; end if;

  update dabbir_private.executive_actions
  set status='failed',completed_at=now(),error_message='INDEPENDENT_VERIFICATION_REJECTED:'||v_reason
  where id=v_action_id;

  update dabbir_private.executive_runs
  set status='failed',finished_at=now(),metrics=coalesce(metrics,'{}'::jsonb)||jsonb_build_object(
    'verification_status','FAILED',
    'verification_rejection_reason',v_reason,
    'rejected_by',v_verifier,
    'rejected_at',now()
  )
  where id=v_run_id;

  update dabbir_private.dabbir_ceo_commands
  set verification_status='FAILED',
      orchestration_state='FAILED',
      last_error='INDEPENDENT_VERIFICATION_REJECTED:'||v_reason,
      lease_until=null,
      updated_at=now()
  where id=p_command_id;

  update dabbir_private.executive_events
  set status='escalated',
      resolved_at=null,
      payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
        'independent_verification_rejected_at',now(),
        'rejected_by',v_verifier,
        'verification_rejection_reason',v_reason
      )
  where source='owner-directive' and kind='ceo_command' and external_ref=p_command_id::text;

  insert into dabbir_private.executive_audit_logs(
    execution_id,command_id,actor,action,project_key,reason,result,metadata
  ) values (
    v_run_id,p_command_id,v_verifier,'INDEPENDENT_REJECT','DABBIR',v_reason,'FAILED',
    coalesce(p_details,'{}'::jsonb)||jsonb_build_object(
      'trust_boundary','INDEPENDENT_VERIFIER',
      'action_id',v_action_id,
      'executor_evidence_count',v_executor_evidence_count
    )
  );

  return jsonb_build_object(
    'ok',true,
    'command_id',p_command_id,
    'verification_status','FAILED',
    'orchestration_state','FAILED',
    'reason',v_reason
  );
end;
$function$;

revoke all on function public.barman_executive_reject_verification_v1(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.barman_executive_reject_verification_v1(uuid,text,text,jsonb) to service_role;

comment on function public.barman_executive_reject_verification_v1(uuid,text,text,jsonb) is
  'Fail-closed terminal rejection for executor evidence that the dedicated GitHub OIDC independent verifier cannot prove. Never promotes evidence or commands to VERIFIED.';
