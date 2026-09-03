-- Canonical platform authority model. This migration is intentionally idempotent so
-- environments that received the emergency root-audit DDL out of band converge back
-- to source control without creating a second authority model.
alter table public.dabbir_platform_admins
  add column if not exists display_name text,
  add column if not exists permissions text[] not null default '{}'::text[],
  add column if not exists added_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists suspended_at timestamptz,
  add column if not exists revoked_at timestamptz;

alter table public.dabbir_platform_admins drop constraint if exists dabbir_platform_admins_role_check;
update public.dabbir_platform_admins
set role='ROOT_OWNER', permissions='{}'::text[], updated_at=now()
where role='platform_owner' and active=true;
update public.dabbir_platform_admins
set role='OWNER_DELEGATE',
    permissions=case when role='support_admin' then array['manage_customers','manage_support','manage_incidents']::text[] else coalesce(permissions,'{}'::text[]) end,
    updated_at=now()
where role in ('platform_owner','support_admin');
alter table public.dabbir_platform_admins add constraint dabbir_platform_admins_role_check check(role in ('ROOT_OWNER','OWNER_DELEGATE'));
alter table public.dabbir_platform_admins alter column role set default 'OWNER_DELEGATE';
create unique index if not exists dabbir_platform_single_root_owner_uq on public.dabbir_platform_admins((role)) where role='ROOT_OWNER';

create or replace function dabbir_private.platform_permission_allowed(p_permission text)
returns boolean language sql immutable set search_path='pg_catalog','dabbir_private' as $$
  select coalesce(p_permission,'')=any(array[
    'manage_customers','manage_businesses','manage_orders','manage_bookings',
    'manage_products','manage_services','manage_support','manage_incidents',
    'manage_integrations','manage_employees','manage_system','manage_releases',
    'manage_ceo_commands','view_financials','manage_financial_operations'
  ]::text[])
$$;

create or replace function dabbir_private.platform_permissions_valid(p_permissions text[])
returns boolean language sql immutable set search_path='pg_catalog','dabbir_private' as $$
  select coalesce((select bool_and(dabbir_private.platform_permission_allowed(x)) from unnest(coalesce(p_permissions,'{}'::text[])) x),true)
$$;

create or replace function dabbir_private.platform_has_permission(p_user_id uuid,p_permission text)
returns boolean language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_role text; v_permissions text[];
begin
  if not dabbir_private.platform_permission_allowed(p_permission) then return false; end if;
  select role,permissions into v_role,v_permissions
  from public.dabbir_platform_admins
  where user_id=p_user_id and active=true and revoked_at is null and suspended_at is null;
  if not found then return false; end if;
  if v_role='ROOT_OWNER' then return true; end if;
  return v_role='OWNER_DELEGATE' and p_permission=any(coalesce(v_permissions,'{}'::text[]));
end;
$$;

create or replace function dabbir_private.platform_assert_permission(p_user_id uuid,p_permission text)
returns void language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin
  if not dabbir_private.platform_has_permission(p_user_id,p_permission) then
    raise exception 'DABBIR_PLATFORM_PERMISSION_REQUIRED:%',p_permission;
  end if;
end;
$$;

create or replace function dabbir_private.platform_assert_can_grant(p_actor uuid,p_permissions text[])
returns void language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_role text; v_actor_permissions text[];
begin
  if not dabbir_private.platform_permissions_valid(p_permissions) then raise exception 'DABBIR_INVALID_PLATFORM_PERMISSION'; end if;
  select role,permissions into v_role,v_actor_permissions
  from public.dabbir_platform_admins
  where user_id=p_actor and active=true and revoked_at is null and suspended_at is null;
  if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;
  if v_role='ROOT_OWNER' then return; end if;
  if v_role<>'OWNER_DELEGATE' or not dabbir_private.platform_has_permission(p_actor,'manage_employees') then
    raise exception 'DABBIR_PLATFORM_PERMISSION_REQUIRED:manage_employees';
  end if;
  if exists(select 1 from unnest(coalesce(p_permissions,'{}'::text[])) x where not (x=any(coalesce(v_actor_permissions,'{}'::text[])))) then
    raise exception 'DABBIR_PERMISSION_GRANT_EXCEEDS_ACTOR';
  end if;
end;
$$;

create or replace function dabbir_private.platform_assert_root(p_user_id uuid)
returns void language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin
  if not exists(select 1 from public.dabbir_platform_admins where user_id=p_user_id and role='ROOT_OWNER' and active=true and revoked_at is null and suspended_at is null) then
    raise exception 'DABBIR_ROOT_OWNER_REQUIRED';
  end if;
end;
$$;

