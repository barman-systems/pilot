-- DABBIR Owner Decision Memory v1 (BAR-29)
-- Explicit owner decisions may suggest LOW-risk policies after 3 distinct observations.
-- Observations never grant authority. Activation is explicit. Matching is exact and privacy-minimized.

create table if not exists public.dabbir_owner_decision_observations(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  action_key text not null check(action_key ~ '^[a-z0-9_.:-]{3,120}$'),
  decision_key text not null check(decision_key ~ '^[a-z0-9_.:-]{3,120}$'),
  decision_value text not null check(length(decision_value) between 1 and 200),
  risk_class text not null check(risk_class in('LOW','MEDIUM','HIGH','IRREVERSIBLE')),
  match_bounds jsonb not null default '{}'::jsonb check(jsonb_typeof(match_bounds)='object' and octet_length(match_bounds::text)<=4096),
  match_fingerprint text generated always as (md5(match_bounds::text)) stored,
  source_type text not null check(length(source_type) between 1 and 80),
  source_id uuid null,
  created_at timestamptz not null default now()
);
create index if not exists dabbir_owner_decision_observations_pattern_idx
  on public.dabbir_owner_decision_observations(business_id,action_key,decision_key,decision_value,match_fingerprint,created_at desc);
create unique index if not exists dabbir_owner_decision_observations_source_unique_idx
  on public.dabbir_owner_decision_observations(business_id,action_key,source_type,source_id)
  where source_id is not null;

create table if not exists public.dabbir_owner_policy_versions(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  action_key text not null check(action_key ~ '^[a-z0-9_.:-]{3,120}$'),
  version integer not null check(version>0),
  state text not null default 'PAUSED' check(state in('ACTIVE','PAUSED','REVOKED','SUPERSEDED')),
  risk_class text not null check(risk_class='LOW'),
  decision_key text not null,
  decision_value text not null,
  match_bounds jsonb not null default '{}'::jsonb check(jsonb_typeof(match_bounds)='object' and octet_length(match_bounds::text)<=4096),
  match_fingerprint text generated always as (md5(match_bounds::text)) stored,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  explicit_confirmation boolean not null default false,
  confirmation_source text null,
  activated_at timestamptz null,
  paused_at timestamptz null,
  revoked_at timestamptz null,
  superseded_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(business_id,action_key,version),
  check(state<>'ACTIVE' or (explicit_confirmation and activated_at is not null))
);
create unique index if not exists dabbir_owner_policy_versions_one_active_scope_idx
  on public.dabbir_owner_policy_versions(business_id,action_key,match_fingerprint) where state='ACTIVE';
create index if not exists dabbir_owner_policy_versions_lookup_idx
  on public.dabbir_owner_policy_versions(business_id,action_key,state,match_fingerprint,version desc);

create table if not exists public.dabbir_owner_policy_audit(
  id bigint generated always as identity primary key,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  policy_id uuid null references public.dabbir_owner_policy_versions(id) on delete set null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null check(event_type in('ACTIVATED','MATCHED','PAUSED','RESUMED','REVOKED','EXECUTED')),
  action_key text not null,
  policy_version integer null,
  match_reason text null,
  safe_metadata jsonb not null default '{}'::jsonb check(octet_length(safe_metadata::text)<=4096),
  created_at timestamptz not null default now()
);
create index if not exists dabbir_owner_policy_audit_business_idx on public.dabbir_owner_policy_audit(business_id,created_at desc);

alter table public.dabbir_owner_decision_observations enable row level security;
alter table public.dabbir_owner_policy_versions enable row level security;
alter table public.dabbir_owner_policy_audit enable row level security;
revoke all on public.dabbir_owner_decision_observations,public.dabbir_owner_policy_versions,public.dabbir_owner_policy_audit from public,anon,authenticated;
grant select on public.dabbir_owner_decision_observations,public.dabbir_owner_policy_versions,public.dabbir_owner_policy_audit to authenticated;
grant select,insert,update,delete on public.dabbir_owner_decision_observations,public.dabbir_owner_policy_versions,public.dabbir_owner_policy_audit to service_role;
grant usage,select on sequence public.dabbir_owner_policy_audit_id_seq to service_role;

