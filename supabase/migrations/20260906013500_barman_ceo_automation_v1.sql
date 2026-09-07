-- BARMAN CEO Automation v1
-- Repairs the active dabbir_private executive runtime without introducing a parallel control plane.
-- Adds authoritative registered-account metrics and prevents non-tool lanes from waking the code agent.

create or replace function public.barman_executive_read_snapshot_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'generated_at',now(),
    'registered_accounts',jsonb_build_object(
      'total',(select count(*) from public.dabbir_user_accounts)
    ),
    'businesses',jsonb_build_object(
      'total',(select count(*) from public.dabbir_businesses),
      'new_7d',(select count(*) from public.dabbir_businesses where created_at>=now()-interval '7 days')
    ),
    'customers',jsonb_build_object(
      'total',(select count(*) from public.dabbir_customers),
      'new_24h',(select count(*) from public.dabbir_customers where created_at>=now()-interval '24 hours'),
      'new_7d',(select count(*) from public.dabbir_customers where created_at>=now()-interval '7 days')
    ),
    'appointments',jsonb_build_object(
      'total',(select count(*) from public.dabbir_appointments),
      'created_24h',(select count(*) from public.dabbir_appointments where created_at>=now()-interval '24 hours'),
      'created_7d',(select count(*) from public.dabbir_appointments where created_at>=now()-interval '7 days'),
      'scheduled_next_24h',(select count(*) from public.dabbir_appointments where starts_at>=now() and starts_at<now()+interval '24 hours')
    ),
    'orders',jsonb_build_object(
      'total',(select count(*) from public.dabbir_orders),
      'created_24h',(select count(*) from public.dabbir_orders where created_at>=now()-interval '24 hours'),
      'created_7d',(select count(*) from public.dabbir_orders where created_at>=now()-interval '7 days')
    ),
    'executive',jsonb_build_object(
      'queued',(select count(*) from dabbir_private.dabbir_ceo_commands where status='QUEUED'),
      'in_progress',(select count(*) from dabbir_private.dabbir_ceo_commands where status='IN_PROGRESS'),
      'blocked',(select count(*) from dabbir_private.dabbir_ceo_commands where status='BLOCKED'),
      'weak_verified_evidence',(select count(*) from dabbir_private.executive_evidence where verified=true and coalesce(verification_method,'') in ('','LEGACY_SELF_ASSERTED'))
    )
  ) into v;
  return v;
end;
$function$;

revoke all on function public.barman_executive_read_snapshot_v1() from public, anon, authenticated;
grant execute on function public.barman_executive_read_snapshot_v1() to service_role;

