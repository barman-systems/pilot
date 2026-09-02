do $$
begin
  if to_regclass('dabbir_private.dabbir_ceo_commands') is null and to_regclass('public.dabbir_ceo_commands') is not null then
    alter table public.dabbir_ceo_commands set schema dabbir_private;
  end if;
end $$;

alter table dabbir_private.dabbir_ceo_commands
  add column if not exists objective text,
  add column if not exists acceptance_criteria jsonb not null default '[]'::jsonb,
  add column if not exists due_at timestamptz,
  add column if not exists guidance jsonb not null default '[]'::jsonb,
  add column if not exists claimed_at timestamptz,
  add column if not exists blocked_reason text;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='dabbir_ceo_commands_acceptance_check') then
    alter table dabbir_private.dabbir_ceo_commands add constraint dabbir_ceo_commands_acceptance_check check (jsonb_typeof(acceptance_criteria)='array');
  end if;
  if not exists(select 1 from pg_constraint where conname='dabbir_ceo_commands_guidance_check') then
    alter table dabbir_private.dabbir_ceo_commands add constraint dabbir_ceo_commands_guidance_check check (jsonb_typeof(guidance)='array');
  end if;
end $$;

alter table dabbir_private.dabbir_ceo_commands enable row level security;
revoke all on table dabbir_private.dabbir_ceo_commands from public, anon, authenticated, service_role;
grant select,insert,update on table dabbir_private.dabbir_ceo_commands to service_role;

create table if not exists dabbir_private.owner_operational_samples(
  id uuid primary key default gen_random_uuid(),
  observed_at timestamptz not null default now(),
  source text not null default 'vercel_synthetic',
  api_ok boolean not null,
  api_status integer,
  api_latency_ms numeric,
  db_ok boolean not null,
  db_latency_ms numeric,
  details jsonb not null default '{}'::jsonb
);
create index if not exists owner_operational_samples_time_idx on dabbir_private.owner_operational_samples(observed_at desc);
alter table dabbir_private.owner_operational_samples enable row level security;
revoke all on table dabbir_private.owner_operational_samples from public,anon,authenticated,service_role;
grant select,insert on table dabbir_private.owner_operational_samples to service_role;

create table if not exists dabbir_private.owner_platform_metrics(
  id uuid primary key default gen_random_uuid(),
  observed_at timestamptz not null default now(),
  source text not null,
  runtime_5xx_24h integer,
  runtime_errors_24h integer,
  api_p95_ms numeric,
  details jsonb not null default '{}'::jsonb
);
create index if not exists owner_platform_metrics_time_idx on dabbir_private.owner_platform_metrics(observed_at desc);
alter table dabbir_private.owner_platform_metrics enable row level security;
revoke all on table dabbir_private.owner_platform_metrics from public,anon,authenticated,service_role;
grant select,insert on table dabbir_private.owner_platform_metrics to service_role;

create table if not exists dabbir_private.owner_recovery_checks(
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('restore_dry_run','recovery_health')),
  status text not null check(status in ('verified','failed')),
  checked_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
create index if not exists owner_recovery_checks_time_idx on dabbir_private.owner_recovery_checks(checked_at desc);
alter table dabbir_private.owner_recovery_checks enable row level security;
revoke all on table dabbir_private.owner_recovery_checks from public,anon,authenticated,service_role;
grant select,insert on table dabbir_private.owner_recovery_checks to service_role;

create or replace function public.dabbir_ceo_command_create_v2(
  p_created_by uuid,
  p_command_text text,
  p_priority text default 'P1',
  p_objective text default null,
  p_acceptance_criteria jsonb default '[]'::jsonb,
  p_due_at timestamptz default null
) returns jsonb
language plpgsql security invoker
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$
declare
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_event_id uuid:=gen_random_uuid();
  v_priority text:=upper(btrim(coalesce(p_priority,'P1')));
  v_text text:=btrim(coalesce(p_command_text,''));
  v_objective text:=nullif(btrim(coalesce(p_objective,'')),'');
  v_acceptance jsonb:=coalesce(p_acceptance_criteria,'[]'::jsonb);
  v_severity text;
