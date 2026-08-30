-- DABBIR one-time employee invite, permanent membership and secure access.
-- Applied to production as Supabase migrations dabbir_employee_access_v5 through v7.

alter table public.dabbir_memberships
  add column if not exists status text not null default 'active',
  add column if not exists permissions text[] not null default '{}'::text[],
  add column if not exists display_name text,
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists removed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
alter table public.dabbir_memberships drop constraint if exists dabbir_memberships_role_check;
alter table public.dabbir_memberships add constraint dabbir_memberships_role_check check(role in ('owner','admin','manager','employee','staff','viewer','agent'));
alter table public.dabbir_memberships drop constraint if exists dabbir_memberships_status_check;
alter table public.dabbir_memberships add constraint dabbir_memberships_status_check check(status in ('active','suspended','removed'));
update public.dabbir_memberships set accepted_at=coalesce(accepted_at,created_at),updated_at=now() where accepted_at is null;
create index if not exists dabbir_memberships_business_status_idx on public.dabbir_memberships(business_id,status);
create index if not exists dabbir_memberships_user_status_idx on public.dabbir_memberships(user_id,status);

create table if not exists public.dabbir_employee_invitations(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'employee',
  permissions text[] not null default '{}'::text[],
  token_hash text not null unique,
  status text not null default 'pending',
  delivery_status text not null default 'prepared',
  delivery_attempts integer not null default 0,
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_employee_invitations_email_check check(email=lower(email) and length(email) between 3 and 254 and position('@' in email)>1),
  constraint dabbir_employee_invitations_role_check check(role in ('admin','manager','employee','staff','viewer','agent')),
  constraint dabbir_employee_invitations_status_check check(status in ('pending','accepted','expired','revoked')),
  constraint dabbir_employee_invitations_delivery_check check(delivery_status in ('prepared','sent','failed','bounced')),
  constraint dabbir_employee_invitations_token_hash_check check(token_hash ~ '^[0-9a-f]{64}$'),
  constraint dabbir_employee_invitations_expiry_check check(expires_at>created_at)
);
create unique index if not exists dabbir_employee_invitations_one_pending_idx on public.dabbir_employee_invitations(business_id,email) where status='pending';
create index if not exists dabbir_employee_invitations_business_status_idx on public.dabbir_employee_invitations(business_id,status,expires_at);

