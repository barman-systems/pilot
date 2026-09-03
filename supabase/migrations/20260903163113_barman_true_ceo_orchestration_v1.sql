alter table dabbir_private.dabbir_ceo_commands
  add column if not exists parent_command_id uuid references dabbir_private.dabbir_ceo_commands(id) on delete set null,
  add column if not exists orchestration_state text not null default 'QUEUED',
  add column if not exists risk_level text not null default 'MEDIUM',
  add column if not exists autonomy_level text not null default 'A3',
  add column if not exists verification_status text not null default 'PENDING',
  add column if not exists idempotency_key text,
  add column if not exists rollback_plan jsonb not null default '{}'::jsonb;

create index if not exists dabbir_ceo_commands_parent_idx on dabbir_private.dabbir_ceo_commands(parent_command_id,created_at);
create index if not exists dabbir_ceo_commands_orchestration_idx on dabbir_private.dabbir_ceo_commands(orchestration_state,status,created_at);
create unique index if not exists dabbir_ceo_commands_idempotency_uq on dabbir_private.dabbir_ceo_commands(idempotency_key) where idempotency_key is not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='dabbir_ceo_commands_orchestration_state_check' and conrelid='dabbir_private.dabbir_ceo_commands'::regclass) then
    alter table dabbir_private.dabbir_ceo_commands add constraint dabbir_ceo_commands_orchestration_state_check check(orchestration_state in ('QUEUED','PLANNING','EXECUTING','WAITING','VERIFYING','BLOCKED','FAILED','COMPLETED','CANCELLED'));
  end if;
  if not exists(select 1 from pg_constraint where conname='dabbir_ceo_commands_risk_level_check' and conrelid='dabbir_private.dabbir_ceo_commands'::regclass) then
    alter table dabbir_private.dabbir_ceo_commands add constraint dabbir_ceo_commands_risk_level_check check(risk_level in ('LOW','MEDIUM','HIGH','CRITICAL'));
  end if;
  if not exists(select 1 from pg_constraint where conname='dabbir_ceo_commands_autonomy_level_check' and conrelid='dabbir_private.dabbir_ceo_commands'::regclass) then
    alter table dabbir_private.dabbir_ceo_commands add constraint dabbir_ceo_commands_autonomy_level_check check(autonomy_level in ('A0','A1','A2','A3','A4','A5'));
  end if;
  if not exists(select 1 from pg_constraint where conname='dabbir_ceo_commands_verification_status_check' and conrelid='dabbir_private.dabbir_ceo_commands'::regclass) then
    alter table dabbir_private.dabbir_ceo_commands add constraint dabbir_ceo_commands_verification_status_check check(verification_status in ('PENDING','INDEPENDENT_REQUIRED','VERIFIED','FAILED','NOT_APPLICABLE'));
  end if;
end $$;

alter table dabbir_private.executive_evidence
  add column if not exists produced_by text,
  add column if not exists verified_by text,
  add column if not exists verified_at timestamptz,
  add column if not exists verification_method text,
  add column if not exists evidence_hash text;

update dabbir_private.executive_evidence
set produced_by=coalesce(produced_by,'legacy-worker'),
    verified_by=case when verified=true then coalesce(verified_by,'legacy-self-asserted') else verified_by end,
    verified_at=case when verified=true then coalesce(verified_at,created_at) else verified_at end,
    verification_method=case when verified=true then coalesce(verification_method,'LEGACY_SELF_ASSERTED') else verification_method end
where produced_by is null or (verified=true and (verified_by is null or verified_at is null or verification_method is null));