begin
  if p_created_by is null then raise exception 'CREATED_BY_REQUIRED'; end if;
  if char_length(v_text)<4 or char_length(v_text)>4000 then raise exception 'COMMAND_TEXT_INVALID'; end if;
  if v_priority not in('P0','P1','P2','P3') then raise exception 'PRIORITY_INVALID'; end if;
  if jsonb_typeof(v_acceptance)<>'array' then raise exception 'ACCEPTANCE_CRITERIA_INVALID'; end if;
  if p_due_at is not null and p_due_at<now()-interval '5 minutes' then raise exception 'DUE_AT_INVALID'; end if;
  insert into dabbir_private.dabbir_ceo_commands(created_by,command_text,priority,objective,acceptance_criteria,due_at)
  values(p_created_by,v_text,v_priority,v_objective,v_acceptance,p_due_at) returning * into v_command;
  v_severity:=case v_priority when 'P0' then 'critical' when 'P1' then 'high' when 'P2' then 'medium' else 'low' end;
  insert into dabbir_private.executive_events(id,fingerprint,source,kind,severity,status,project_key,external_ref,summary,payload,detected_at)
  values(v_event_id,'owner-command:'||v_command.id,'owner-directive','ceo_command',v_severity,'open','DABBIR',v_command.id::text,v_command.command_text,
    jsonb_build_object('command_id',v_command.id,'priority',v_command.priority,'objective',v_command.objective,'acceptance_criteria',v_command.acceptance_criteria,'due_at',v_command.due_at,'created_by',v_command.created_by,'source',v_command.source),v_command.created_at);
  return to_jsonb(v_command)||jsonb_build_object('executive_event_id',v_event_id,'executive_event_status','open');
end $$;
revoke all on function public.dabbir_ceo_command_create_v2(uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_ceo_command_create_v2(uuid,text,text,text,jsonb,timestamptz) to service_role;

create or replace function public.dabbir_ceo_commands_recent_v2(p_limit integer default 20)
returns jsonb language sql security invoker
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$
select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
from (
  select c.id,c.created_at,c.updated_at,c.created_by,c.command_text,c.priority,c.objective,c.acceptance_criteria,c.due_at,c.guidance,c.source,c.result_summary,c.evidence,c.blocked_reason,
    case e.status when 'open' then 'QUEUED' when 'claimed' then 'IN_PROGRESS' when 'resolved' then 'DONE' when 'escalated' then 'BLOCKED' when 'ignored' then 'CANCELLED' else c.status end status,
    e.id executive_event_id,e.status executive_event_status,e.detected_at executive_event_detected_at,e.resolved_at executive_event_resolved_at,e.payload executive_event_payload,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'status',a.status,'action_type',a.action_type,'authority_level',a.authority_level,'description',a.description,'started_at',a.started_at,'completed_at',a.completed_at,'error_message',a.error_message,
      'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'type',ev.evidence_type,'reference',ev.reference,'details',ev.details,'verified',ev.verified,'created_at',ev.created_at) order by ev.created_at) from dabbir_private.executive_evidence ev where ev.action_id=a.id),'[]'::jsonb)
    ) order by a.started_at nulls last) from dabbir_private.executive_actions a where a.event_id=e.id),'[]'::jsonb) actions
  from dabbir_private.dabbir_ceo_commands c
  left join dabbir_private.executive_events e on e.source='owner-directive' and e.kind='ceo_command' and e.external_ref=c.id::text
  order by c.created_at desc limit greatest(1,least(coalesce(p_limit,20),50))
) x;
$$;
revoke all on function public.dabbir_ceo_commands_recent_v2(integer) from public,anon,authenticated;
grant execute on function public.dabbir_ceo_commands_recent_v2(integer) to service_role;