create or replace function public.barman_github_dispatch_tick_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','vault','net','pg_temp'
as $function$
declare
  v_token text;
  v_tool_pending integer:=0;
  v_planner_pending integer:=0;
  v_read_pending integer:=0;
  v_verify_pending integer:=0;
  v_tool_request bigint;
  v_verify_request bigint;
  v_tool_last timestamptz;
  v_verify_last timestamptz;
  v_now timestamptz:=now();
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='barman_github_actions_token'
  order by created_at desc
  limit 1;

  with pending as (
    select c.*,
      coalesce(c.execution_lane,
        case
          when char_length(c.command_text)<=160
            and btrim(c.command_text) ~* '^(اعطني|أعطني|اريد|أريد|give me|show)?[[:space:]]*(تقرير|الحالة|حاله|افحص|فحص|صحة|صحه|status|report|health)([[:space:]]+(دبر|dabbir))?[[:space:]؟?!.]*$'
            then 'runtime'
          when btrim(c.command_text) ~ E'(^|\\n)[[:space:]]*([0-9]+[.)]|[-•])[[:space:]]+(.|\\n)*\\n[[:space:]]*([0-9]+[.)]|[-•])[[:space:]]+'
            then 'planner'
          when btrim(c.command_text) ~* '(راجع|افحص|حلل|دقق|audit|review|inspect|analy[sz]e)'
            and btrim(c.command_text) ~* '(نفذ|أصلح|اصلح|طوّر|طور|عدّل|عدل|implement|fix|execute|repair|develop)'
            then 'planner'
          when btrim(c.command_text) ~* '(^|[[:space:]])(كم|ما عدد|عدد|احصاء|إحصاء|إحصائية|احصائية|statistics?|count|how many|نشاط|activity)([[:space:]]|$)'
            then 'read_only'
          else 'tool_agent'
        end
      ) as inferred_lane
    from dabbir_private.dabbir_ceo_commands c
    where c.status in ('QUEUED','ACCEPTED')
       or (c.status='IN_PROGRESS' and coalesce(c.lease_until,v_now-interval '1 second')<v_now)
  )
  select
    count(*) filter (where inferred_lane='tool_agent'),
    count(*) filter (where inferred_lane='planner'),
    count(*) filter (where inferred_lane='read_only')
  into v_tool_pending,v_planner_pending,v_read_pending
  from pending;

  select count(*) into v_verify_pending
  from dabbir_private.dabbir_ceo_commands c
  where c.status='DONE'
    and c.verification_status='INDEPENDENT_REQUIRED'
    and c.orchestration_state='VERIFYING';

  update dabbir_private.executive_integrations
  set last_checked_at=v_now,
      status=case when nullif(v_token,'') is null then 'MISSING' else 'PARTIAL' end,
      can_execute=(nullif(v_token,'') is not null),
      can_verify=(nullif(v_token,'') is not null),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'credential_present',nullif(v_token,'') is not null,
        'tool_pending',v_tool_pending,
        'planner_pending',v_planner_pending,
        'read_only_pending',v_read_pending,
        'verify_pending',v_verify_pending,
        'last_tick_at',v_now
      )
  where integration_key='github_actions_dispatch_fallback';

  if nullif(v_token,'') is null then
    insert into dabbir_private.executive_scheduler_state(scheduler_key,last_attempt_at,last_reason,metadata,updated_at)
    values('github_actions_dispatch_fallback',v_now,'CREDENTIAL_MISSING',jsonb_build_object('tool_pending',v_tool_pending,'planner_pending',v_planner_pending,'read_only_pending',v_read_pending,'verify_pending',v_verify_pending),v_now)
    on conflict (scheduler_key) do update
      set last_attempt_at=excluded.last_attempt_at,last_reason=excluded.last_reason,metadata=excluded.metadata,updated_at=excluded.updated_at;
    return jsonb_build_object('ok',false,'status','CREDENTIAL_MISSING','required_vault_secret','barman_github_actions_token','tool_pending',v_tool_pending,'planner_pending',v_planner_pending,'read_only_pending',v_read_pending,'verify_pending',v_verify_pending);
  end if;

  select last_attempt_at into v_tool_last
  from dabbir_private.executive_scheduler_state
  where scheduler_key='github_tool_agent_dispatch';
  if v_tool_pending>0 and (v_tool_last is null or v_tool_last<v_now-interval '4 minutes') then
    v_tool_request:=net.http_post(
      url:='https://api.github.com/repos/barman-systems/pilot/actions/workflows/barman-tool-agent.yml/dispatches',
      body:=jsonb_build_object('ref','main'),
      params:='{}'::jsonb,
      headers:=jsonb_build_object('Authorization','Bearer '||v_token,'Accept','application/vnd.github+json','X-GitHub-Api-Version','2022-11-28','User-Agent','BARMAN-Executive-OS'),
      timeout_milliseconds:=10000
    );
    insert into dabbir_private.executive_scheduler_state(scheduler_key,last_attempt_at,last_request_id,last_reason,metadata,updated_at)
    values('github_tool_agent_dispatch',v_now,v_tool_request,'WORK_PENDING',jsonb_build_object('pending',v_tool_pending),v_now)
    on conflict (scheduler_key) do update
      set last_attempt_at=excluded.last_attempt_at,last_request_id=excluded.last_request_id,last_reason=excluded.last_reason,metadata=excluded.metadata,updated_at=excluded.updated_at;
  end if;

  select last_attempt_at into v_verify_last
  from dabbir_private.executive_scheduler_state
  where scheduler_key='github_independent_verifier_dispatch';
  if v_verify_pending>0 and (v_verify_last is null or v_verify_last<v_now-interval '4 minutes') then
    v_verify_request:=net.http_post(
      url:='https://api.github.com/repos/barman-systems/pilot/actions/workflows/barman-independent-verifier.yml/dispatches',
      body:=jsonb_build_object('ref','main'),
      params:='{}'::jsonb,
      headers:=jsonb_build_object('Authorization','Bearer '||v_token,'Accept','application/vnd.github+json','X-GitHub-Api-Version','2022-11-28','User-Agent','BARMAN-Executive-OS'),
      timeout_milliseconds:=10000
    );
    insert into dabbir_private.executive_scheduler_state(scheduler_key,last_attempt_at,last_request_id,last_reason,metadata,updated_at)
    values('github_independent_verifier_dispatch',v_now,v_verify_request,'VERIFICATION_PENDING',jsonb_build_object('pending',v_verify_pending),v_now)
    on conflict (scheduler_key) do update
      set last_attempt_at=excluded.last_attempt_at,last_request_id=excluded.last_request_id,last_reason=excluded.last_reason,metadata=excluded.metadata,updated_at=excluded.updated_at;
  end if;

  return jsonb_build_object(
    'ok',true,'status','DISPATCH_QUEUED',
    'tool_pending',v_tool_pending,
    'planner_pending',v_planner_pending,
    'read_only_pending',v_read_pending,
    'verify_pending',v_verify_pending,
    'tool_request_id',v_tool_request,
    'verify_request_id',v_verify_request
  );
exception when others then
  update dabbir_private.executive_integrations
  set status='BROKEN',can_execute=false,can_verify=false,last_checked_at=now(),last_failure_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_dispatch_error_sqlstate',sqlstate,'last_dispatch_error_at',now())
  where integration_key='github_actions_dispatch_fallback';
  return jsonb_build_object('ok',false,'status','DISPATCH_ERROR','sqlstate',sqlstate);
end;
$function$;

revoke all on function public.barman_github_dispatch_tick_v1() from public, anon, authenticated;
grant execute on function public.barman_github_dispatch_tick_v1() to service_role;