drop policy if exists dabbir_owner_decision_observations_owner_select on public.dabbir_owner_decision_observations;
create policy dabbir_owner_decision_observations_owner_select on public.dabbir_owner_decision_observations for select to authenticated
using(exists(select 1 from public.dabbir_memberships m where m.business_id=public.dabbir_owner_decision_observations.business_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='owner'));
drop policy if exists dabbir_owner_policy_versions_owner_select on public.dabbir_owner_policy_versions;
create policy dabbir_owner_policy_versions_owner_select on public.dabbir_owner_policy_versions for select to authenticated
using(exists(select 1 from public.dabbir_memberships m where m.business_id=public.dabbir_owner_policy_versions.business_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='owner'));
drop policy if exists dabbir_owner_policy_audit_owner_select on public.dabbir_owner_policy_audit;
create policy dabbir_owner_policy_audit_owner_select on public.dabbir_owner_policy_audit for select to authenticated
using(exists(select 1 from public.dabbir_memberships m where m.business_id=public.dabbir_owner_policy_audit.business_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='owner'));

create or replace function dabbir_private.dabbir_owner_memory_sensitive_action(p_action_key text)
returns boolean language sql immutable set search_path='' as $$
  select lower(coalesce(p_action_key,'')) ~ '(payment|refund|payout|withdraw|transfer|billing|invoice|legal|kyc|identity|bank|discount|price|money|cash|tax|vat|credential|secret|purchase|procure)';
$$;
revoke all on function dabbir_private.dabbir_owner_memory_sensitive_action(text) from public,anon,authenticated;
grant execute on function dabbir_private.dabbir_owner_memory_sensitive_action(text) to service_role;

create or replace function dabbir_private.dabbir_record_owner_decision(
  p_business_id uuid,p_action_key text,p_decision_key text,p_decision_value text,p_risk_class text,
  p_match_bounds jsonb default '{}'::jsonb,p_source_type text default 'owner_action',p_source_id uuid default null
) returns uuid language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_owner uuid:=auth.uid();v_id uuid;v_action text:=lower(trim(coalesce(p_action_key,'')));v_key text:=lower(trim(coalesce(p_decision_key,'')));v_risk text:=upper(trim(coalesce(p_risk_class,'')));
begin
  if v_owner is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=v_owner and m.status='active' and m.role='owner') then raise exception 'OWNER_REQUIRED'; end if;
  if v_risk<>'LOW' then raise exception 'POLICY_MEMORY_LOW_RISK_ONLY'; end if;
  if dabbir_private.dabbir_owner_memory_sensitive_action(v_action) then raise exception 'SENSITIVE_ACTION_NOT_LEARNABLE'; end if;
  if v_action !~ '^[a-z0-9_.:-]{3,120}$' or v_key !~ '^[a-z0-9_.:-]{3,120}$' then raise exception 'INVALID_POLICY_KEY'; end if;
  if length(trim(coalesce(p_decision_value,'')))<1 or length(trim(p_decision_value))>200 then raise exception 'INVALID_DECISION_VALUE'; end if;
  if jsonb_typeof(coalesce(p_match_bounds,'{}'::jsonb))<>'object' or octet_length(coalesce(p_match_bounds,'{}'::jsonb)::text)>4096 then raise exception 'INVALID_MATCH_BOUNDS'; end if;
  insert into public.dabbir_owner_decision_observations(business_id,owner_user_id,action_key,decision_key,decision_value,risk_class,match_bounds,source_type,source_id)
  values(p_business_id,v_owner,v_action,v_key,trim(p_decision_value),v_risk,coalesce(p_match_bounds,'{}'::jsonb),left(trim(coalesce(p_source_type,'owner_action')),80),p_source_id)
  on conflict (business_id,action_key,source_type,source_id) where source_id is not null do nothing
  returning id into v_id;
  return v_id;
end;$$;