create or replace function dabbir_private.guard_platform_root_owner()
returns trigger language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin
  if tg_op='INSERT' and new.role='ROOT_OWNER' then raise exception 'DABBIR_ROOT_OWNER_CREATION_FORBIDDEN'; end if;
  if tg_op='DELETE' and old.role='ROOT_OWNER' then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;
  if tg_op='UPDATE' then
    if old.role='ROOT_OWNER' and (new.role<>'ROOT_OWNER' or new.active is distinct from true or new.user_id is distinct from old.user_id or new.revoked_at is not null or new.suspended_at is not null) then
      raise exception 'DABBIR_ROOT_OWNER_PROTECTED';
    end if;
    if old.role<>'ROOT_OWNER' and new.role='ROOT_OWNER' then raise exception 'DABBIR_ROOT_OWNER_PROMOTION_FORBIDDEN'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
drop trigger if exists dabbir_platform_root_owner_guard on public.dabbir_platform_admins;
create trigger dabbir_platform_root_owner_guard before insert or update or delete on public.dabbir_platform_admins for each row execute function dabbir_private.guard_platform_root_owner();

-- Bind every live OTP challenge to one immutable platform identity. Historical consumed
-- rows can remain unbound; a new/unconsumed challenge cannot.
alter table public.dabbir_owner_otp_challenges
  add column if not exists actor_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists invitation_id uuid;
alter table public.dabbir_owner_otp_challenges drop constraint if exists dabbir_owner_otp_actor_bound_check;
alter table public.dabbir_owner_otp_challenges add constraint dabbir_owner_otp_actor_bound_check
  check(actor_user_id is not null or consumed_at is not null);
create index if not exists dabbir_owner_otp_challenges_actor_idx on public.dabbir_owner_otp_challenges(actor_user_id,created_at desc);

