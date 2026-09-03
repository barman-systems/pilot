alter table dabbir_private.dabbir_ceo_commands
  add column if not exists objective text,
  add column if not exists acceptance_criteria jsonb not null default '[]'::jsonb,
  add column if not exists due_at timestamptz,
  add column if not exists guidance jsonb not null default '[]'::jsonb,
  add column if not exists claimed_at timestamptz,
  add column if not exists blocked_reason text;

alter table dabbir_private.dabbir_ceo_commands drop constraint if exists dabbir_ceo_commands_acceptance_criteria_check;
alter table dabbir_private.dabbir_ceo_commands add constraint dabbir_ceo_commands_acceptance_criteria_check check (jsonb_typeof(acceptance_criteria)='array');
alter table dabbir_private.dabbir_ceo_commands drop constraint if exists dabbir_ceo_commands_guidance_check;
alter table dabbir_private.dabbir_ceo_commands add constraint dabbir_ceo_commands_guidance_check check (jsonb_typeof(guidance)='array');

create index if not exists dabbir_ceo_commands_due_status_idx on dabbir_private.dabbir_ceo_commands(status,due_at,priority,created_at desc);

create or replace function public.dabbir_ceo_command_create_v2(
  p_created_by uuid,
  p_command_text text,
  p_priority text default 'P1',
  p_objective text default null,
  p_acceptance_criteria jsonb default '[]'::jsonb,
  p_due_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, dabbir_private, pg_temp
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
end;
$$;

create or replace function public.dabbir_ceo_commands_recent_v2(p_limit integer default 20)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, dabbir_private, pg_temp
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

create or replace function public.dabbir_ceo_command_update_v2(
  p_actor_user_id uuid,
  p_command_id uuid,
  p_operation text,
  p_priority text default null,
  p_due_at timestamptz default null,
  p_guidance text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, dabbir_private, pg_temp
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
end;
$$;

create or replace function public.dabbir_owner_decisions_recent_v1(p_actor_user_id uuid,p_limit integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $$
declare v jsonb; begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  select coalesce(jsonb_agg(to_jsonb(x) order by (x.status='open') desc,x.created_at desc),'[]'::jsonb) into v
  from (select e.id,e.category,e.status,e.question,e.decision,e.created_at,e.resolved_at,e.action_id,e.event_id,
        a.description action_description,ev.summary event_summary,ev.severity event_severity
        from dabbir_private.executive_escalations e
        left join dabbir_private.executive_actions a on a.id=e.action_id
        left join dabbir_private.executive_events ev on ev.id=e.event_id
        order by (e.status='open') desc,e.created_at desc limit greatest(1,least(coalesce(p_limit,30),100))) x;
  return v;
end;
$$;

create or replace function public.dabbir_owner_decision_resolve_v1(p_actor_user_id uuid,p_escalation_id uuid,p_resolution text,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
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
end;
$$;

revoke all on function public.dabbir_ceo_command_create_v2(uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_ceo_commands_recent_v2(integer) from public,anon,authenticated;
revoke all on function public.dabbir_ceo_command_update_v2(uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.dabbir_owner_decisions_recent_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.dabbir_owner_decision_resolve_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_ceo_command_create_v2(uuid,text,text,text,jsonb,timestamptz) to service_role;
grant execute on function public.dabbir_ceo_commands_recent_v2(integer) to service_role;
grant execute on function public.dabbir_ceo_command_update_v2(uuid,uuid,text,text,timestamptz,text) to service_role;
grant execute on function public.dabbir_owner_decisions_recent_v1(uuid,integer) to service_role;
grant execute on function public.dabbir_owner_decision_resolve_v1(uuid,uuid,text,text) to service_role;