create or replace function dabbir_private.dabbir_owner_policy_candidates(p_business_id uuid)
returns table(action_key text,decision_key text,decision_value text,match_bounds jsonb,observation_count bigint,last_observed_at timestamptz)
language sql stable security definer set search_path='public','pg_temp' as $$
  select o.action_key,o.decision_key,o.decision_value,o.match_bounds,count(*)::bigint,max(o.created_at)
  from public.dabbir_owner_decision_observations o
  where o.business_id=p_business_id and o.risk_class='LOW'
    and exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='owner')
    and not dabbir_private.dabbir_owner_memory_sensitive_action(o.action_key)
    and not exists(select 1 from public.dabbir_owner_policy_versions p where p.business_id=o.business_id and p.action_key=o.action_key and p.decision_key=o.decision_key and p.decision_value=o.decision_value and p.match_fingerprint=o.match_fingerprint and p.state in('ACTIVE','PAUSED'))
  group by o.action_key,o.decision_key,o.decision_value,o.match_bounds having count(*)>=3;
$$;

create or replace function dabbir_private.dabbir_activate_owner_policy(p_business_id uuid,p_action_key text,p_decision_key text,p_decision_value text,p_match_bounds jsonb,p_confirmation_source text)
returns uuid language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_owner uuid:=auth.uid();v_id uuid;v_version integer;v_count bigint;v_action text:=lower(trim(coalesce(p_action_key,'')));v_key text:=lower(trim(coalesce(p_decision_key,'')));v_bounds jsonb:=coalesce(p_match_bounds,'{}'::jsonb);v_fingerprint text:=md5(coalesce(p_match_bounds,'{}'::jsonb)::text);
begin
  if v_owner is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=v_owner and m.status='active' and m.role='owner') then raise exception 'OWNER_REQUIRED'; end if;
  if dabbir_private.dabbir_owner_memory_sensitive_action(v_action) then raise exception 'SENSITIVE_ACTION_NOT_LEARNABLE'; end if;
  select count(*) into v_count from public.dabbir_owner_decision_observations o where o.business_id=p_business_id and o.action_key=v_action and o.decision_key=v_key and o.decision_value=trim(p_decision_value) and o.match_fingerprint=v_fingerprint and o.risk_class='LOW';
  if v_count<3 then raise exception 'INSUFFICIENT_MATCHING_OBSERVATIONS'; end if;
  update public.dabbir_owner_policy_versions set state='SUPERSEDED',superseded_at=now() where business_id=p_business_id and action_key=v_action and match_fingerprint=v_fingerprint and state='ACTIVE';
  select coalesce(max(version),0)+1 into v_version from public.dabbir_owner_policy_versions where business_id=p_business_id and action_key=v_action;
  insert into public.dabbir_owner_policy_versions(business_id,action_key,version,state,risk_class,decision_key,decision_value,match_bounds,owner_user_id,explicit_confirmation,confirmation_source,activated_at)
  values(p_business_id,v_action,v_version,'ACTIVE','LOW',v_key,trim(p_decision_value),v_bounds,v_owner,true,left(trim(coalesce(p_confirmation_source,'owner_ui')),80),now()) returning id into v_id;
  insert into public.dabbir_owner_policy_audit(business_id,policy_id,actor_user_id,event_type,action_key,policy_version,match_reason,safe_metadata)
  values(p_business_id,v_id,v_owner,'ACTIVATED',v_action,v_version,'explicit_owner_confirmation',jsonb_build_object('observation_count',v_count,'match_fingerprint',v_fingerprint));
  return v_id;
end;$$;