create table if not exists dabbir_private.platform_staff_invitations(
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  role text not null default 'OWNER_DELEGATE' check(role='OWNER_DELEGATE'),
  permissions text[] not null default '{}'::text[],
  preset text not null default 'custom',
  token_hash text not null unique,
  status text not null default 'PENDING' check(status in ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  delivery_status text not null default 'PREPARED' check(delivery_status in ('PREPARED','SENT','FAILED')),
  delivery_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_staff_invitations_email_idx on dabbir_private.platform_staff_invitations(lower(email),created_at desc);
create index if not exists platform_staff_invitations_target_idx on dabbir_private.platform_staff_invitations(target_user_id,created_at desc);

create table if not exists dabbir_private.platform_staff_audit(
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  target_user_id uuid,
  action text not null,
  reason text not null default '',
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  result text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create or replace function dabbir_private.platform_staff_audit_immutable()
returns trigger language plpgsql set search_path='pg_catalog','dabbir_private' as $$ begin raise exception 'DABBIR_PLATFORM_STAFF_AUDIT_IMMUTABLE'; end $$;
drop trigger if exists platform_staff_audit_immutable on dabbir_private.platform_staff_audit;
create trigger platform_staff_audit_immutable before update or delete on dabbir_private.platform_staff_audit for each row execute function dabbir_private.platform_staff_audit_immutable();

create or replace function public.dabbir_platform_login_identity_v1(p_login text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
declare v_login text:=lower(trim(coalesce(p_login,''))); v_result jsonb;
begin
  if v_login in ('barmanadmin','__root__') then
    select jsonb_build_object('user_id',a.user_id,'email',lower(u.email),'authority_role',a.role,'display_name',a.display_name,'permissions',a.permissions,'invitation_id',null)
    into v_result from public.dabbir_platform_admins a join auth.users u on u.id=a.user_id
    where a.role='ROOT_OWNER' and a.active=true and a.revoked_at is null and a.suspended_at is null limit 1;
  elsif position('@' in v_login)>1 then
    select jsonb_build_object('user_id',a.user_id,'email',lower(u.email),'authority_role',a.role,'display_name',a.display_name,'permissions',a.permissions,'invitation_id',null)
    into v_result from public.dabbir_platform_admins a join auth.users u on u.id=a.user_id
    where lower(u.email)=v_login and a.role='OWNER_DELEGATE' and a.active=true and a.revoked_at is null and a.suspended_at is null limit 1;
    if v_result is null then
      select jsonb_build_object('user_id',i.target_user_id,'email',lower(i.email),'authority_role','OWNER_DELEGATE','display_name',i.display_name,'permissions',i.permissions,'invitation_id',i.id)
      into v_result from dabbir_private.platform_staff_invitations i
      where lower(i.email)=v_login and i.status='PENDING' and i.revoked_at is null and i.expires_at>now()
      order by i.created_at desc limit 1;
    end if;
  end if;
  return coalesce(v_result,jsonb_build_object('found',false));
end;
$$;

create or replace function public.dabbir_platform_staff_accept_for_user_v1(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_hash text;
begin
  select token_hash into v_hash from dabbir_private.platform_staff_invitations
  where target_user_id=p_user_id and status='PENDING' and revoked_at is null and expires_at>now()
  order by created_at desc limit 1 for update;
  if v_hash is null then return jsonb_build_object('accepted',false,'reason','NO_PENDING_INVITATION'); end if;
  return public.dabbir_platform_staff_invite_accept_v1(v_hash);
end;
$$;

create or replace function public.dabbir_owner_session_issue_v1(p_actor_user_id uuid,p_token_hash text,p_expires_at timestamptz)
returns void language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin
  if p_actor_user_id is null or nullif(trim(p_token_hash),'') is null or p_expires_at<=now() then raise exception 'INVALID_OWNER_SESSION'; end if;
  if not exists(select 1 from public.dabbir_platform_admins where user_id=p_actor_user_id and role in ('ROOT_OWNER','OWNER_DELEGATE') and active=true and revoked_at is null and suspended_at is null) then
    raise exception 'DABBIR_PLATFORM_IDENTITY_REQUIRED';
  end if;
  delete from dabbir_private.owner_sessions where expires_at<=now() or revoked_at is not null;
  insert into dabbir_private.owner_sessions(actor_user_id,token_hash,expires_at,last_seen_at) values(p_actor_user_id,p_token_hash,p_expires_at,now());
end;
$$;

create or replace function public.dabbir_owner_session_verify_v1(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_session dabbir_private.owner_sessions%rowtype; v_admin public.dabbir_platform_admins%rowtype;
begin
  select * into v_session from dabbir_private.owner_sessions where token_hash=p_token_hash and revoked_at is null and expires_at>now() limit 1;
  if not found then return jsonb_build_object('authenticated',false); end if;
  select * into v_admin from public.dabbir_platform_admins where user_id=v_session.actor_user_id and active=true and revoked_at is null and suspended_at is null and role in ('ROOT_OWNER','OWNER_DELEGATE');
  if not found then
    update dabbir_private.owner_sessions set revoked_at=now() where id=v_session.id;
    return jsonb_build_object('authenticated',false);
  end if;
  update dabbir_private.owner_sessions set last_seen_at=now() where id=v_session.id;
  return jsonb_build_object(
    'authenticated',true,'role','platform_owner','authority_role',v_admin.role,
    'root_owner',v_admin.role='ROOT_OWNER','permissions',case when v_admin.role='ROOT_OWNER' then to_jsonb(array[
      'manage_customers','manage_businesses','manage_orders','manage_bookings','manage_products','manage_services','manage_support','manage_incidents','manage_integrations','manage_employees','manage_system','manage_releases','manage_ceo_commands','view_financials','manage_financial_operations'
    ]::text[]) else to_jsonb(v_admin.permissions) end,
    'display_name',v_admin.display_name,'actor_user_id',v_session.actor_user_id,'expires_at',v_session.expires_at
  );
end;
$$;

-- Permission-aware wrappers for CEO and incident controls. The legacy functions remain
-- internal implementation details and cannot be reached by anon/authenticated roles.
create or replace function public.dabbir_ceo_commands_authorized_v1(p_actor uuid,p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin perform dabbir_private.platform_assert_permission(p_actor,'manage_ceo_commands'); return to_jsonb(public.dabbir_ceo_commands_recent_v2(p_limit)); end;
$$;
create or replace function public.dabbir_ceo_command_create_authorized_v1(p_actor uuid,p_command_text text,p_priority text,p_objective text,p_acceptance_criteria text[],p_due_at timestamptz)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin perform dabbir_private.platform_assert_permission(p_actor,'manage_ceo_commands'); return to_jsonb(public.dabbir_ceo_command_create_v2(p_actor,p_command_text,p_priority,p_objective,p_acceptance_criteria,p_due_at)); end;
$$;
create or replace function public.dabbir_ceo_command_update_authorized_v1(p_actor uuid,p_command_id uuid,p_operation text,p_priority text,p_due_at timestamptz,p_guidance text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin perform dabbir_private.platform_assert_permission(p_actor,'manage_ceo_commands'); return to_jsonb(public.dabbir_ceo_command_update_v2(p_actor,p_command_id,p_operation,p_priority,p_due_at,p_guidance)); end;
$$;
create or replace function public.dabbir_platform_incident_create_authorized_v1(p_actor uuid,p_customer_no text,p_business_id uuid,p_category text,p_priority text,p_summary text,p_description text,p_assigned_queue text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin perform dabbir_private.platform_assert_permission(p_actor,'manage_incidents'); return to_jsonb(public.dabbir_platform_owner_incident_create_v1(p_customer_no,p_business_id,p_category,p_priority,p_summary,p_description,p_assigned_queue)); end;
$$;
create or replace function public.dabbir_platform_incident_update_authorized_v1(p_actor uuid,p_incident_id uuid,p_status text,p_priority text,p_assigned_queue text,p_root_cause text,p_resolution text,p_note text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin perform dabbir_private.platform_assert_permission(p_actor,'manage_incidents'); return to_jsonb(public.dabbir_platform_owner_incident_update_v1(p_incident_id,p_status,p_priority,p_assigned_queue,p_root_cause,p_resolution,p_note)); end;
$$;

-- Convert only the explicitly delegated legacy RPC families. OWNER_ONLY decisions and
-- recovery functions continue to call platform_assert_admin and remain ROOT_OWNER only.
do $$
declare r record; v_def text; v_permission text;
begin
  for r in
    select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname=any(array[
      'dabbir_platform_customer_search','dabbir_platform_customer_detail','dabbir_platform_set_account_access',
      'dabbir_platform_support_summary','dabbir_platform_support_create','dabbir_platform_support_add_note','dabbir_platform_support_set_status'
    ]::text[])
  loop
    v_permission:=case when r.proname like '%support%' then 'manage_support' else 'manage_customers' end;
    v_def:=pg_get_functiondef(r.oid);
    v_def:=replace(v_def,'PERFORM dabbir_private.platform_assert_admin(p_actor_user_id);','PERFORM dabbir_private.platform_assert_permission(p_actor_user_id,'''||v_permission||''');');
    v_def:=replace(v_def,'perform dabbir_private.platform_assert_admin(p_actor_user_id);','perform dabbir_private.platform_assert_permission(p_actor_user_id,'''||v_permission||''');');
    execute v_def;
  end loop;
end $$;

-- Keep sensitive decision/recovery authority fail-closed even if legacy helper behavior changes later.
do $$
declare r record; v_def text;
begin
  for r in
    select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname=any(array[
      'dabbir_owner_decisions_recent_v1','dabbir_owner_decision_resolve_v1','dabbir_platform_recovery_preview','dabbir_platform_recovery_open','dabbir_platform_recovery_apply'
    ]::text[])
  loop
    v_def:=pg_get_functiondef(r.oid);
    v_def:=replace(v_def,'PERFORM dabbir_private.platform_assert_admin(p_actor_user_id);','PERFORM dabbir_private.platform_assert_root(p_actor_user_id);');
    v_def:=replace(v_def,'perform dabbir_private.platform_assert_admin(p_actor_user_id);','perform dabbir_private.platform_assert_root(p_actor_user_id);');
    execute v_def;
  end loop;
end $$;

revoke all on dabbir_private.platform_staff_invitations from public,anon,authenticated;
revoke all on dabbir_private.platform_staff_audit from public,anon,authenticated;
revoke all on function public.dabbir_platform_login_identity_v1(text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_accept_for_user_v1(uuid) from public,anon,authenticated;
revoke all on function public.dabbir_owner_session_issue_v1(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_owner_session_verify_v1(text) from public,anon,authenticated;
revoke all on function public.dabbir_ceo_commands_authorized_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.dabbir_ceo_command_create_authorized_v1(uuid,text,text,text,text[],timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_ceo_command_update_authorized_v1(uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_incident_create_authorized_v1(uuid,text,uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_incident_update_authorized_v1(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_login_identity_v1(text) to service_role;
grant execute on function public.dabbir_platform_staff_accept_for_user_v1(uuid) to service_role;
grant execute on function public.dabbir_owner_session_issue_v1(uuid,text,timestamptz) to service_role;
grant execute on function public.dabbir_owner_session_verify_v1(text) to service_role;
grant execute on function public.dabbir_ceo_commands_authorized_v1(uuid,integer) to service_role;
grant execute on function public.dabbir_ceo_command_create_authorized_v1(uuid,text,text,text,text[],timestamptz) to service_role;
grant execute on function public.dabbir_ceo_command_update_authorized_v1(uuid,uuid,text,text,timestamptz,text) to service_role;
grant execute on function public.dabbir_platform_incident_create_authorized_v1(uuid,text,uuid,text,text,text,text,text) to service_role;
grant execute on function public.dabbir_platform_incident_update_authorized_v1(uuid,uuid,text,text,text,text,text,text) to service_role;
