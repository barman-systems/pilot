begin;

alter table public.dabbir_platform_admins
  add column if not exists permissions text[] not null default '{}'::text[],
  add column if not exists display_name text,
  add column if not exists added_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists suspended_at timestamptz,
  add column if not exists revoked_at timestamptz;

alter table public.dabbir_platform_admins drop constraint if exists dabbir_platform_admins_role_check;
update public.dabbir_platform_admins set role='ROOT_OWNER',permissions='{}'::text[],updated_at=now()
where role='platform_owner' and active=true;
update public.dabbir_platform_admins set role='OWNER_DELEGATE',permissions=case when role='support_admin' then array['manage_customers','manage_support','manage_incidents']::text[] else permissions end,updated_at=now()
where role in ('platform_owner','support_admin');
alter table public.dabbir_platform_admins add constraint dabbir_platform_admins_role_check check(role in ('ROOT_OWNER','OWNER_DELEGATE'));
alter table public.dabbir_platform_admins alter column role set default 'OWNER_DELEGATE';
create unique index if not exists dabbir_platform_single_root_owner_uq on public.dabbir_platform_admins((role)) where role='ROOT_OWNER';
create index if not exists dabbir_platform_admins_added_by_idx on public.dabbir_platform_admins(added_by);

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

alter table public.dabbir_platform_admins drop constraint if exists dabbir_platform_admins_permissions_check;
alter table public.dabbir_platform_admins add constraint dabbir_platform_admins_permissions_check check(dabbir_private.platform_permissions_valid(permissions));

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

create or replace function dabbir_private.platform_identity(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v public.dabbir_platform_admins%rowtype;
begin
  select * into v from public.dabbir_platform_admins where user_id=p_user_id and active=true and revoked_at is null and suspended_at is null limit 1;
  if not found then return jsonb_build_object('active',false); end if;
  return jsonb_build_object('active',true,'user_id',v.user_id,'role',v.role,'root_owner',v.role='ROOT_OWNER','permissions',case when v.role='ROOT_OWNER' then to_jsonb(array[
    'manage_customers','manage_businesses','manage_orders','manage_bookings','manage_products','manage_services','manage_support','manage_incidents','manage_integrations','manage_employees','manage_system','manage_releases','manage_ceo_commands','view_financials','manage_financial_operations'
  ]::text[]) else to_jsonb(v.permissions) end);
end;
$$;

create or replace function dabbir_private.platform_has_permission(p_user_id uuid,p_permission text)
returns boolean language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_role text; v_permissions text[];
begin
  if not dabbir_private.platform_permission_allowed(p_permission) then return false; end if;
  select role,permissions into v_role,v_permissions from public.dabbir_platform_admins where user_id=p_user_id and active=true and revoked_at is null and suspended_at is null;
  if not found then return false; end if;
  if v_role='ROOT_OWNER' then return true; end if;
  return v_role='OWNER_DELEGATE' and p_permission=any(coalesce(v_permissions,'{}'::text[]));
end;
$$;

create or replace function dabbir_private.platform_assert_permission(p_user_id uuid,p_permission text)
returns void language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin
  if not dabbir_private.platform_has_permission(p_user_id,p_permission) then raise exception 'DABBIR_PLATFORM_PERMISSION_REQUIRED:%',p_permission; end if;
end;
$$;

create or replace function dabbir_private.platform_assert_admin(p_user_id uuid)
returns text language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_role text;
begin
  select role into v_role from public.dabbir_platform_admins where user_id=p_user_id and active=true and revoked_at is null and suspended_at is null;
  if v_role is distinct from 'ROOT_OWNER' then raise exception 'DABBIR_ROOT_OWNER_REQUIRED'; end if;
  return v_role;
end;
$$;

create or replace function public.dabbir_owner_session_issue_v1(p_actor_user_id uuid,p_token_hash text,p_expires_at timestamptz)
returns void language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin
  if p_actor_user_id is null or nullif(trim(p_token_hash),'') is null or p_expires_at<=now() then raise exception 'INVALID_OWNER_SESSION'; end if;
  if not exists(select 1 from public.dabbir_platform_admins where user_id=p_actor_user_id and active=true and role='ROOT_OWNER' and revoked_at is null and suspended_at is null) then raise exception 'ROOT_OWNER_REQUIRED'; end if;
  delete from dabbir_private.owner_sessions where expires_at<=now() or revoked_at is not null;
  insert into dabbir_private.owner_sessions(actor_user_id,token_hash,expires_at,last_seen_at) values(p_actor_user_id,p_token_hash,p_expires_at,now());
end;
$$;

create or replace function public.dabbir_owner_session_verify_v1(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_session dabbir_private.owner_sessions%rowtype;
begin
  select * into v_session from dabbir_private.owner_sessions where token_hash=p_token_hash and revoked_at is null and expires_at>now() limit 1;
  if not found then return jsonb_build_object('authenticated',false); end if;
  if not exists(select 1 from public.dabbir_platform_admins where user_id=v_session.actor_user_id and active=true and role='ROOT_OWNER' and revoked_at is null and suspended_at is null) then
    update dabbir_private.owner_sessions set revoked_at=now() where id=v_session.id;
    return jsonb_build_object('authenticated',false);
  end if;
  update dabbir_private.owner_sessions set last_seen_at=now() where id=v_session.id;
  return jsonb_build_object('authenticated',true,'role','platform_owner','actor_user_id',v_session.actor_user_id,'expires_at',v_session.expires_at);
end;
$$;

revoke all on function dabbir_private.platform_permission_allowed(text) from public,anon,authenticated;
revoke all on function dabbir_private.platform_permissions_valid(text[]) from public,anon,authenticated;
revoke all on function dabbir_private.guard_platform_root_owner() from public,anon,authenticated;
revoke all on function dabbir_private.platform_identity(uuid) from public,anon,authenticated;
revoke all on function dabbir_private.platform_has_permission(uuid,text) from public,anon,authenticated;
revoke all on function dabbir_private.platform_assert_permission(uuid,text) from public,anon,authenticated;
revoke all on function dabbir_private.platform_assert_admin(uuid) from public,anon,authenticated;
revoke all on function public.dabbir_owner_session_issue_v1(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_owner_session_verify_v1(text) from public,anon,authenticated;
grant execute on function dabbir_private.platform_permission_allowed(text) to service_role;
grant execute on function dabbir_private.platform_permissions_valid(text[]) to service_role;
grant execute on function dabbir_private.platform_identity(uuid) to service_role;
grant execute on function dabbir_private.platform_has_permission(uuid,text) to service_role;
grant execute on function dabbir_private.platform_assert_permission(uuid,text) to service_role;
grant execute on function dabbir_private.platform_assert_admin(uuid) to service_role;
grant execute on function public.dabbir_owner_session_issue_v1(uuid,text,timestamptz) to service_role;
grant execute on function public.dabbir_owner_session_verify_v1(text) to service_role;

alter table public.dabbir_followups alter column status set default 'CANDIDATE';
create index if not exists dabbir_ai_action_ledger_conversation_fk_idx on public.dabbir_ai_action_ledger(conversation_id);
create index if not exists dabbir_ai_conversation_state_conversation_idx on public.dabbir_ai_conversation_state(conversation_id);

commit;
