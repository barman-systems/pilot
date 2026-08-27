-- DABBIR Owner Decision Memory v1
-- Owner-approved low-risk policy memory. Observations never grant authority.

create table if not exists public.dabbir_owner_decision_observations(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete restrict, action_key text not null, decision_key text not null,
 decision_value text not null, risk_class text not null check(risk_class in('LOW','MEDIUM','HIGH','IRREVERSIBLE')),
 match_bounds jsonb not null default '{}'::jsonb, source_type text not null, source_id uuid null, created_at timestamptz not null default now(),
 check(action_key ~ '^[a-z0-9_.:-]{3,120}$'), check(decision_key ~ '^[a-z0-9_.:-]{3,120}$')
);
create index if not exists dabbir_owner_decision_observations_pattern_idx on public.dabbir_owner_decision_observations(business_id,action_key,decision_key,decision_value,created_at desc);

create table if not exists public.dabbir_owner_policy_versions(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
 action_key text not null, version integer not null check(version>0), state text not null default 'ACTIVE' check(state in('ACTIVE','PAUSED','REVOKED','SUPERSEDED')),
 risk_class text not null check(risk_class='LOW'), decision_key text not null, decision_value text not null, match_bounds jsonb not null default '{}'::jsonb,
 owner_user_id uuid not null references auth.users(id) on delete restrict, explicit_confirmation boolean not null default false, confirmation_source text null,
 activated_at timestamptz null, paused_at timestamptz null, revoked_at timestamptz null, superseded_at timestamptz null, created_at timestamptz not null default now(),
 unique(business_id,action_key,version), check(state<>'ACTIVE' or (explicit_confirmation and activated_at is not null))
);
create unique index if not exists dabbir_owner_policy_versions_one_active_idx on public.dabbir_owner_policy_versions(business_id,action_key) where state='ACTIVE';

create table if not exists public.dabbir_owner_policy_audit(
 id bigint generated always as identity primary key, business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
 policy_id uuid null references public.dabbir_owner_policy_versions(id) on delete set null, actor_user_id uuid null references auth.users(id) on delete set null,
 event_type text not null check(event_type in('SUGGESTED','ACTIVATED','MATCHED','NO_MATCH','PAUSED','RESUMED','REVOKED','EXECUTED')),
 action_key text not null, policy_version integer null, match_reason text null, safe_metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists dabbir_owner_policy_audit_business_idx on public.dabbir_owner_policy_audit(business_id,created_at desc);

alter table public.dabbir_owner_decision_observations enable row level security; alter table public.dabbir_owner_decision_observations force row level security;
alter table public.dabbir_owner_policy_versions enable row level security; alter table public.dabbir_owner_policy_versions force row level security;
alter table public.dabbir_owner_policy_audit enable row level security; alter table public.dabbir_owner_policy_audit force row level security;
revoke all on public.dabbir_owner_decision_observations,public.dabbir_owner_policy_versions,public.dabbir_owner_policy_audit from public,anon,authenticated;
grant select on public.dabbir_owner_decision_observations,public.dabbir_owner_policy_versions,public.dabbir_owner_policy_audit to authenticated;
create policy dabbir_owner_decision_observations_owner_select on public.dabbir_owner_decision_observations for select to authenticated using(exists(select 1 from public.dabbir_memberships m where m.business_id=dabbir_owner_decision_observations.business_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='owner'));
create policy dabbir_owner_policy_versions_owner_select on public.dabbir_owner_policy_versions for select to authenticated using(exists(select 1 from public.dabbir_memberships m where m.business_id=dabbir_owner_policy_versions.business_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='owner'));
create policy dabbir_owner_policy_audit_owner_select on public.dabbir_owner_policy_audit for select to authenticated using(exists(select 1 from public.dabbir_memberships m where m.business_id=dabbir_owner_policy_audit.business_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='owner'));
comment on table public.dabbir_owner_decision_observations is 'Explicit owner decisions used only to suggest low-risk DABBIR policies; observations never grant authority.';
comment on table public.dabbir_owner_policy_versions is 'Versioned explicitly owner-approved LOW-risk DABBIR autonomy policies. Money/legal/KYC/high-risk authority excluded.';
comment on table public.dabbir_owner_policy_audit is 'Append-only owner policy lifecycle and execution audit.';

create or replace function dabbir_private.dabbir_record_owner_decision(p_business_id uuid,p_action_key text,p_decision_key text,p_decision_value text,p_risk_class text,p_match_bounds jsonb default '{}'::jsonb,p_source_type text default 'owner_action',p_source_id uuid default null)
returns uuid language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_owner uuid:=auth.uid(); v_id uuid; v_action text:=lower(trim(coalesce(p_action_key,''))); v_risk text:=upper(trim(coalesce(p_risk_class,'')));
begin
 if v_owner is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=v_owner and m.status='active' and m.role='owner') then raise exception 'OWNER_REQUIRED'; end if;
 if v_risk<>'LOW' then raise exception 'POLICY_MEMORY_LOW_RISK_ONLY'; end if;
 if v_action ~ '(payment|refund|payout|withdraw|transfer|billing|invoice\.pay|legal|kyc|identity|bank|discount|price)' then raise exception 'SENSITIVE_ACTION_NOT_LEARNABLE'; end if;
 if v_action !~ '^[a-z0-9_.:-]{3,120}$' or lower(trim(coalesce(p_decision_key,''))) !~ '^[a-z0-9_.:-]{3,120}$' then raise exception 'INVALID_POLICY_KEY'; end if;
 if length(trim(coalesce(p_decision_value,'')))<1 or length(p_decision_value)>200 then raise exception 'INVALID_DECISION_VALUE'; end if;
 if jsonb_typeof(coalesce(p_match_bounds,'{}'::jsonb))<>'object' then raise exception 'INVALID_MATCH_BOUNDS'; end if;
 insert into public.dabbir_owner_decision_observations(business_id,owner_user_id,action_key,decision_key,decision_value,risk_class,match_bounds,source_type,source_id)
 values(p_business_id,v_owner,v_action,lower(trim(p_decision_key)),trim(p_decision_value),v_risk,coalesce(p_match_bounds,'{}'::jsonb),left(trim(coalesce(p_source_type,'owner_action')),80),p_source_id) returning id into v_id;
 return v_id;