create table if not exists public.dabbir_access_audit(
  id bigint generated always as identity primary key,
  business_id uuid references public.dabbir_businesses(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  invitation_id uuid references public.dabbir_employee_invitations(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint dabbir_access_audit_action_check check(action in ('invitation_created','invitation_sent','invitation_accepted','invitation_expired','invitation_revoked','employee_login','employee_logout','employee_suspended','employee_reactivated','employee_removed','role_changed','permission_changed','session_revoked','mfa_changed'))
);
create index if not exists dabbir_access_audit_business_created_idx on public.dabbir_access_audit(business_id,created_at desc);
alter table public.dabbir_employee_invitations enable row level security;
alter table public.dabbir_employee_invitations force row level security;
alter table public.dabbir_access_audit enable row level security;
alter table public.dabbir_access_audit force row level security;
revoke all on public.dabbir_employee_invitations from anon;
revoke all on public.dabbir_access_audit from anon;
revoke truncate,references,trigger on public.dabbir_employee_invitations from authenticated;
revoke insert,update,delete,truncate,references,trigger on public.dabbir_access_audit from authenticated;
grant select on public.dabbir_employee_invitations,public.dabbir_access_audit to authenticated;

create or replace function dabbir_private.valid_permissions(p_permissions text[])
returns boolean language sql immutable set search_path=public,pg_temp as $$
 select coalesce(bool_and(p=any(array['view_business','manage_business','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','manage_billing','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])),true)
 from unnest(coalesce(p_permissions,'{}'::text[])) p;
$$;
revoke all on function dabbir_private.valid_permissions(text[]) from public,anon;
grant execute on function dabbir_private.valid_permissions(text[]) to authenticated,service_role;

create or replace function dabbir_private.has_permission(p_business_id uuid,p_permission text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select (select auth.uid()) is not null and exists(
 select 1 from public.dabbir_memberships m
 where m.business_id=p_business_id and m.user_id=(select auth.uid()) and m.status='active' and (
   (cardinality(m.permissions)>0 and p_permission=any(m.permissions)) or
   (cardinality(m.permissions)=0 and case m.role
    when 'owner' then p_permission=any(array['view_business','manage_business','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','manage_billing','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
    when 'admin' then p_permission=any(array['view_business','manage_business','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
    when 'manager' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
    when 'employee' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
    when 'staff' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
    when 'agent' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
    when 'viewer' then p_permission=any(array['view_business','view_integrations','view_customers','view_conversations','view_appointments','view_analytics','view_services','view_knowledge','view_quality'])
    else false end)
  )
);
$$;
revoke all on function dabbir_private.has_permission(uuid,text) from public,anon;
grant execute on function dabbir_private.has_permission(uuid,text) to authenticated,service_role;

create or replace function dabbir_private.can_manage_role(p_business_id uuid,p_target_role text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select (select auth.uid()) is not null and exists(
 select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=(select auth.uid()) and m.status='active' and
 ((m.role='owner' and p_target_role in ('admin','manager','employee','staff','viewer','agent')) or (m.role='admin' and p_target_role in ('manager','employee','staff','viewer','agent')))
);
$$;
revoke all on function dabbir_private.can_manage_role(uuid,text) from public,anon;
grant execute on function dabbir_private.can_manage_role(uuid,text) to authenticated,service_role;

create or replace function dabbir_private.can_grant_permissions(p_business_id uuid,p_permissions text[])
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select dabbir_private.valid_permissions(p_permissions) and not exists(select 1 from unnest(coalesce(p_permissions,'{}'::text[])) p where not dabbir_private.has_permission(p_business_id,p));
$$;
revoke all on function dabbir_private.can_grant_permissions(uuid,text[]) from public,anon;
grant execute on function dabbir_private.can_grant_permissions(uuid,text[]) to authenticated,service_role;

create or replace function dabbir_private.guard_designated_owner_membership()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and old.role='owner' and exists(select 1 from public.dabbir_businesses b where b.id=old.business_id and b.owner_id=old.user_id) then raise exception 'BUSINESS_OWNER_MEMBERSHIP_IMMUTABLE'; end if;
 if tg_op='UPDATE' and old.role='owner' and exists(select 1 from public.dabbir_businesses b where b.id=old.business_id and b.owner_id=old.user_id) and (new.business_id<>old.business_id or new.user_id<>old.user_id or new.role<>'owner' or new.status<>'active') then raise exception 'BUSINESS_OWNER_MEMBERSHIP_IMMUTABLE'; end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function dabbir_private.guard_designated_owner_membership() from public,anon,authenticated;

create or replace function dabbir_private.guard_membership_identity()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.business_id<>old.business_id or new.user_id<>old.user_id then raise exception 'MEMBERSHIP_IDENTITY_IMMUTABLE'; end if;
 new.updated_at:=now(); return new;
end;$$;
revoke all on function dabbir_private.guard_membership_identity() from public,anon;
drop trigger if exists dabbir_guard_membership_identity on public.dabbir_memberships;
create trigger dabbir_guard_membership_identity before update on public.dabbir_memberships for each row execute function dabbir_private.guard_membership_identity();

-- Active membership is the tenant gate. Non-owner activation is invitation-only; removal is soft-delete.
drop policy if exists dabbir_businesses_member_select on public.dabbir_businesses;
create policy dabbir_businesses_member_select on public.dabbir_businesses for select to authenticated using(exists(select 1 from public.dabbir_memberships m where m.business_id=dabbir_businesses.id and m.user_id=(select auth.uid()) and m.status='active'));
drop policy if exists dabbir_memberships_insert on public.dabbir_memberships;
drop policy if exists dabbir_memberships_team_insert on public.dabbir_memberships;
drop policy if exists dabbir_memberships_select on public.dabbir_memberships;
drop policy if exists dabbir_memberships_team_select on public.dabbir_memberships;
drop policy if exists dabbir_memberships_team_update on public.dabbir_memberships;
drop policy if exists dabbir_memberships_team_delete on public.dabbir_memberships;
create policy dabbir_memberships_select on public.dabbir_memberships for select to authenticated using(user_id=(select auth.uid()) or dabbir_private.has_permission(business_id,'manage_team'));
create policy dabbir_memberships_owner_insert on public.dabbir_memberships for insert to authenticated with check(user_id=(select auth.uid()) and role='owner' and status='active' and exists(select 1 from public.dabbir_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
create policy dabbir_memberships_team_update on public.dabbir_memberships for update to authenticated using(role<>'owner' and dabbir_private.can_manage_role(business_id,role)) with check(role<>'owner' and dabbir_private.can_manage_role(business_id,role));
revoke delete on public.dabbir_memberships from authenticated;
drop policy if exists dabbir_employee_invitations_team_select on public.dabbir_employee_invitations;
create policy dabbir_employee_invitations_team_select on public.dabbir_employee_invitations for select to authenticated using(dabbir_private.has_permission(business_id,'manage_team'));
drop policy if exists dabbir_access_audit_team_select on public.dabbir_access_audit;
create policy dabbir_access_audit_team_select on public.dabbir_access_audit for select to authenticated using(business_id is not null and dabbir_private.has_permission(business_id,'manage_team'));

create or replace function dabbir_private.dabbir_create_employee_invitation(p_business_id uuid,p_email text,p_display_name text,p_role text default 'employee',p_permissions text[] default '{}'::text[],p_token_hash text default null,p_expires_at timestamptz default(now()+interval '72 hours'))
returns table(invitation_id uuid,business_id uuid,email text,role text,status text,expires_at timestamptz)
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_email text:=lower(trim(coalesce(p_email,''))); v_inv public.dabbir_employee_invitations%rowtype; v_existing_status text;
begin
 if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_business_id is null then raise exception 'BUSINESS_REQUIRED'; end if;
 if length(v_email)<3 or length(v_email)>254 or position('@' in v_email)<=1 then raise exception 'INVALID_EMAIL'; end if;
 if p_role not in ('admin','manager','employee','staff','viewer','agent') then raise exception 'INVALID_ROLE'; end if;
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_TOKEN_HASH'; end if;
 if p_expires_at<=now() or p_expires_at>now()+interval '14 days' then raise exception 'INVALID_EXPIRY'; end if;
 if not dabbir_private.can_manage_role(p_business_id,p_role) then raise exception 'TEAM_MANAGEMENT_REQUIRED'; end if;
 if not dabbir_private.can_grant_permissions(p_business_id,coalesce(p_permissions,'{}'::text[])) then raise exception 'PERMISSION_GRANT_NOT_ALLOWED'; end if;
 update public.dabbir_employee_invitations set status='expired',updated_at=now() where business_id=p_business_id and email=v_email and status='pending' and expires_at<=now();
 if exists(select 1 from public.dabbir_employee_invitations i where i.business_id=p_business_id and i.email=v_email and i.status='pending') then raise exception 'INVITATION_ALREADY_PENDING'; end if;
 select m.status into v_existing_status from auth.users u join public.dabbir_memberships m on m.user_id=u.id where m.business_id=p_business_id and lower(u.email)=v_email limit 1;
 if v_existing_status in ('active','suspended') then raise exception 'EMPLOYEE_ALREADY_MEMBER'; end if;
 insert into public.dabbir_employee_invitations(business_id,email,display_name,role,permissions,token_hash,status,delivery_status,invited_by,expires_at)
 values(p_business_id,v_email,nullif(trim(coalesce(p_display_name,'')),''),p_role,coalesce(p_permissions,'{}'::text[]),p_token_hash,'pending','prepared',v_actor,p_expires_at) returning * into v_inv;
 insert into public.dabbir_access_audit(business_id,actor_user_id,invitation_id,action,metadata) values(p_business_id,v_actor,v_inv.id,'invitation_created',jsonb_build_object('role',p_role));
 return query select v_inv.id,v_inv.business_id,v_inv.email,v_inv.role,v_inv.status,v_inv.expires_at;
end;$$;
revoke all on function dabbir_private.dabbir_create_employee_invitation(uuid,text,text,text,text[],text,timestamptz) from public,anon;
grant execute on function dabbir_private.dabbir_create_employee_invitation(uuid,text,text,text,text[],text,timestamptz) to authenticated;

create or replace function dabbir_private.dabbir_accept_employee_invitation(p_token text)
returns table(business_id uuid,role text,status text)
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_user uuid:=auth.uid(); v_email text:=lower(coalesce(auth.jwt()->>'email','')); v_hash text; v_inv public.dabbir_employee_invitations%rowtype; v_existing public.dabbir_memberships%rowtype;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 if v_email='' then raise exception 'VERIFIED_EMAIL_REQUIRED'; end if;
 if p_token is null or length(p_token)<32 or length(p_token)>256 then raise exception 'INVALID_INVITATION'; end if;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 select * into v_inv from public.dabbir_employee_invitations where token_hash=v_hash for update;
 if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
 if v_inv.status<>'pending' then raise exception 'INVITATION_NOT_PENDING'; end if;
 if v_inv.expires_at<=now() then raise exception 'INVITATION_EXPIRED'; end if;
 if lower(v_inv.email)<>v_email then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;
 if not exists(select 1 from public.dabbir_memberships m where m.business_id=v_inv.business_id and m.user_id=v_inv.invited_by and m.status='active' and ((m.role='owner' and v_inv.role in ('admin','manager','employee','staff','viewer','agent')) or (m.role='admin' and v_inv.role in ('manager','employee','staff','viewer','agent')))) then raise exception 'INVITER_NO_LONGER_AUTHORIZED'; end if;
 select * into v_existing from public.dabbir_memberships where business_id=v_inv.business_id and user_id=v_user for update;
 if found and v_existing.status in ('active','suspended') then raise exception 'MEMBERSHIP_ALREADY_EXISTS'; end if;
 if found and v_existing.status='removed' then
  update public.dabbir_memberships set role=v_inv.role,permissions=v_inv.permissions,display_name=v_inv.display_name,status='active',invited_by=v_inv.invited_by,accepted_at=now(),suspended_at=null,removed_at=null,updated_at=now() where business_id=v_inv.business_id and user_id=v_user;
 else
  insert into public.dabbir_memberships(business_id,user_id,role,status,permissions,display_name,invited_by,accepted_at) values(v_inv.business_id,v_user,v_inv.role,'active',v_inv.permissions,v_inv.display_name,v_inv.invited_by,now());
 end if;
 update public.dabbir_employee_invitations set status='accepted',accepted_by=v_user,accepted_at=now(),updated_at=now() where id=v_inv.id;
 update public.dabbir_employee_invitations set status='revoked',revoked_at=now(),updated_at=now() where business_id=v_inv.business_id and email=v_inv.email and status='pending' and id<>v_inv.id;
 insert into public.dabbir_access_audit(business_id,actor_user_id,target_user_id,invitation_id,action,metadata) values(v_inv.business_id,v_user,v_user,v_inv.id,'invitation_accepted',jsonb_build_object('role',v_inv.role));
 return query select v_inv.business_id,v_inv.role,'active'::text;
end;$$;
revoke all on function dabbir_private.dabbir_accept_employee_invitation(text) from public,anon;
grant execute on function dabbir_private.dabbir_accept_employee_invitation(text) to authenticated;

create or replace function dabbir_private.dabbir_update_employee_access(p_business_id uuid,p_user_id uuid,p_role text,p_permissions text[] default '{}'::text[])
returns table(user_id uuid,role text,status text,permissions text[])
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_old public.dabbir_memberships%rowtype; v_new public.dabbir_memberships%rowtype;
begin
 if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into v_old from public.dabbir_memberships where business_id=p_business_id and user_id=p_user_id for update;
 if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
 if v_old.role='owner' or p_role='owner' then raise exception 'OWNER_IMMUTABLE'; end if;
 if not dabbir_private.can_manage_role(p_business_id,v_old.role) or not dabbir_private.can_manage_role(p_business_id,p_role) then raise exception 'TEAM_MANAGEMENT_REQUIRED'; end if;
 if p_role not in ('admin','manager','employee','staff','viewer','agent') then raise exception 'INVALID_ROLE'; end if;
 if not dabbir_private.can_grant_permissions(p_business_id,coalesce(p_permissions,'{}'::text[])) then raise exception 'PERMISSION_GRANT_NOT_ALLOWED'; end if;
 update public.dabbir_memberships set role=p_role,permissions=coalesce(p_permissions,'{}'::text[]),updated_at=now() where business_id=p_business_id and user_id=p_user_id returning * into v_new;
 if v_old.role<>v_new.role then insert into public.dabbir_access_audit(business_id,actor_user_id,target_user_id,action,metadata) values(p_business_id,v_actor,p_user_id,'role_changed',jsonb_build_object('from',v_old.role,'to',v_new.role)); end if;
 if v_old.permissions is distinct from v_new.permissions then insert into public.dabbir_access_audit(business_id,actor_user_id,target_user_id,action,metadata) values(p_business_id,v_actor,p_user_id,'permission_changed',jsonb_build_object('count',cardinality(v_new.permissions))); end if;
 return query select v_new.user_id,v_new.role,v_new.status,v_new.permissions;
end;$$;
revoke all on function dabbir_private.dabbir_update_employee_access(uuid,uuid,text,text[]) from public,anon;
grant execute on function dabbir_private.dabbir_update_employee_access(uuid,uuid,text,text[]) to authenticated;

create or replace function dabbir_private.dabbir_set_employee_status(p_business_id uuid,p_user_id uuid,p_status text)
returns table(user_id uuid,role text,status text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_old public.dabbir_memberships%rowtype; v_new public.dabbir_memberships%rowtype; v_email text; v_action text;
begin
 if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_status not in ('active','suspended','removed') then raise exception 'INVALID_STATUS'; end if;
 select * into v_old from public.dabbir_memberships where business_id=p_business_id and user_id=p_user_id for update;
 if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
 if v_old.role='owner' then raise exception 'OWNER_IMMUTABLE'; end if;
 if not dabbir_private.can_manage_role(p_business_id,v_old.role) then raise exception 'TEAM_MANAGEMENT_REQUIRED'; end if;
 if v_old.status='removed' and p_status='active' then raise exception 'NEW_INVITATION_REQUIRED'; end if;
 update public.dabbir_memberships set status=p_status,suspended_at=case when p_status='suspended' then now() else null end,removed_at=case when p_status='removed' then now() else null end,updated_at=now() where business_id=p_business_id and user_id=p_user_id returning * into v_new;
 if p_status='suspended' then v_action:='employee_suspended'; elsif p_status='removed' then v_action:='employee_removed'; elsif v_old.status='suspended' and p_status='active' then v_action:='employee_reactivated'; else v_action:=null; end if;
 if p_status='removed' then select lower(email) into v_email from auth.users where id=p_user_id; if v_email is not null then update public.dabbir_employee_invitations set status='revoked',revoked_at=now(),updated_at=now() where business_id=p_business_id and email=v_email and status='pending'; end if; end if;
 if v_action is not null then insert into public.dabbir_access_audit(business_id,actor_user_id,target_user_id,action,metadata) values(p_business_id,v_actor,p_user_id,v_action,jsonb_build_object('from',v_old.status,'to',v_new.status)); end if;
 return query select v_new.user_id,v_new.role,v_new.status;
end;$$;
revoke all on function dabbir_private.dabbir_set_employee_status(uuid,uuid,text) from public,anon;
grant execute on function dabbir_private.dabbir_set_employee_status(uuid,uuid,text) to authenticated;

create or replace function dabbir_private.dabbir_list_team(p_business_id uuid)
returns table(user_id uuid,email text,display_name text,role text,status text,permissions text[],accepted_at timestamptz,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select m.user_id,u.email,m.display_name,m.role,m.status,m.permissions,m.accepted_at,m.created_at from public.dabbir_memberships m join auth.users u on u.id=m.user_id where m.business_id=p_business_id and dabbir_private.has_permission(p_business_id,'manage_team') order by case m.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end,m.created_at;
$$;
revoke all on function dabbir_private.dabbir_list_team(uuid) from public,anon;
grant execute on function dabbir_private.dabbir_list_team(uuid) to authenticated;

-- Public RPCs are SECURITY INVOKER wrappers; privileged implementations remain in dabbir_private.
create or replace function public.dabbir_create_employee_invitation(p_business_id uuid,p_email text,p_display_name text,p_role text default 'employee',p_permissions text[] default '{}'::text[],p_token_hash text default null,p_expires_at timestamptz default(now()+interval '72 hours'))
returns table(invitation_id uuid,business_id uuid,email text,role text,status text,expires_at timestamptz)
language sql security invoker set search_path=public,dabbir_private,pg_temp as $$ select * from dabbir_private.dabbir_create_employee_invitation(p_business_id,p_email,p_display_name,p_role,p_permissions,p_token_hash,p_expires_at); $$;
create or replace function public.dabbir_accept_employee_invitation(p_token text)
returns table(business_id uuid,role text,status text)
language sql security invoker set search_path=public,dabbir_private,pg_temp as $$ select * from dabbir_private.dabbir_accept_employee_invitation(p_token); $$;
create or replace function public.dabbir_update_employee_access(p_business_id uuid,p_user_id uuid,p_role text,p_permissions text[] default '{}'::text[])
returns table(user_id uuid,role text,status text,permissions text[])
language sql security invoker set search_path=public,dabbir_private,pg_temp as $$ select * from dabbir_private.dabbir_update_employee_access(p_business_id,p_user_id,p_role,p_permissions); $$;
create or replace function public.dabbir_set_employee_status(p_business_id uuid,p_user_id uuid,p_status text)
returns table(user_id uuid,role text,status text)
language sql security invoker set search_path=public,dabbir_private,pg_temp as $$ select * from dabbir_private.dabbir_set_employee_status(p_business_id,p_user_id,p_status); $$;
create or replace function public.dabbir_list_team(p_business_id uuid)
returns table(user_id uuid,email text,display_name text,role text,status text,permissions text[],accepted_at timestamptz,created_at timestamptz)
language sql stable security invoker set search_path=public,dabbir_private,pg_temp as $$ select * from dabbir_private.dabbir_list_team(p_business_id); $$;
revoke all on function public.dabbir_create_employee_invitation(uuid,text,text,text,text[],text,timestamptz) from public,anon;
revoke all on function public.dabbir_accept_employee_invitation(text) from public,anon;
revoke all on function public.dabbir_update_employee_access(uuid,uuid,text,text[]) from public,anon;
revoke all on function public.dabbir_set_employee_status(uuid,uuid,text) from public,anon;
revoke all on function public.dabbir_list_team(uuid) from public,anon;
grant execute on function public.dabbir_create_employee_invitation(uuid,text,text,text,text[],text,timestamptz) to authenticated;
grant execute on function public.dabbir_accept_employee_invitation(text) to authenticated;
grant execute on function public.dabbir_update_employee_access(uuid,uuid,text,text[]) to authenticated;
grant execute on function public.dabbir_set_employee_status(uuid,uuid,text) to authenticated;
grant execute on function public.dabbir_list_team(uuid) to authenticated;

create or replace function public.dabbir_create_business(p_name text,p_business_type text,p_locale text default 'ar-AE')
returns table(business_id uuid,business_slug text)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_id uuid:=gen_random_uuid(); v_slug text;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'BUSINESS_NAME_REQUIRED'; end if;
 if p_business_type not in ('store','laundry','car_wash','clinic','creator','salon','real_estate','services','other') then raise exception 'UNSUPPORTED_BUSINESS_TYPE'; end if;
 v_slug:='dabbir-'||substr(replace(v_id::text,'-',''),1,16);
 insert into public.dabbir_businesses(id,slug,name,business_type,owner_id,locale,demo_mode) values(v_id,v_slug,left(trim(p_name),120),p_business_type,v_user,coalesce(nullif(trim(p_locale),''),'ar-AE'),false);
 insert into public.dabbir_memberships(business_id,user_id,role,status,accepted_at) values(v_id,v_user,'owner','active',now());
 return query select v_id,v_slug;
end;$$;
