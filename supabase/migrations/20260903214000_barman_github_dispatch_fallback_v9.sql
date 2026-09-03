-- BARMAN Executive OS GitHub dispatch fallback v9.
-- GitHub scheduled workflows have shown long trigger gaps. Supabase pg_cron becomes
-- the independent wake source once a fine-grained Actions-write token is stored
-- in Vault as `barman_github_actions_token`. The secret is never returned/logged.

create table if not exists dabbir_private.executive_scheduler_state (
  scheduler_key text primary key,
  last_attempt_at timestamptz,
  last_request_id bigint,
  last_reason text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

revoke all on table dabbir_private.executive_scheduler_state from public, anon, authenticated;

insert into dabbir_private.executive_integrations(
  integration_key,provider,project_key,status,can_read,can_analyze,can_execute,can_verify,
  last_checked_at,last_success_at,last_failure_at,evidence,metadata
) values (
  'github_actions_dispatch_fallback','GitHub Actions','DABBIR','MISSING',true,true,false,false,
  now(),null,null,'[]'::jsonb,
  jsonb_build_object(
    'required_vault_secret','barman_github_actions_token',
    'required_permission','Actions: write',
    'purpose','Supabase pg_cron wake-up fallback for BARMAN tool-agent and independent verifier'
  )
)
on conflict (integration_key) do update
set provider=excluded.provider,
    project_key=excluded.project_key,
    last_checked_at=now(),
    metadata=coalesce(dabbir_private.executive_integrations.metadata,'{}'::jsonb) || excluded.metadata;

create or replace function public.barman_github_dispatch_tick_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, vault, net, pg_temp
as $$
declare
  v_token text;
  v_tool_pending integer:=0;
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

  select count(*) into v_tool_pending
  from dabbir_private.dabbir_ceo_commands c
  where c.status in ('QUEUED','ACCEPTED')
     or (c.status='IN_PROGRESS' and coalesce(c.lease_until,v_now-interval '1 second')<v_now);

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
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'credential_present',nullif(v_token,'') is not null,
        'tool_pending',v_tool_pending,
        'verify_pending',v_verify_pending,
        'last_tick_at',v_now
      )
  where integration_key='github_actions_dispatch_fallback';

  if nullif(v_token,'') is null then
    insert into dabbir_private.executive_scheduler_state(scheduler_key,last_attempt_at,last_reason,metadata,updated_at)
    values('github_actions_dispatch_fallback',v_now,'CREDENTIAL_MISSING',jsonb_build_object('tool_pending',v_tool_pending,'verify_pending',v_verify_pending),v_now)
    on conflict (scheduler_key) do update
      set last_attempt_at=excluded.last_attempt_at,
          last_reason=excluded.last_reason,
          metadata=excluded.metadata,
          updated_at=excluded.updated_at;
    return jsonb_build_object(
      'ok',false,
      'status','CREDENTIAL_MISSING',
      'required_vault_secret','barman_github_actions_token',
      'tool_pending',v_tool_pending,
      'verify_pending',v_verify_pending
    );
  end if;

  select last_attempt_at into v_tool_last
  from dabbir_private.executive_scheduler_state
  where scheduler_key='github_tool_agent_dispatch';

  if v_tool_pending>0 and (v_tool_last is null or v_tool_last<v_now-interval '4 minutes') then
    v_tool_request:=net.http_post(
      url:='https://api.github.com/repos/barman-systems/pilot/actions/workflows/barman-tool-agent.yml/dispatches',
      body:=jsonb_build_object('ref','main'),
      params:='{}'::jsonb,
      headers:=jsonb_build_object(
        'Authorization','Bearer '||v_token,
        'Accept','application/vnd.github+json',
        'X-GitHub-Api-Version','2022-11-28',
        'User-Agent','BARMAN-Executive-OS'
      ),
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
      headers:=jsonb_build_object(
        'Authorization','Bearer '||v_token,
        'Accept','application/vnd.github+json',
        'X-GitHub-Api-Version','2022-11-28',
        'User-Agent','BARMAN-Executive-OS'
      ),
      timeout_milliseconds:=10000
    );
    insert into dabbir_private.executive_scheduler_state(scheduler_key,last_attempt_at,last_request_id,last_reason,metadata,updated_at)
    values('github_independent_verifier_dispatch',v_now,v_verify_request,'VERIFICATION_PENDING',jsonb_build_object('pending',v_verify_pending),v_now)
    on conflict (scheduler_key) do update
      set last_attempt_at=excluded.last_attempt_at,last_request_id=excluded.last_request_id,last_reason=excluded.last_reason,metadata=excluded.metadata,updated_at=excluded.updated_at;
  end if;

  return jsonb_build_object(
    'ok',true,
    'status','DISPATCH_QUEUED',
    'tool_pending',v_tool_pending,
    'verify_pending',v_verify_pending,
    'tool_request_id',v_tool_request,
    'verify_request_id',v_verify_request
  );
exception when others then
  update dabbir_private.executive_integrations
  set status='BROKEN',
      can_execute=false,
      can_verify=false,
      last_checked_at=now(),
      last_failure_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('last_dispatch_error_sqlstate',sqlstate,'last_dispatch_error_at',now())
  where integration_key='github_actions_dispatch_fallback';
  return jsonb_build_object('ok',false,'status','DISPATCH_ERROR','sqlstate',sqlstate);
end;
$$;

revoke all on function public.barman_github_dispatch_tick_v1() from public, anon, authenticated;
grant execute on function public.barman_github_dispatch_tick_v1() to service_role;

select cron.unschedule('barman-github-dispatch-fallback')
where exists(select 1 from cron.job where jobname='barman-github-dispatch-fallback');
select cron.schedule(
  'barman-github-dispatch-fallback',
  '*/5 * * * *',
  'select public.barman_github_dispatch_tick_v1();'
);

comment on function public.barman_github_dispatch_tick_v1() is
  'Fail-closed Supabase pg_cron fallback that wakes BARMAN GitHub workers when work is pending. Requires Vault secret barman_github_actions_token with Actions:write; never returns the secret.';