end;$$;

create or replace function dabbir_private.dabbir_owner_policy_candidates(p_business_id uuid)
returns table(action_key text,decision_key text,decision_value text,match_bounds jsonb,observation_count bigint,last_observed_at timestamptz)
language sql stable security definer set search_path='public','pg_temp' as $$
 select o.action_key,o.decision_key,o.decision_value,o.match_bounds,count(*)::bigint,max(o.created_at)
 from public.dabbir_owner_decision_observations o
 where o.business_id=p_business_id and o.risk_class='LOW'
 and exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='owner')
 and not exists(select 1 from public.dabbir_owner_policy_versions p where p.business_id=o.business_id and p.action_key=o.action_key and p.state='ACTIVE')
 group by o.action_key,o.decision_key,o.decision_value,o.match_bounds having count(*)>=3;
$$;

create or replace function dabbir_private.dabbir_activate_owner_policy(p_business_id uuid,p_action_key text,p_decision_key text,p_decision_value text,p_match_bounds jsonb,p_confirmation_source text)
returns uuid language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_owner uuid:=auth.uid();v_id uuid;v_version integer;v_count bigint;v_action text:=lower(trim(coalesce(p_action_key,'')));
begin
 if v_owner is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=v_owner and m.status='active' and m.role='owner') then raise exception 'OWNER_REQUIRED'; end if;
 if v_action ~ '(payment|refund|payout|withdraw|transfer|billing|invoice\.pay|legal|kyc|identity|bank|discount|price)' then raise exception 'SENSITIVE_ACTION_NOT_LEARNABLE'; end if;
 select count(*) into v_count from public.dabbir_owner_decision_observations o where o.business_id=p_business_id and o.action_key=v_action and o.decision_key=lower(trim(p_decision_key)) and o.decision_value=trim(p_decision_value) and o.match_bounds=coalesce(p_match_bounds,'{}'::jsonb) and o.risk_class='LOW';
 if v_count<3 then raise exception 'INSUFFICIENT_MATCHING_OBSERVATIONS'; end if;
 update public.dabbir_owner_policy_versions set state='SUPERSEDED',superseded_at=now() where business_id=p_business_id and action_key=v_action and state='ACTIVE';
 select coalesce(max(version),0)+1 into v_version from public.dabbir_owner_policy_versions where business_id=p_business_id and action_key=v_action;
 insert into public.dabbir_owner_policy_versions(business_id,action_key,version,state,risk_class,decision_key,decision_value,match_bounds,owner_user_id,explicit_confirmation,confirmation_source,activated_at)
 values(p_business_id,v_action,v_version,'ACTIVE','LOW',lower(trim(p_decision_key)),trim(p_decision_value),coalesce(p_match_bounds,'{}'::jsonb),v_owner,true,left(trim(coalesce(p_confirmation_source,'owner_ui')),80),now()) returning id into v_id;
 insert into public.dabbir_owner_policy_audit(business_id,policy_id,actor_user_id,event_type,action_key,policy_version,match_reason,safe_metadata) values(p_business_id,v_id,v_owner,'ACTIVATED',v_action,v_version,'explicit_owner_confirmation',jsonb_build_object('observation_count',v_count));
 return v_id;