create or replace function public.dabbir_ceo_command_update_v2(
  p_actor_user_id uuid,p_command_id uuid,p_operation text,p_priority text default null,p_due_at timestamptz default null,p_guidance text default null
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$
declare v_op text:=lower(btrim(coalesce(p_operation,''))); v_event dabbir_private.executive_events%rowtype; v_priority text;
begin
  if p_actor_user_id is null or p_command_id is null then raise exception 'INVALID_COMMAND_UPDATE'; end if;
  select * into v_event from dabbir_private.executive_events where source='owner-directive' and kind='ceo_command' and external_ref=p_command_id::text order by detected_at desc limit 1;
  if not found then raise exception 'COMMAND_EVENT_NOT_FOUND'; end if;
  if v_op='reprioritize' then
    v_priority:=upper(btrim(coalesce(p_priority,''))); if v_priority not in('P0','P1','P2','P3') then raise exception 'PRIORITY_INVALID'; end if;
    update dabbir_private.dabbir_ceo_commands set priority=v_priority,updated_at=now() where id=p_command_id;
    update dabbir_private.executive_events set severity=case v_priority when 'P0' then 'critical' when 'P1' then 'high' when 'P2' then 'medium' else 'low' end,payload=payload||jsonb_build_object('priority',v_priority) where id=v_event.id;
  elsif v_op='set_due_at' then
    if p_due_at is not null and p_due_at<now()-interval '5 minutes' then raise exception 'DUE_AT_INVALID'; end if;
    update dabbir_private.dabbir_ceo_commands set due_at=p_due_at,updated_at=now() where id=p_command_id;
    update dabbir_private.executive_events set payload=payload||jsonb_build_object('due_at',p_due_at) where id=v_event.id;
  elsif v_op='add_guidance' then
    if char_length(btrim(coalesce(p_guidance,'')))<3 then raise exception 'GUIDANCE_REQUIRED'; end if;
    update dabbir_private.dabbir_ceo_commands set guidance=guidance||jsonb_build_array(jsonb_build_object('at',now(),'actor_user_id',p_actor_user_id,'text',left(btrim(p_guidance),2000))),updated_at=now() where id=p_command_id;
    update dabbir_private.executive_events set payload=payload||jsonb_build_object('latest_owner_guidance',left(btrim(p_guidance),2000),'latest_owner_guidance_at',now()) where id=v_event.id;
  elsif v_op='cancel' then
    update dabbir_private.dabbir_ceo_commands set status='CANCELLED',updated_at=now() where id=p_command_id;
    update dabbir_private.executive_events set status='ignored',resolved_at=now(),payload=payload||jsonb_build_object('cancelled_by_owner',true,'cancelled_at',now()) where id=v_event.id and status in('open','claimed','escalated');
  elsif v_op='resume' then
    update dabbir_private.dabbir_ceo_commands set status='QUEUED',blocked_reason=null,updated_at=now() where id=p_command_id;
    update dabbir_private.executive_events set status='open',resolved_at=null,payload=payload||jsonb_build_object('resumed_by_owner',true,'resumed_at',now()) where id=v_event.id and status in('ignored','escalated');
  else raise exception 'UNKNOWN_COMMAND_OPERATION'; end if;
  return (select x from jsonb_array_elements(public.dabbir_ceo_commands_recent_v2(50)) x where x->>'id'=p_command_id::text limit 1);
end $$;
revoke all on function public.dabbir_ceo_command_update_v2(uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.dabbir_ceo_command_update_v2(uuid,uuid,text,text,timestamptz,text) to service_role;

create or replace function public.dabbir_owner_decisions_recent_v1(p_actor_user_id uuid,p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$ declare v jsonb; begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  select coalesce(jsonb_agg(to_jsonb(x) order by (x.status='open') desc,x.created_at desc),'[]'::jsonb) into v
  from (select e.id,e.category,e.status,e.question,e.decision,e.created_at,e.resolved_at,e.action_id,e.event_id,
        a.description action_description,ev.summary event_summary,ev.severity event_severity
        from dabbir_private.executive_escalations e
        left join dabbir_private.executive_actions a on a.id=e.action_id
        left join dabbir_private.executive_events ev on ev.id=e.event_id
        order by (e.status='open') desc,e.created_at desc limit greatest(1,least(coalesce(p_limit,30),100))) x;
  return v;
end $$;
revoke all on function public.dabbir_owner_decisions_recent_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.dabbir_owner_decisions_recent_v1(uuid,integer) to service_role;

create or replace function public.dabbir_owner_decision_resolve_v1(p_actor_user_id uuid,p_escalation_id uuid,p_resolution text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$
declare v dabbir_private.executive_escalations%rowtype; r text:=lower(btrim(coalesce(p_resolution,'')));
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  if r not in('approve','reject','modify') then raise exception 'INVALID_OWNER_RESOLUTION'; end if;
  select * into v from dabbir_private.executive_escalations where id=p_escalation_id for update; if not found then raise exception 'ESCALATION_NOT_FOUND'; end if;
  if v.status<>'open' then raise exception 'ESCALATION_ALREADY_RESOLVED'; end if;
  update dabbir_private.executive_escalations set status='resolved',decision=jsonb_build_object('resolution',r,'note',nullif(btrim(coalesce(p_note,'')),''),'actor_user_id',p_actor_user_id,'resolved_at',now()),resolved_at=now() where id=v.id;
  if v.event_id is not null then
    if r='reject' then update dabbir_private.executive_events set status='ignored',resolved_at=now(),payload=payload||jsonb_build_object('owner_resolution',r,'owner_note',p_note) where id=v.event_id;
    else update dabbir_private.executive_events set status='open',resolved_at=null,payload=payload||jsonb_build_object('owner_resolution',r,'owner_note',p_note,'owner_resolved_at',now()) where id=v.event_id; end if;
  end if;
  if v.action_id is not null then
    update dabbir_private.executive_actions set owner_interruption=false,status=case when r='reject' then 'cancelled' else 'planned' end,error_message=case when r='modify' then nullif(btrim(coalesce(p_note,'')),'') else error_message end where id=v.action_id;
  end if;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,details) values(p_actor_user_id,'owner_decision_resolved',jsonb_build_object('escalation_id',v.id,'resolution',r,'note',p_note));
  return (select to_jsonb(e) from dabbir_private.executive_escalations e where e.id=v.id);
end $$;
revoke all on function public.dabbir_owner_decision_resolve_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_owner_decision_resolve_v1(uuid,uuid,text,text) to service_role;

create or replace function public.dabbir_owner_ops_sample_write_v1(p_api_ok boolean,p_api_status integer,p_api_latency_ms numeric,p_db_ok boolean,p_db_latency_ms numeric,p_details jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$ declare v uuid; begin
  insert into dabbir_private.owner_operational_samples(api_ok,api_status,api_latency_ms,db_ok,db_latency_ms,details)
  values(coalesce(p_api_ok,false),p_api_status,p_api_latency_ms,coalesce(p_db_ok,false),p_db_latency_ms,coalesce(p_details,'{}'::jsonb)) returning id into v; return v;
end $$;
revoke all on function public.dabbir_owner_ops_sample_write_v1(boolean,integer,numeric,boolean,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_owner_ops_sample_write_v1(boolean,integer,numeric,boolean,numeric,jsonb) to service_role;

create or replace function public.dabbir_owner_ops_metrics_v1()
returns jsonb language sql security invoker set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$
with s as (select * from dabbir_private.owner_operational_samples where observed_at>=now()-interval '24 hours'),
p as (select * from dabbir_private.owner_platform_metrics where observed_at>=now()-interval '2 hours' order by observed_at desc limit 1)
select jsonb_build_object(
 'sample_count_24h',(select count(*) from s),
 'last_sample_at',(select max(observed_at) from s),
 'uptime_pct_24h',(select case when count(*)=0 then null else round(100.0*avg(case when api_ok and db_ok then 1 else 0 end)::numeric,3) end from s),
 'api_p50_ms',(select round(percentile_cont(0.50) within group(order by api_latency_ms)::numeric,1) from s where api_latency_ms is not null),
 'api_p95_ms',(select round(percentile_cont(0.95) within group(order by api_latency_ms)::numeric,1) from s where api_latency_ms is not null),
 'api_p99_ms',(select round(percentile_cont(0.99) within group(order by api_latency_ms)::numeric,1) from s where api_latency_ms is not null),
 'db_p50_ms',(select round(percentile_cont(0.50) within group(order by db_latency_ms)::numeric,1) from s where db_latency_ms is not null),
 'db_p95_ms',(select round(percentile_cont(0.95) within group(order by db_latency_ms)::numeric,1) from s where db_latency_ms is not null),
 'db_p99_ms',(select round(percentile_cont(0.99) within group(order by db_latency_ms)::numeric,1) from s where db_latency_ms is not null),
 'synthetic_5xx_24h',(select count(*) from s where coalesce(api_status,0)>=500),
 'runtime_5xx_24h',(select runtime_5xx_24h from p),
 'runtime_errors_24h',(select runtime_errors_24h from p),
 'runtime_source',(select source from p),
 'runtime_observed_at',(select observed_at from p)
);
$$;
revoke all on function public.dabbir_owner_ops_metrics_v1() from public,anon,authenticated;
grant execute on function public.dabbir_owner_ops_metrics_v1() to service_role;

create or replace function public.dabbir_owner_recovery_maintenance_v1()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$
declare v_business uuid; v_preview jsonb; v_health jsonb; v_check uuid; begin
  perform dabbir_private.recovery_capture_all_business_snapshots();
  select id into v_business from public.dabbir_businesses where coalesce(demo_mode,false)=false order by created_at asc limit 1;
  if v_business is not null then v_preview:=dabbir_private.recovery_preview(v_business,now(),null); end if;
  v_health:=dabbir_private.recovery_health_check();
  insert into dabbir_private.owner_recovery_checks(kind,status,details) values('restore_dry_run','verified',jsonb_build_object('business_id',v_business,'preview',v_preview,'health',v_health)) returning id into v_check;
  return jsonb_build_object('ok',true,'check_id',v_check,'business_id',v_business,'health',v_health);
exception when others then
  insert into dabbir_private.owner_recovery_checks(kind,status,details) values('restore_dry_run','failed',jsonb_build_object('error',sqlerrm));
  raise;
end $$;
revoke all on function public.dabbir_owner_recovery_maintenance_v1() from public,anon,authenticated;
grant execute on function public.dabbir_owner_recovery_maintenance_v1() to service_role;

-- Preserve the proven v1 implementation as an internal base once.
do $$ begin
  if to_regprocedure('public.dabbir_platform_owner_executive_base_v1(uuid)') is null and to_regprocedure('public.dabbir_platform_owner_executive_v1(uuid)') is not null then
    alter function public.dabbir_platform_owner_executive_v1(uuid) rename to dabbir_platform_owner_executive_base_v1;
  end if;
end $$;

create or replace function public.dabbir_platform_owner_executive_v2(p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,auth,pg_temp
as $$
declare v_result jsonb; v_health jsonb; v_ops jsonb; v_backup timestamptz; v_restore timestamptz; v_active bigint; v_gaps jsonb; v_decisions bigint; v_queued bigint; begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  v_result:=public.dabbir_platform_owner_executive_base_v1(p_actor_user_id);

  with eb as (
    select b.id,b.name,b.business_type,b.created_at from public.dabbir_businesses b
    where coalesce(b.demo_mode,false)=false and coalesce(b.name,'') !~* '^DABBIR AI QA([[:space:]]|$)' and coalesce(b.name,'') !~* 'QA CAPACITY' and lower(coalesce(b.name,'')) not like '% demo%' and lower(coalesce(b.slug,'')) not like '%demo%'
  ), oa as (select business_id,min(created_at) first_at,max(coalesce(completed_at,created_at)) last_at,count(*) n from public.dabbir_orders where coalesce(simulated,false)=false group by business_id),
  aa as (select business_id,min(created_at) first_at,max(coalesce(updated_at,created_at)) last_at,count(*) n from public.dabbir_appointments where coalesce(simulated,false)=false group by business_id),
  ta as (select business_id,max(coalesce(updated_at,created_at)) last_at,count(*) n from public.dabbir_tasks group by business_id),
  x as (
    select eb.*,
      case when oa.last_at is null and aa.last_at is null and ta.last_at is null then null else greatest(coalesce(oa.last_at,'-infinity'),coalesce(aa.last_at,'-infinity'),coalesce(ta.last_at,'-infinity')) end last_activity_at,
      case when oa.first_at is null then aa.first_at when aa.first_at is null then oa.first_at else least(oa.first_at,aa.first_at) end first_value_at,
      (select count(*) from public.dabbir_products p where p.business_id=eb.id and coalesce(p.active,true))+(select count(*) from public.dabbir_services s where s.business_id=eb.id and coalesce(s.active,true)) catalog_items,
      (select count(*) from public.dabbir_platform_owner_incidents i where i.business_id=eb.id and lower(coalesce(i.status,'')) not in('resolved','closed','done','cancelled')) open_incidents,
      (select count(*) from public.dabbir_platform_owner_incidents i where i.business_id=eb.id and lower(coalesce(i.status,'')) not in('resolved','closed','done','cancelled') and lower(coalesce(i.priority,'')) in('urgent','high')) severe_incidents,
      exists(select 1 from public.dabbir_whatsapp_connections w where w.business_id=eb.id) whatsapp_configured,
      exists(select 1 from public.dabbir_whatsapp_connections w where w.business_id=eb.id and (nullif(trim(coalesce(w.last_error,'')),'') is not null or lower(coalesce(w.status,'')) in('error','failed','degraded'))) whatsapp_degraded,
      exists(select 1 from public.dabbir_calendar_connections c where c.business_id=eb.id) calendar_configured,
      exists(select 1 from public.dabbir_calendar_connections c where c.business_id=eb.id and (nullif(trim(coalesce(c.last_error,'')),'') is not null or lower(coalesce(c.status,'')) in('error','failed','degraded'))) calendar_degraded,
      (select status from public.dabbir_billing_accounts b where b.business_id=eb.id limit 1) billing_status,
      (select cancel_at_period_end from public.dabbir_billing_accounts b where b.business_id=eb.id limit 1) cancel_pending,
      (select trial_ends_at from public.dabbir_billing_accounts b where b.business_id=eb.id limit 1) trial_ends_at,
      (select last_invoice_status from public.dabbir_billing_accounts b where b.business_id=eb.id limit 1) invoice_status
    from eb left join oa on oa.business_id=eb.id left join aa on aa.business_id=eb.id left join ta on ta.business_id=eb.id
  ), s as (
    select x.*,greatest(0,100
      - case when last_activity_at is null and created_at<now()-interval '7 days' then 35 when last_activity_at is null and created_at<now()-interval '1 day' then 15 when last_activity_at<now()-interval '30 days' then 40 when last_activity_at<now()-interval '7 days' then 20 else 0 end
      - case when first_value_at is null and created_at<now()-interval '7 days' then 25 when first_value_at is null and created_at<now()-interval '1 day' then 12 else 0 end
      - case when catalog_items=0 and created_at<now()-interval '2 days' then 12 else 0 end
      - case when severe_incidents>0 then 30 when open_incidents>0 then 12 else 0 end
      - case when lower(coalesce(billing_status,'')) in('past_due','unpaid','incomplete','incomplete_expired') or lower(coalesce(invoice_status,''))='payment_failed' then 30 when coalesce(cancel_pending,false) then 15 when lower(coalesce(billing_status,''))='trialing' and trial_ends_at<=now()+interval '3 days' then 10 else 0 end
      - case when whatsapp_configured and whatsapp_degraded then 10 else 0 end
      - case when calendar_configured and calendar_degraded then 10 else 0 end
    )::int score from x
  ), h as (
    select s.*,case when score>=80 then 'green' when score>=50 then 'yellow' else 'red' end health,
      array_remove(array[
        case when last_activity_at is null and created_at<now()-interval '1 day' then 'no_operational_activity' when last_activity_at<now()-interval '30 days' then 'inactive_30d' when last_activity_at<now()-interval '7 days' then 'inactive_7d' end,
        case when first_value_at is null and created_at<now()-interval '1 day' then 'no_first_value' end,
        case when catalog_items=0 and created_at<now()-interval '2 days' then 'catalog_empty' end,
        case when severe_incidents>0 then 'severe_incident' when open_incidents>0 then 'open_incident' end,
        case when lower(coalesce(billing_status,'')) in('past_due','unpaid','incomplete','incomplete_expired') or lower(coalesce(invoice_status,''))='payment_failed' then 'billing_failed' when coalesce(cancel_pending,false) then 'cancel_pending' end,
        case when whatsapp_configured and whatsapp_degraded then 'whatsapp_degraded' end,
        case when calendar_configured and calendar_degraded then 'calendar_degraded' end
      ],null)::text[] risk_reasons from s
  )
  select jsonb_build_object('green',count(*) filter(where health='green'),'yellow',count(*) filter(where health='yellow'),'red',count(*) filter(where health='red'),
    'items',coalesce(jsonb_agg(jsonb_build_object('business_id',id,'business_name',name,'business_type',business_type,'score',score,'health',health,'last_activity_at',last_activity_at,'first_value_at',first_value_at,'catalog_items',catalog_items,'risk_reasons',risk_reasons,'open_incidents',open_incidents,'billing_status',billing_status) order by score,name),'[]'::jsonb),
    'scoring_version','health-v2-deterministic') into v_health from h;

  select count(distinct m.user_id) into v_active from public.dabbir_memberships m join auth.users u on u.id=m.user_id where lower(coalesce(m.status,''))='active' and u.last_sign_in_at>=now()-interval '7 days';
  v_ops:=public.dabbir_owner_ops_metrics_v1();
  select max(completed_at) into v_backup from dabbir_private.recovery_snapshot_batches where status='complete';
  select max(checked_at) into v_restore from dabbir_private.owner_recovery_checks where kind='restore_dry_run' and status='verified';
  select count(*) into v_decisions from dabbir_private.executive_escalations where status='open';
  select count(*) into v_queued from dabbir_private.executive_events where source='owner-directive' and kind='ceo_command' and status in('open','claimed','escalated');
  v_gaps:=jsonb_build_array();
  if coalesce((v_ops->>'sample_count_24h')::int,0)=0 then v_gaps:=v_gaps||jsonb_build_array('synthetic_monitoring'); end if;
  if v_ops->'runtime_5xx_24h' is null or v_ops->>'runtime_5xx_24h' is null then v_gaps:=v_gaps||jsonb_build_array('vercel_runtime_5xx'); end if;
  if v_backup is null then v_gaps:=v_gaps||jsonb_build_array('recovery_snapshot'); end if;
  if v_restore is null then v_gaps:=v_gaps||jsonb_build_array('restore_dry_run'); end if;

  v_result:=jsonb_set(v_result,'{policy}',coalesce(v_result->'policy','{}'::jsonb)||jsonb_build_object('version','executive-v2','health_score_kind','deterministic_activation_reliability_health'));
  v_result:=jsonb_set(v_result,'{customer_health}',v_health);
  v_result:=jsonb_set(v_result,'{executive_pulse}',coalesce(v_result->'executive_pulse','{}'::jsonb)||jsonb_build_object('active_customers',v_active,'active_customers_state','MEASURED_AUTH_LAST_SIGN_IN_7D'));
  v_result:=jsonb_set(v_result,'{decision_center}',coalesce(v_result->'decision_center','{}'::jsonb)||jsonb_build_object('owner_decisions_open',v_decisions,'ceo_commands_open',v_queued));
  v_result:=jsonb_set(v_result,'{reliability}',coalesce(v_result->'reliability','{}'::jsonb)||v_ops||jsonb_build_object('backup_last_at',v_backup,'backup_state',case when v_backup is null then 'NOT_YET_CAPTURED' else 'RECOVERY_VAULT_SNAPSHOT' end,'restore_test_last_at',v_restore,'restore_test_state',case when v_restore is null then 'NOT_YET_TESTED' else 'DRY_RUN_VERIFIED' end));
  v_result:=jsonb_set(v_result,'{risk_register}',coalesce(v_result->'risk_register','{}'::jsonb)||jsonb_build_object('telemetry_gaps',v_gaps,'red_health',v_health->'red','yellow_health',v_health->'yellow'));
  v_result:=jsonb_set(v_result,'{generated_at}',to_jsonb(now()));
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,details) values(p_actor_user_id,'owner_executive_overview',jsonb_build_object('version','executive-v2'));
  return v_result;
end $$;
revoke all on function public.dabbir_platform_owner_executive_v2(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_platform_owner_executive_v2(uuid) to service_role;

create or replace function public.dabbir_platform_owner_executive_v1(p_actor_user_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public,dabbir_private,pg_temp as $$ select public.dabbir_platform_owner_executive_v2(p_actor_user_id); $$;
revoke all on function public.dabbir_platform_owner_executive_v1(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_platform_owner_executive_v1(uuid) to service_role;

create or replace function public.dabbir_ceo_command_create_v1(p_created_by uuid,p_command_text text,p_priority text)
returns jsonb language sql security invoker set search_path=pg_catalog,public,dabbir_private,pg_temp as $$ select public.dabbir_ceo_command_create_v2(p_created_by,p_command_text,p_priority,null,'[]'::jsonb,null); $$;
revoke all on function public.dabbir_ceo_command_create_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_ceo_command_create_v1(uuid,text,text) to service_role;

create or replace function public.dabbir_ceo_commands_recent_v1(p_limit integer default 20)
returns jsonb language sql security invoker set search_path=pg_catalog,public,dabbir_private,pg_temp as $$ select public.dabbir_ceo_commands_recent_v2(p_limit); $$;
revoke all on function public.dabbir_ceo_commands_recent_v1(integer) from public,anon,authenticated;
grant execute on function public.dabbir_ceo_commands_recent_v1(integer) to service_role;