create or replace function dabbir_private.dabbir_set_owner_policy_state(p_business_id uuid,p_policy_id uuid,p_state text)
returns text language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_owner uuid:=auth.uid();v_old text;v_action text;v_version int;v_fingerprint text;v_new text:=upper(trim(coalesce(p_state,'')));v_event text;
begin
  if v_owner is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=v_owner and m.status='active' and m.role='owner') then raise exception 'OWNER_REQUIRED'; end if;
  if v_new not in('ACTIVE','PAUSED','REVOKED') then raise exception 'INVALID_POLICY_STATE'; end if;
  select p.state,p.action_key,p.version,p.match_fingerprint into v_old,v_action,v_version,v_fingerprint from public.dabbir_owner_policy_versions p where p.id=p_policy_id and p.business_id=p_business_id for update;
  if not found then raise exception 'POLICY_NOT_FOUND'; end if;
  if v_old='REVOKED' then raise exception 'REVOKED_POLICY_IMMUTABLE'; end if;
  if v_new='ACTIVE' and v_old not in('PAUSED','ACTIVE') then raise exception 'POLICY_CANNOT_RESUME'; end if;
  if v_new='ACTIVE' and exists(select 1 from public.dabbir_owner_policy_versions p where p.business_id=p_business_id and p.action_key=v_action and p.match_fingerprint=v_fingerprint and p.state='ACTIVE' and p.id<>p_policy_id) then raise exception 'ANOTHER_ACTIVE_POLICY_EXISTS'; end if;
  update public.dabbir_owner_policy_versions set state=v_new,paused_at=case when v_new='PAUSED' then now() when v_new='ACTIVE' then null else paused_at end,revoked_at=case when v_new='REVOKED' then now() else revoked_at end,activated_at=case when v_new='ACTIVE' then now() else activated_at end where id=p_policy_id;
  v_event:=case when v_new='PAUSED' then 'PAUSED' when v_new='REVOKED' then 'REVOKED' when v_old='PAUSED' and v_new='ACTIVE' then 'RESUMED' else null end;
  if v_event is not null then insert into public.dabbir_owner_policy_audit(business_id,policy_id,actor_user_id,event_type,action_key,policy_version,match_reason) values(p_business_id,p_policy_id,v_owner,v_event,v_action,v_version,'explicit_owner_action'); end if;
  return v_new;
end;$$;

create or replace function dabbir_private.dabbir_match_owner_policy(p_business_id uuid,p_action_key text,p_match_bounds jsonb)
returns table(policy_id uuid,policy_version integer,decision_key text,decision_value text,match_reason text)
language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_policy public.dabbir_owner_policy_versions%rowtype;v_action text:=lower(trim(coalesce(p_action_key,'')));v_bounds jsonb:=coalesce(p_match_bounds,'{}'::jsonb);
begin
  if auth.uid() is null then return; end if;
  if dabbir_private.dabbir_owner_memory_sensitive_action(v_action) then return; end if;
  if not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=auth.uid() and m.status='active') then return; end if;
  select p.* into v_policy from public.dabbir_owner_policy_versions p where p.business_id=p_business_id and p.action_key=v_action and p.state='ACTIVE' and p.risk_class='LOW' and p.explicit_confirmation and p.match_fingerprint=md5(v_bounds::text) and p.match_bounds=v_bounds order by p.version desc limit 1;
  if not found then return; end if;
  return query select v_policy.id,v_policy.version,v_policy.decision_key,v_policy.decision_value,'exact_action_and_bounds'::text;
end;$$;

revoke all on function dabbir_private.dabbir_record_owner_decision(uuid,text,text,text,text,jsonb,text,uuid) from public,anon;
revoke all on function dabbir_private.dabbir_owner_policy_candidates(uuid) from public,anon;
revoke all on function dabbir_private.dabbir_activate_owner_policy(uuid,text,text,text,jsonb,text) from public,anon;
revoke all on function dabbir_private.dabbir_set_owner_policy_state(uuid,uuid,text) from public,anon;
revoke all on function dabbir_private.dabbir_match_owner_policy(uuid,text,jsonb) from public,anon;
grant execute on function dabbir_private.dabbir_record_owner_decision(uuid,text,text,text,text,jsonb,text,uuid) to authenticated;
grant execute on function dabbir_private.dabbir_owner_policy_candidates(uuid) to authenticated;
grant execute on function dabbir_private.dabbir_activate_owner_policy(uuid,text,text,text,jsonb,text) to authenticated;
grant execute on function dabbir_private.dabbir_set_owner_policy_state(uuid,uuid,text) to authenticated;
grant execute on function dabbir_private.dabbir_match_owner_policy(uuid,text,jsonb) to authenticated;