end;$$;

create or replace function dabbir_private.dabbir_set_owner_policy_state(p_business_id uuid,p_policy_id uuid,p_state text)
returns text language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_owner uuid:=auth.uid();v_old text;v_action text;v_version int;v_new text:=upper(trim(coalesce(p_state,'')));v_event text;
begin
 if v_owner is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=v_owner and m.status='active' and m.role='owner') then raise exception 'OWNER_REQUIRED'; end if;
 if v_new not in('ACTIVE','PAUSED','REVOKED') then raise exception 'INVALID_POLICY_STATE'; end if;
 select p.state,p.action_key,p.version into v_old,v_action,v_version from public.dabbir_owner_policy_versions p where p.id=p_policy_id and p.business_id=p_business_id for update;
 if not found then raise exception 'POLICY_NOT_FOUND'; end if; if v_old='REVOKED' then raise exception 'REVOKED_POLICY_IMMUTABLE'; end if;
 if v_new='ACTIVE' and v_old not in('PAUSED','ACTIVE') then raise exception 'POLICY_CANNOT_RESUME'; end if;
 if v_new='ACTIVE' and exists(select 1 from public.dabbir_owner_policy_versions p where p.business_id=p_business_id and p.action_key=v_action and p.state='ACTIVE' and p.id<>p_policy_id) then raise exception 'ANOTHER_ACTIVE_POLICY_EXISTS'; end if;
 update public.dabbir_owner_policy_versions set state=v_new,paused_at=case when v_new='PAUSED' then now() when v_new='ACTIVE' then null else paused_at end,revoked_at=case when v_new='REVOKED' then now() else revoked_at end,activated_at=case when v_new='ACTIVE' then now() else activated_at end where id=p_policy_id;
 v_event:=case when v_new='PAUSED' then 'PAUSED' when v_new='REVOKED' then 'REVOKED' when v_old='PAUSED' and v_new='ACTIVE' then 'RESUMED' else null end;
 if v_event is not null then insert into public.dabbir_owner_policy_audit(business_id,policy_id,actor_user_id,event_type,action_key,policy_version,match_reason) values(p_business_id,p_policy_id,v_owner,v_event,v_action,v_version,'explicit_owner_action'); end if;
 return v_new;
end;$$;

create or replace function dabbir_private.dabbir_match_owner_policy(p_business_id uuid,p_action_key text,p_match_bounds jsonb)
returns table(policy_id uuid,policy_version integer,decision_key text,decision_value text,match_reason text)
language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_policy public.dabbir_owner_policy_versions%rowtype;v_business uuid:=p_business_id;v_action text:=lower(trim(coalesce(p_action_key,'')));v_bounds jsonb:=coalesce(p_match_bounds,'{}'::jsonb);
begin
 if auth.uid() is null then return; end if;
 if v_action ~ '(payment|refund|payout|withdraw|transfer|billing|invoice\.pay|legal|kyc|identity|bank|discount|price)' then return; end if;
 if not exists(select 1 from public.dabbir_memberships m where m.business_id=v_business and m.user_id=auth.uid() and m.status='active') then return; end if;
 select p.* into v_policy from public.dabbir_owner_policy_versions p where p.business_id=v_business and p.action_key=v_action and p.state='ACTIVE' and p.risk_class='LOW' and p.explicit_confirmation and p.match_bounds=v_bounds order by p.version desc limit 1;
 if not found then return; end if; return query select v_policy.id,v_policy.version,v_policy.decision_key,v_policy.decision_value,'exact_action_and_bounds'::text;
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
grant execute on function dabbir_private.dabbir_match_owner_policy(uuid,text,jsonb) to authenticated,service_role;