create table if not exists dabbir_private.executive_task_nodes(
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references dabbir_private.dabbir_ceo_commands(id) on delete cascade,
  parent_task_id uuid references dabbir_private.executive_task_nodes(id) on delete set null,
  sequence_no integer not null,
  title text not null,
  command_text text not null,
  kind text not null default 'REPO_CHANGE',
  status text not null default 'QUEUED',
  priority text not null default 'P1',
  risk_level text not null default 'MEDIUM',
  authority_level text not null default 'auto',
  owner_agent text not null default 'BARMAN Executive OS',
  child_command_id uuid references dabbir_private.dabbir_ceo_commands(id) on delete set null,
  idempotency_key text not null unique,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  rollback_plan jsonb not null default '{}'::jsonb,
  verification_status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  unique(command_id,sequence_no),
  check(kind in ('REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED')),
  check(status in ('QUEUED','RUNNING','WAITING','VERIFYING','BLOCKED','FAILED','COMPLETED','CANCELLED')),
  check(priority in ('P0','P1','P2','P3')),
  check(risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  check(authority_level in ('auto','approval','owner_only')),
  check(verification_status in ('PENDING','INDEPENDENT_REQUIRED','VERIFIED','FAILED','NOT_APPLICABLE'))
);
create index if not exists executive_task_nodes_command_idx on dabbir_private.executive_task_nodes(command_id,status,sequence_no);
create index if not exists executive_task_nodes_child_idx on dabbir_private.executive_task_nodes(child_command_id);

create table if not exists dabbir_private.executive_task_dependencies(
  task_id uuid not null references dabbir_private.executive_task_nodes(id) on delete cascade,
  depends_on_task_id uuid not null references dabbir_private.executive_task_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(task_id,depends_on_task_id),
  check(task_id<>depends_on_task_id)
);

create table if not exists dabbir_private.executive_projects(
  project_key text primary key,
  name text not null,
  status text not null default 'ACTIVE',
  priority text not null default 'P1',
  repositories jsonb not null default '[]'::jsonb,
  database_ref text,
  deployments jsonb not null default '[]'::jsonb,
  domains jsonb not null default '[]'::jsonb,
  integrations jsonb not null default '[]'::jsonb,
  latest_release text,
  health_score numeric(5,2),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check(status in ('ACTIVE','PAUSED','DEGRADED','BLOCKED','RETIRED')),
  check(priority in ('P0','P1','P2','P3'))
);

create table if not exists dabbir_private.executive_tools(
  tool_key text primary key,
  name text not null,
  provider text not null,
  capabilities jsonb not null default '[]'::jsonb,
  permissions jsonb not null default '[]'::jsonb,
  projects_allowed jsonb not null default '[]'::jsonb,
  risk_level text not null default 'MEDIUM',
  credentials_status text not null default 'UNKNOWN',
  health_status text not null default 'UNKNOWN',
  last_success timestamptz,
  last_failure timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check(risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  check(credentials_status in ('CONNECTED','PARTIAL','BROKEN','MISSING','UNAUTHORIZED','UNKNOWN')),
  check(health_status in ('CONNECTED','PARTIAL','BROKEN','MISSING','UNAUTHORIZED','UNKNOWN'))
);

create table if not exists dabbir_private.executive_tool_permissions(
  id uuid primary key default gen_random_uuid(),
  tool_key text not null references dabbir_private.executive_tools(tool_key) on delete cascade,
  capability text not null,
  permission_level integer not null,
  autonomy_level text not null,
  project_key text,
  enabled boolean not null default true,
  constraints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tool_key,capability,project_key),
  check(permission_level between 0 and 5),
  check(autonomy_level in ('A0','A1','A2','A3','A4','A5'))
);

create table if not exists dabbir_private.executive_integrations(
  integration_key text primary key,
  provider text not null,
  project_key text,
  status text not null,
  can_read boolean not null default false,
  can_analyze boolean not null default false,
  can_execute boolean not null default false,
  can_verify boolean not null default false,
  last_checked_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  evidence jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  check(status in ('CONNECTED','PARTIAL','BROKEN','MISSING','UNAUTHORIZED'))
);

create table if not exists dabbir_private.executive_health_checks(
  id bigserial primary key,
  component text not null,
  status text not null,
  checked_at timestamptz not null default now(),
  latency_ms integer,
  details jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  check(status in ('HEALTHY','DEGRADED','BROKEN','UNKNOWN'))
);
create index if not exists executive_health_checks_component_idx on dabbir_private.executive_health_checks(component,checked_at desc);

create table if not exists dabbir_private.executive_decisions(
  id uuid primary key default gen_random_uuid(),
  command_id uuid references dabbir_private.dabbir_ceo_commands(id) on delete set null,
  context text not null,
  options jsonb not null default '[]'::jsonb,
  decision text not null,
  reason text not null,
  decided_by text not null default 'BARMAN Executive OS',
  owner_required boolean not null default false,
  effects jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists dabbir_private.executive_memory(
  id bigserial primary key,
  scope text not null,
  project_key text,
  memory_key text not null,
  value jsonb not null,
  source text not null,
  confidence numeric(4,3) not null default 1.0,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  superseded_by bigint references dabbir_private.executive_memory(id) on delete set null,
  created_at timestamptz not null default now(),
  check(scope in ('OWNER','PROJECT','OPERATIONAL','DECISION','KNOWLEDGE')),
  check(confidence between 0 and 1)
);
create index if not exists executive_memory_lookup_idx on dabbir_private.executive_memory(scope,project_key,memory_key,created_at desc);

create table if not exists dabbir_private.executive_audit_logs(
  id bigserial primary key,
  execution_id uuid,
  command_id uuid references dabbir_private.dabbir_ceo_commands(id) on delete set null,
  actor text not null,
  action text not null,
  tool_key text,
  project_key text,
  reason text,
  result text not null,
  artifact_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists executive_audit_logs_command_idx on dabbir_private.executive_audit_logs(command_id,created_at desc);

create table if not exists dabbir_private.executive_incidents(
  id uuid primary key default gen_random_uuid(),
  incident_key text unique,
  project_key text,
  severity text not null,
  status text not null default 'OPEN',
  title text not null,
  root_cause text,
  containment text,
  resolution text,
  evidence jsonb not null default '[]'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  check(status in ('OPEN','DIAGNOSING','CONTAINED','FIXING','VERIFYING','RESOLVED','CLOSED'))
);

create table if not exists dabbir_private.executive_schedules(
  schedule_key text primary key,
  purpose text not null,
  cron_expression text not null,
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_expected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists dabbir_private.executive_cost_events(
  id bigserial primary key,
  project_key text,
  provider text not null,
  category text not null,
  amount numeric(18,6) not null,
  currency text not null default 'USD',
  units numeric(18,6),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  check(amount>=0)
);

alter table dabbir_private.executive_task_nodes enable row level security;
alter table dabbir_private.executive_task_dependencies enable row level security;
alter table dabbir_private.executive_projects enable row level security;
alter table dabbir_private.executive_tools enable row level security;
alter table dabbir_private.executive_tool_permissions enable row level security;
alter table dabbir_private.executive_integrations enable row level security;
alter table dabbir_private.executive_health_checks enable row level security;
alter table dabbir_private.executive_decisions enable row level security;
alter table dabbir_private.executive_memory enable row level security;
alter table dabbir_private.executive_audit_logs enable row level security;
alter table dabbir_private.executive_incidents enable row level security;
alter table dabbir_private.executive_schedules enable row level security;
alter table dabbir_private.executive_cost_events enable row level security;

revoke all on all tables in schema dabbir_private from public,anon,authenticated;
grant select,insert,update,delete on dabbir_private.executive_task_nodes,dabbir_private.executive_task_dependencies,dabbir_private.executive_projects,dabbir_private.executive_tools,dabbir_private.executive_tool_permissions,dabbir_private.executive_integrations,dabbir_private.executive_health_checks,dabbir_private.executive_decisions,dabbir_private.executive_memory,dabbir_private.executive_audit_logs,dabbir_private.executive_incidents,dabbir_private.executive_schedules,dabbir_private.executive_cost_events to service_role;
grant usage,select on all sequences in schema dabbir_private to service_role;
revoke all on table public.dabbir_calendar_credentials from anon,authenticated;
revoke all on table public.dabbir_owner_otp_challenges from anon,authenticated;

insert into dabbir_private.executive_projects(project_key,name,status,priority,repositories,database_ref,domains,metadata)
values('DABBIR','DABBIR | دبّر','ACTIVE','P0','["barman-systems/pilot","barman-systems/barman-control-plane"]'::jsonb,'fphpoysqdsceniwduxjq','["dabbir.bmalman.com"]'::jsonb,jsonb_build_object('canonical_database_region','ap-south-1','canonical_database','DABBIR Mumbai','executive_authority','BARMAN Executive OS'))
on conflict(project_key) do update set name=excluded.name,status=excluded.status,priority=excluded.priority,repositories=excluded.repositories,database_ref=excluded.database_ref,domains=excluded.domains,metadata=dabbir_private.executive_projects.metadata||excluded.metadata,updated_at=now();

insert into dabbir_private.executive_tools(tool_key,name,provider,capabilities,permissions,projects_allowed,risk_level,credentials_status,health_status,last_success,metadata)
values
 ('supabase','Supabase Mumbai','Supabase','["database.read","database.write","migration.apply","edge.inspect"]'::jsonb,'["service_role"]'::jsonb,'["DABBIR"]'::jsonb,'HIGH','CONNECTED','CONNECTED',now(),jsonb_build_object('project_ref','fphpoysqdsceniwduxjq')),
 ('github','GitHub','GitHub','["repo.read","repo.write","pr.create","pr.merge","actions.run"]'::jsonb,'["contents:write","pull-requests:write","actions:write"]'::jsonb,'["DABBIR"]'::jsonb,'HIGH','CONNECTED','CONNECTED',now(),jsonb_build_object('repo','barman-systems/pilot')),
 ('vercel_dabbir','Vercel DABBIR','Vercel','["deploy.read","logs.read","production.verify"]'::jsonb,'["read"]'::jsonb,'["DABBIR"]'::jsonb,'MEDIUM','CONNECTED','CONNECTED',now(),jsonb_build_object('project_id','prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq')),
 ('vercel_barman_ceo','Vercel BARMAN CEO','Vercel','["deploy.read","runtime.health"]'::jsonb,'["read"]'::jsonb,'["DABBIR"]'::jsonb,'HIGH','CONNECTED','BROKEN',null,jsonb_build_object('project_id','prj_C3B1kIZr6znRmZNiZVjn6YZZ80Nm','failure','DEPLOYMENT_PAUSED')),
 ('telegram','BARMAN Telegram','Telegram','["message.receive","message.send","owner.auth"]'::jsonb,'["owner-private-chat"]'::jsonb,'["DABBIR"]'::jsonb,'MEDIUM','CONNECTED','CONNECTED',now(),jsonb_build_object('identity_count',1)),
 ('whatsapp','DABBIR WhatsApp','Meta','["message.receive","message.send","booking.intent"]'::jsonb,'[]'::jsonb,'["DABBIR"]'::jsonb,'HIGH','PARTIAL','PARTIAL',null,jsonb_build_object('live_connections',0)),
 ('calendar','DABBIR Calendar','Google/Outlook','["calendar.read","calendar.write","busy.read"]'::jsonb,'[]'::jsonb,'["DABBIR"]'::jsonb,'MEDIUM','PARTIAL','PARTIAL',now(),jsonb_build_object('credential_records',1))
on conflict(tool_key) do update set name=excluded.name,provider=excluded.provider,capabilities=excluded.capabilities,permissions=excluded.permissions,projects_allowed=excluded.projects_allowed,risk_level=excluded.risk_level,credentials_status=excluded.credentials_status,health_status=excluded.health_status,last_success=excluded.last_success,metadata=dabbir_private.executive_tools.metadata||excluded.metadata,updated_at=now();

insert into dabbir_private.executive_integrations(integration_key,provider,project_key,status,can_read,can_analyze,can_execute,can_verify,last_checked_at,last_success_at,last_failure_at,evidence,metadata)
values
 ('supabase_mumbai','Supabase','DABBIR','CONNECTED',true,true,true,true,now(),now(),null,'[]'::jsonb,jsonb_build_object('project_ref','fphpoysqdsceniwduxjq')),
 ('github_pilot','GitHub','DABBIR','CONNECTED',true,true,true,true,now(),now(),null,'[]'::jsonb,jsonb_build_object('repo','barman-systems/pilot','tool_agent_schedule','*/5 * * * *')),
 ('vercel_dabbir','Vercel','DABBIR','CONNECTED',true,true,false,true,now(),now(),null,'[]'::jsonb,jsonb_build_object('project_id','prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq','latest_state','READY')),
 ('vercel_barman_live_ceo','Vercel','DABBIR','BROKEN',true,true,false,false,now(),null,now(),jsonb_build_array(jsonb_build_object('type','runtime','reference','DEPLOYMENT_PAUSED','verified',true)),jsonb_build_object('project_id','prj_C3B1kIZr6znRmZNiZVjn6YZZ80Nm')),
 ('telegram_owner','Telegram','DABBIR','CONNECTED',true,true,true,true,now(),now(),null,'[]'::jsonb,jsonb_build_object('identity_count',1,'message_count',12)),
 ('whatsapp_business','Meta','DABBIR','PARTIAL',true,true,false,false,now(),null,null,'[]'::jsonb,jsonb_build_object('live_connections',0)),
 ('calendar_sync','Google/Outlook','DABBIR','PARTIAL',true,true,false,false,now(),now(),null,'[]'::jsonb,jsonb_build_object('credential_records',1))
on conflict(integration_key) do update set provider=excluded.provider,project_key=excluded.project_key,status=excluded.status,can_read=excluded.can_read,can_analyze=excluded.can_analyze,can_execute=excluded.can_execute,can_verify=excluded.can_verify,last_checked_at=excluded.last_checked_at,last_success_at=excluded.last_success_at,last_failure_at=excluded.last_failure_at,evidence=excluded.evidence,metadata=dabbir_private.executive_integrations.metadata||excluded.metadata;

insert into dabbir_private.executive_incidents(incident_key,project_key,severity,status,title,root_cause,containment,evidence)
values('BARMAN-VERCEL-PAUSED-20260903','DABBIR','HIGH','OPEN','BARMAN live CEO Vercel deployment is paused','The barman-live-ceo Vercel project is returning DEPLOYMENT_PAUSED; prior GitHub acceptance evidence is stale relative to the current live environment.','Keep DABBIR Mumbai command runtime canonical; do not rely on the paused BARMAN Vercel surface.',jsonb_build_array(jsonb_build_object('type','runtime','reference','https://barman-live-ceo.vercel.app/api/health','result','503 DEPLOYMENT_PAUSED','verified',true)))
on conflict(incident_key) do nothing;

create or replace function public.barman_executive_read_snapshot_v1()
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private','pg_temp' as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'generated_at',now(),
    'businesses',jsonb_build_object('total',(select count(*) from public.dabbir_businesses),'new_7d',(select count(*) from public.dabbir_businesses where created_at>=now()-interval '7 days')),
    'customers',jsonb_build_object('total',(select count(*) from public.dabbir_customers),'new_24h',(select count(*) from public.dabbir_customers where created_at>=now()-interval '24 hours'),'new_7d',(select count(*) from public.dabbir_customers where created_at>=now()-interval '7 days')),
    'appointments',jsonb_build_object('total',(select count(*) from public.dabbir_appointments),'created_24h',(select count(*) from public.dabbir_appointments where created_at>=now()-interval '24 hours'),'created_7d',(select count(*) from public.dabbir_appointments where created_at>=now()-interval '7 days'),'scheduled_next_24h',(select count(*) from public.dabbir_appointments where starts_at>=now() and starts_at<now()+interval '24 hours')),
    'orders',jsonb_build_object('total',(select count(*) from public.dabbir_orders),'created_24h',(select count(*) from public.dabbir_orders where created_at>=now()-interval '24 hours'),'created_7d',(select count(*) from public.dabbir_orders where created_at>=now()-interval '7 days')),
    'executive',jsonb_build_object('queued',(select count(*) from dabbir_private.dabbir_ceo_commands where status='QUEUED'),'in_progress',(select count(*) from dabbir_private.dabbir_ceo_commands where status='IN_PROGRESS'),'blocked',(select count(*) from dabbir_private.dabbir_ceo_commands where status='BLOCKED'),'weak_verified_evidence',(select count(*) from dabbir_private.executive_evidence where verified=true and coalesce(verification_method,'') in ('','LEGACY_SELF_ASSERTED')))
  ) into v;
  return v;
end;$$;
revoke all on function public.barman_executive_read_snapshot_v1() from public,anon,authenticated;
grant execute on function public.barman_executive_read_snapshot_v1() to service_role;

create or replace function public.barman_executive_decompose_v1(p_command_id uuid,p_run_id uuid,p_action_id uuid,p_tasks jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private','pg_temp' as $$
declare
  v_parent dabbir_private.dabbir_ceo_commands%rowtype;v_item jsonb;v_child_id uuid;v_task_id uuid;v_text text;v_title text;v_kind text;v_seq integer:=0;v_children jsonb:='[]'::jsonb;
begin
  if p_command_id is null or p_run_id is null or p_action_id is null then raise exception 'EXECUTION_IDS_REQUIRED'; end if;
  if jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks)<2 or jsonb_array_length(p_tasks)>12 then raise exception 'PLAN_TASKS_INVALID'; end if;
  select * into v_parent from dabbir_private.dabbir_ceo_commands where id=p_command_id for update;
  if not found then raise exception 'PARENT_COMMAND_NOT_FOUND'; end if;
  if v_parent.parent_command_id is not null then raise exception 'NESTED_DECOMPOSITION_DENIED'; end if;
  if v_parent.status<>'IN_PROGRESS' then raise exception 'PARENT_NOT_IN_PROGRESS'; end if;
  for v_item in select value from jsonb_array_elements(p_tasks) loop
    v_seq:=v_seq+1;v_text:=btrim(coalesce(v_item->>'command_text',''));v_title:=left(coalesce(nullif(btrim(v_item->>'title'),''),v_text),240);v_kind:=upper(coalesce(nullif(btrim(v_item->>'kind'),''),'REPO_CHANGE'));
    if char_length(v_text)<4 or char_length(v_text)>1600 then raise exception 'PLAN_TASK_TEXT_INVALID'; end if;
    if v_kind='OWNER_GATE' then raise exception 'PLAN_OWNER_GATE_REQUIRES_ESCALATION'; end if;
    if v_kind not in ('REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED') then v_kind:='REVIEW_REQUIRED'; end if;
    v_child_id:=gen_random_uuid();
    insert into dabbir_private.dabbir_ceo_commands(id,created_by,command_text,priority,status,source,objective,acceptance_criteria,due_at,parent_command_id,orchestration_state,risk_level,autonomy_level,verification_status,idempotency_key,execution_plan)
    values(v_child_id,v_parent.created_by,v_text,v_parent.priority,'QUEUED','owner_command_center',v_parent.objective,'[]'::jsonb,v_parent.due_at,p_command_id,'QUEUED',coalesce(nullif(upper(v_item->>'risk_level'),''),'MEDIUM'),case when v_kind='EXTERNAL_ACTION' then 'A5' else 'A3' end,'PENDING','parent:'||p_command_id::text||':task:'||v_seq,jsonb_build_object('parent_command_id',p_command_id,'sequence',v_seq,'route',v_kind,'planned_by','BARMAN Executive OS'));
    insert into dabbir_private.executive_events(id,fingerprint,source,kind,severity,status,project_key,external_ref,summary,payload,detected_at)
    values(gen_random_uuid(),'owner-command:'||v_child_id,'owner-directive','ceo_command',case v_parent.priority when 'P0' then 'critical' when 'P1' then 'high' when 'P2' then 'medium' else 'low' end,'open','DABBIR',v_child_id::text,v_text,jsonb_build_object('parent_command_id',p_command_id,'planned_route',v_kind,'sequence',v_seq),now());
    insert into dabbir_private.executive_task_nodes(command_id,sequence_no,title,command_text,kind,status,priority,risk_level,authority_level,owner_agent,child_command_id,idempotency_key,input)
    values(p_command_id,v_seq,v_title,v_text,v_kind,'QUEUED',v_parent.priority,coalesce(nullif(upper(v_item->>'risk_level'),''),'MEDIUM'),case when v_kind='EXTERNAL_ACTION' then 'owner_only' else 'auto' end,'BARMAN Executive OS',v_child_id,'parent:'||p_command_id::text||':task:'||v_seq,jsonb_build_object('planned_from',p_command_id,'kind',v_kind)) returning id into v_task_id;
    v_children:=v_children||jsonb_build_array(jsonb_build_object('task_id',v_task_id,'command_id',v_child_id,'sequence',v_seq,'title',v_title,'kind',v_kind));
  end loop;
  update dabbir_private.dabbir_ceo_commands set orchestration_state='WAITING',execution_plan=jsonb_build_object('contract','BARMAN_DAG_V1','children',v_children,'planned_at',now()),result_summary='تم تفكيك الأمر إلى '||v_seq||' مهام تنفيذية مستقلة.',lease_until=now()+interval '7 days',updated_at=now() where id=p_command_id;
  update dabbir_private.executive_actions set status='planned',completed_at=now() where id=p_action_id and run_id=p_run_id;
  update dabbir_private.executive_runs set status='partial',finished_at=now(),summary='DECOMPOSED_TO_DAG',metrics=metrics||jsonb_build_object('child_count',v_seq,'planner','BARMAN Executive OS') where id=p_run_id;
  insert into dabbir_private.executive_audit_logs(execution_id,command_id,actor,action,project_key,reason,result,metadata) values(p_run_id,p_command_id,'BARMAN Executive OS','DECOMPOSE_COMMAND','DABBIR','MULTI_STEP_COMMAND','PLANNED',jsonb_build_object('children',v_children));
  return jsonb_build_object('ok',true,'parent_command_id',p_command_id,'child_count',v_seq,'children',v_children,'state','WAITING');
end;$$;
revoke all on function public.barman_executive_decompose_v1(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.barman_executive_decompose_v1(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.barman_executive_rollup_v1()
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private','pg_temp' as $$
declare p record;v_total integer;v_done integer;v_blocked integer;v_active integer;v_run uuid;v_action uuid;v_evidence jsonb;v_completed integer:=0;v_failed integer:=0;
begin
  for p in select id from dabbir_private.dabbir_ceo_commands where parent_command_id is null and orchestration_state='WAITING' and status='IN_PROGRESS' order by created_at for update skip locked loop
    select count(*),count(*) filter(where status='DONE'),count(*) filter(where status in ('BLOCKED','CANCELLED')),count(*) filter(where status in ('QUEUED','ACCEPTED','IN_PROGRESS')) into v_total,v_done,v_blocked,v_active from dabbir_private.dabbir_ceo_commands where parent_command_id=p.id;
    if v_total=0 then continue; end if;
    update dabbir_private.executive_task_nodes n set status=case c.status when 'DONE' then 'COMPLETED' when 'BLOCKED' then 'BLOCKED' when 'CANCELLED' then 'CANCELLED' when 'IN_PROGRESS' then 'RUNNING' else n.status end,verification_status=case when c.status='DONE' then 'VERIFIED' when c.status='BLOCKED' then 'FAILED' else n.verification_status end,completed_at=case when c.status in ('DONE','BLOCKED','CANCELLED') then coalesce(n.completed_at,now()) else n.completed_at end,output=jsonb_build_object('child_status',c.status,'result_summary',c.result_summary,'evidence',c.evidence) from dabbir_private.dabbir_ceo_commands c where n.command_id=p.id and n.child_command_id=c.id;
    if v_done=v_total then
      v_run:=gen_random_uuid();v_action:=gen_random_uuid();
      insert into dabbir_private.executive_runs(id,trigger_type,trigger_ref,status,started_at,metrics) values(v_run,'recovery',p.id::text,'running',now(),jsonb_build_object('rollup',true,'child_count',v_total));
      insert into dabbir_private.executive_actions(id,run_id,action_type,authority_level,status,description,owner_interruption,started_at) values(v_action,v_run,'aggregate_child_results','auto','running','Aggregate verified child commands for parent '||p.id,false,now());
      select coalesce(jsonb_agg(jsonb_build_object('type','child-command','reference',id::text,'verified',true,'details',jsonb_build_object('summary',result_summary,'evidence',evidence)) order by created_at),'[]'::jsonb) into v_evidence from dabbir_private.dabbir_ceo_commands where parent_command_id=p.id;
      insert into dabbir_private.executive_evidence(action_id,evidence_type,reference,details,verified,produced_by,verified_by,verified_at,verification_method) select v_action,'artifact','child-command:'||id::text,jsonb_build_object('status',status,'summary',result_summary,'evidence_count',jsonb_array_length(evidence)),true,'child-executor','barman-rollup',now(),'CHILD_TERMINAL_AGGREGATION' from dabbir_private.dabbir_ceo_commands where parent_command_id=p.id;
      update dabbir_private.executive_actions set status='verified',completed_at=now() where id=v_action;
      update dabbir_private.executive_runs set status='completed',finished_at=now(),summary='ALL_CHILD_COMMANDS_VERIFIED',metrics=metrics||jsonb_build_object('outcome','DONE') where id=v_run;
      update dabbir_private.dabbir_ceo_commands set status='DONE',orchestration_state='COMPLETED',verification_status='VERIFIED',result_summary='اكتملت جميع المهام الفرعية بنجاح ('||v_total||'/'||v_total||').',evidence=v_evidence,completed_at=now(),lease_until=null,updated_at=now() where id=p.id;
      update dabbir_private.executive_events set status='resolved',resolved_at=now(),payload=payload||jsonb_build_object('rollup','DONE','child_count',v_total) where source='owner-directive' and kind='ceo_command' and external_ref=p.id::text;
      v_completed:=v_completed+1;
    elsif v_active=0 and v_blocked>0 then
      update dabbir_private.dabbir_ceo_commands set status='BLOCKED',orchestration_state='BLOCKED',verification_status='FAILED',blocked_reason='One or more child commands were blocked after decomposition.',result_summary='تعذر إكمال الأمر لأن '||v_blocked||' من '||v_total||' مهام فرعية توقفت.',completed_at=now(),lease_until=null,updated_at=now() where id=p.id;
      update dabbir_private.executive_events set status='escalated',resolved_at=now(),payload=payload||jsonb_build_object('rollup','BLOCKED','child_count',v_total,'blocked_count',v_blocked) where source='owner-directive' and kind='ceo_command' and external_ref=p.id::text;
      v_failed:=v_failed+1;
    else
      update dabbir_private.dabbir_ceo_commands set execution_plan=execution_plan||jsonb_build_object('progress',jsonb_build_object('total',v_total,'done',v_done,'blocked',v_blocked,'active',v_active),'last_rollup_at',now()),updated_at=now() where id=p.id;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'completed_parents',v_completed,'blocked_parents',v_failed,'checked_at',now());
end;$$;
revoke all on function public.barman_executive_rollup_v1() from public,anon,authenticated;
grant execute on function public.barman_executive_rollup_v1() to service_role;

create or replace function public.barman_executive_self_diagnostic_v1()
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private','pg_temp' as $$
declare v_broken integer;v_partial integer;v_stale integer;v_queue integer;v_weak integer;v_cron integer;v_status text;
begin
  select count(*) into v_broken from dabbir_private.executive_integrations where status in ('BROKEN','MISSING','UNAUTHORIZED');
  select count(*) into v_partial from dabbir_private.executive_integrations where status='PARTIAL';
  select count(*) into v_stale from dabbir_private.dabbir_ceo_commands where status='IN_PROGRESS' and coalesce(lease_until,now()-interval '1 second')<now();
  select count(*) into v_queue from dabbir_private.dabbir_ceo_commands where status='QUEUED';
  select count(*) into v_weak from dabbir_private.executive_evidence where verified=true and coalesce(verification_method,'') in ('','LEGACY_SELF_ASSERTED');
  select count(*) into v_cron from cron.job where active=true and jobname in ('barman-executive-rollup','barman-executive-heartbeat');
  v_status:=case when v_broken>0 then 'PARTIAL' when v_stale>0 then 'DEGRADED' when v_cron<2 then 'DEGRADED' else 'HEALTHY' end;
  return jsonb_build_object('ok',true,'service','BARMAN Executive OS','status',v_status,'autonomy_level','A3','canonical_database','fphpoysqdsceniwduxjq','metrics',jsonb_build_object('broken_integrations',v_broken,'partial_integrations',v_partial,'queued_commands',v_queue,'stale_in_progress',v_stale,'legacy_self_asserted_evidence',v_weak,'active_core_cron_jobs',v_cron),'checked_at',now());
end;$$;
revoke all on function public.barman_executive_self_diagnostic_v1() from public,anon,authenticated;
grant execute on function public.barman_executive_self_diagnostic_v1() to service_role;

create or replace function public.barman_executive_heartbeat_v1()
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private','pg_temp' as $$
declare v_diag jsonb;v_rollup jsonb;v_status text;
begin
  v_rollup:=public.barman_executive_rollup_v1();v_diag:=public.barman_executive_self_diagnostic_v1();v_status:=case when v_diag->>'status'='HEALTHY' then 'HEALTHY' when v_diag->>'status'='PARTIAL' then 'DEGRADED' else coalesce(v_diag->>'status','UNKNOWN') end;
  insert into dabbir_private.executive_health_checks(component,status,details,evidence) values('BARMAN Executive OS',v_status,jsonb_build_object('diagnostic',v_diag,'rollup',v_rollup),jsonb_build_array(jsonb_build_object('type','query','reference','barman_executive_self_diagnostic_v1','verified',true)));
  insert into dabbir_private.executive_audit_logs(actor,action,project_key,reason,result,metadata) values('BARMAN Executive OS','HEARTBEAT','DABBIR','SCHEDULED_HEALTH_CHECK',v_status,jsonb_build_object('diagnostic',v_diag,'rollup',v_rollup));
  return jsonb_build_object('ok',true,'status',v_status,'diagnostic',v_diag,'rollup',v_rollup,'checked_at',now());
end;$$;
revoke all on function public.barman_executive_heartbeat_v1() from public,anon,authenticated;
grant execute on function public.barman_executive_heartbeat_v1() to service_role;

do $$ declare j bigint; begin
  for j in select jobid from cron.job where jobname in ('barman-executive-rollup','barman-executive-heartbeat') loop perform cron.unschedule(j); end loop;
  perform cron.schedule('barman-executive-rollup','* * * * *','select public.barman_executive_rollup_v1();');
  perform cron.schedule('barman-executive-heartbeat','*/5 * * * *','select public.barman_executive_heartbeat_v1();');
end $$;

insert into dabbir_private.executive_schedules(schedule_key,purpose,cron_expression,enabled,metadata)
values('barman-executive-rollup','Aggregate decomposed parent commands from child outcomes','* * * * *',true,jsonb_build_object('function','public.barman_executive_rollup_v1')),
      ('barman-executive-heartbeat','Persist BARMAN Executive OS health and rollup evidence','*/5 * * * *',true,jsonb_build_object('function','public.barman_executive_heartbeat_v1'))
on conflict(schedule_key) do update set purpose=excluded.purpose,cron_expression=excluded.cron_expression,enabled=true,metadata=excluded.metadata,updated_at=now();

select public.barman_executive_heartbeat_v1();