-- First execution path: suppress only an exact repeated LOW-priority OWNER_DECISION handoff.
create or replace function dabbir_private.dabbir_owner_policy_skip_handoff(p_business_id uuid,p_route_class text,p_reason text,p_priority integer)
returns uuid language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_reason text:=lower(trim(coalesce(p_reason,'')));v_hash text;v_bounds jsonb;v_match record;
begin
  if auth.uid() is null then return null; end if;
  if upper(coalesce(p_route_class,''))<>'OWNER_DECISION' or coalesce(p_priority,100)>40 then return null; end if;
  if length(v_reason)<3 or length(v_reason)>120 then return null; end if;
  if dabbir_private.dabbir_owner_memory_sensitive_action(v_reason) then return null; end if;
  v_hash:=encode(extensions.digest(v_reason,'sha256'),'hex');
  v_bounds:=jsonb_build_object('route_class','OWNER_DECISION','reason_hash',v_hash,'max_priority',40);
  select * into v_match from dabbir_private.dabbir_match_owner_policy(p_business_id,'handoff.owner_decision.continue_ai',v_bounds) limit 1;
  if not found or v_match.decision_key<>'behavior' or v_match.decision_value<>'continue_with_ai' then return null; end if;
  insert into public.dabbir_owner_policy_audit(business_id,policy_id,actor_user_id,event_type,action_key,policy_version,match_reason,safe_metadata)
  values(p_business_id,v_match.policy_id,auth.uid(),'MATCHED','handoff.owner_decision.continue_ai',v_match.policy_version,'exact_low_priority_handoff_match',jsonb_build_object('reason_hash',v_hash,'priority',p_priority));
  insert into public.dabbir_owner_policy_audit(business_id,policy_id,actor_user_id,event_type,action_key,policy_version,match_reason,safe_metadata)
  values(p_business_id,v_match.policy_id,auth.uid(),'EXECUTED','handoff.owner_decision.continue_ai',v_match.policy_version,'owner_approved_continue_with_ai',jsonb_build_object('external_side_effects',false,'handoff_created',false,'reason_hash',v_hash));
  return v_match.policy_id;
end;$$;
revoke all on function dabbir_private.dabbir_owner_policy_skip_handoff(uuid,text,text,integer) from public,anon;
grant execute on function dabbir_private.dabbir_owner_policy_skip_handoff(uuid,text,text,integer) to authenticated;

create or replace function public.dabbir_create_handoff(
  p_business_id uuid,p_conversation_id uuid,p_customer_id uuid,p_route_class text,p_reason text,p_priority integer default 50,
  p_routing_strategy text default 'least_open',p_summary text default '',p_attempted_actions jsonb default '[]'::jsonb,p_unresolved_items jsonb default '[]'::jsonb
) returns uuid language plpgsql security invoker set search_path='public','pg_temp' as $$
declare v_id uuid;v_policy_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_handoffs') then raise exception 'HANDOFF_MANAGEMENT_REQUIRED'; end if;
  if p_route_class not in('SALES','SUPPORT','BOOKING','RETURNS','COMPLAINT','OWNER_DECISION') then raise exception 'INVALID_HANDOFF_ROUTE'; end if;
  if p_routing_strategy not in('least_open','round_robin','skill','priority') then raise exception 'INVALID_ROUTING_STRATEGY'; end if;
  if not exists(select 1 from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id) then raise exception 'CONVERSATION_NOT_IN_BUSINESS'; end if;
  if p_customer_id is not null and not exists(select 1 from public.dabbir_customers c where c.id=p_customer_id and c.business_id=p_business_id) then raise exception 'CUSTOMER_NOT_IN_BUSINESS'; end if;
  v_policy_id:=dabbir_private.dabbir_owner_policy_skip_handoff(p_business_id,p_route_class,p_reason,greatest(0,least(100,p_priority)));
  if v_policy_id is not null then return null; end if;
  insert into public.dabbir_handoffs(business_id,conversation_id,customer_id,route_class,reason,priority,routing_strategy,summary,attempted_actions,unresolved_items)
  values(p_business_id,p_conversation_id,p_customer_id,p_route_class,left(coalesce(p_reason,''),240),greatest(0,least(100,p_priority)),p_routing_strategy,left(coalesce(p_summary,''),1200),coalesce(p_attempted_actions,'[]'::jsonb),coalesce(p_unresolved_items,'[]'::jsonb))
  on conflict(business_id,conversation_id) where state in('QUEUED','ASSIGNED','HUMAN_ACTIVE') do update set route_class=excluded.route_class,reason=excluded.reason,priority=greatest(public.dabbir_handoffs.priority,excluded.priority),summary=excluded.summary,attempted_actions=excluded.attempted_actions,unresolved_items=excluded.unresolved_items,updated_at=now() returning id into v_id;
  update public.dabbir_conversations set state='action_required',updated_at=now() where id=p_conversation_id and business_id=p_business_id and state<>'human_active';
  return v_id;
end;$$;
revoke all on function public.dabbir_create_handoff(uuid,uuid,uuid,text,text,integer,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.dabbir_create_handoff(uuid,uuid,uuid,text,text,integer,text,text,jsonb,jsonb) to authenticated;

create or replace function public.dabbir_return_conversation_to_ai(p_business_id uuid,p_conversation_id uuid)
returns jsonb language plpgsql security invoker set search_path='public','pg_temp' as $$
declare v_now timestamptz:=now();v_role text;v_handoff public.dabbir_handoffs%rowtype;v_reason text;v_hash text;v_bounds jsonb;v_human_reply_exists boolean:=false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'reply_conversations') then raise exception 'REPLY_PERMISSION_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_handoffs') then raise exception 'HANDOFF_MANAGEMENT_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id) then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  select m.role into v_role from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=auth.uid() and m.status='active' limit 1;
  select h.* into v_handoff from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in('QUEUED','ASSIGNED','HUMAN_ACTIVE') order by h.updated_at desc limit 1 for update;
  if found and v_role='owner' and v_handoff.route_class='OWNER_DECISION' and coalesce(v_handoff.priority,100)<=40 then
    v_reason:=lower(trim(coalesce(v_handoff.reason,'')));
    select exists(select 1 from public.dabbir_messages msg where msg.business_id=p_business_id and msg.conversation_id=p_conversation_id and msg.sender_type='human' and msg.created_at>=coalesce(v_handoff.human_active_at,v_handoff.assigned_at,v_handoff.created_at)) into v_human_reply_exists;
    if not v_human_reply_exists and length(v_reason) between 3 and 120 and not dabbir_private.dabbir_owner_memory_sensitive_action(v_reason) then
      v_hash:=encode(extensions.digest(v_reason,'sha256'),'hex');
      v_bounds:=jsonb_build_object('route_class','OWNER_DECISION','reason_hash',v_hash,'max_priority',40);
      perform dabbir_private.dabbir_record_owner_decision(p_business_id,'handoff.owner_decision.continue_ai','behavior','continue_with_ai','LOW',v_bounds,'return_to_ai',v_handoff.id);
    end if;
  end if;
  update public.dabbir_handoffs set state='RETURNED_TO_AI',returned_to_ai_at=v_now,updated_at=v_now where business_id=p_business_id and conversation_id=p_conversation_id and state in('QUEUED','ASSIGNED','HUMAN_ACTIVE');
  update public.dabbir_conversations set state='waiting_customer',updated_at=v_now where id=p_conversation_id and business_id=p_business_id;
  return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'state','waiting_customer');
end;$$;
revoke all on function public.dabbir_return_conversation_to_ai(uuid,uuid) from public,anon;
grant execute on function public.dabbir_return_conversation_to_ai(uuid,uuid) to authenticated;

comment on table public.dabbir_owner_decision_observations is 'Explicit owner LOW-risk decisions used only to suggest DABBIR policies; observations never grant authority.';
comment on table public.dabbir_owner_policy_versions is 'Versioned explicitly owner-approved LOW-risk autonomy policies. Money/legal/KYC/high-risk actions are excluded.';
comment on table public.dabbir_owner_policy_audit is 'Owner policy lifecycle and execution audit; raw handoff reasons are not stored by owner-memory execution.';
