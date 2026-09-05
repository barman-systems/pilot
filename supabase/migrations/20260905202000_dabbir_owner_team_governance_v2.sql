-- DABBIR Owner Command Center Phase 2 / P1
-- Keep authority role (ROOT_OWNER/OWNER_DELEGATE) separate from operational role_code.

alter table public.dabbir_platform_admins
  add column if not exists role_code text not null default 'CUSTOM',
  add column if not exists granular_permissions text[] not null default '{}'::text[];

alter table public.dabbir_platform_admins drop constraint if exists dabbir_platform_admins_role_code_check;
alter table public.dabbir_platform_admins add constraint dabbir_platform_admins_role_code_check
check(role_code in ('OWNER','EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR','CUSTOM'));
update public.dabbir_platform_admins set role_code='OWNER' where role='ROOT_OWNER';

alter table dabbir_private.platform_staff_invitations
  add column if not exists role_code text not null default 'CUSTOM',
  add column if not exists granular_permissions text[] not null default '{}'::text[],
  add column if not exists access_scope jsonb not null default '{"type":"ALL_BUSINESSES"}'::jsonb,
  add column if not exists access_expires_at timestamptz,
  add column if not exists mfa_required boolean not null default false,
  add column if not exists approval_limit_aed numeric(14,2);

alter table dabbir_private.platform_staff_invitations drop constraint if exists platform_staff_invitations_role_code_check;
alter table dabbir_private.platform_staff_invitations add constraint platform_staff_invitations_role_code_check
check(role_code in ('EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR','CUSTOM'));

truncate table dabbir_private.platform_role_permissions;
insert into dabbir_private.platform_role_permissions(role_id,permission_code)
select r.id,p.code from dabbir_private.platform_roles r join dabbir_private.platform_permissions p on (
 (r.code='EXECUTIVE_ADMIN' and p.owner_only=false) or
 (r.code='OPERATIONS_MANAGER' and p.code in ('businesses.view','businesses.edit','businesses.suspend','customers.view','customers.edit','orders.view','orders.edit','bookings.view','bookings.edit','bookings.cancel','support.view','support.assign','tasks.view','tasks.create','tasks.assign','tasks.complete','approvals.request','reports.view')) or
 (r.code='CUSTOMER_SUPPORT' and p.code in ('businesses.view','customers.view','customers.edit','support.view','support.reply','support.assign','support.close','tasks.view','tasks.create','tasks.complete')) or
 (r.code='FINANCE' and p.code in ('businesses.view','customers.view','orders.view','payments.view','payments.refund','subscriptions.view','subscriptions.modify','subscriptions.cancel','reports.view','reports.export','approvals.request','tasks.view')) or
 (r.code='GROWTH_SALES' and p.code in ('businesses.view','customers.view','subscriptions.view','reports.view','tasks.view','tasks.create')) or
 (r.code='TECHNICAL_ADMIN' and p.code in ('businesses.view','system.view','security.view','audit.view','reports.view','approvals.request','tasks.view','tasks.create','tasks.assign','tasks.complete')) or
 (r.code='VIEWER_AUDITOR' and p.code in ('businesses.view','customers.view','orders.view','bookings.view','payments.view','subscriptions.view','support.view','system.view','security.view','audit.view','reports.view','tasks.view'))
);

create or replace function dabbir_private.platform_role_permissions_v1(p_role_code text)
returns text[] language sql stable set search_path='pg_catalog','dabbir_private' as $$
  select coalesce(array_agg(rp.permission_code order by rp.permission_code),'{}'::text[])
  from dabbir_private.platform_roles r left join dabbir_private.platform_role_permissions rp on rp.role_id=r.id
  where r.code=upper(trim(coalesce(p_role_code,'')))
$$;

create or replace function dabbir_private.platform_granular_permissions_valid(p_permissions text[])
returns boolean language sql stable set search_path='pg_catalog','dabbir_private' as $$
 select coalesce((select bool_and(exists(select 1 from dabbir_private.platform_permissions p where p.code=x and p.owner_only=false)) from unnest(coalesce(p_permissions,'{}'::text[])) x),true)
$$;

create or replace function dabbir_private.platform_assert_can_grant_granular(p_actor uuid,p_permissions text[])
returns void language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_role text; v_actor_permissions text[];
begin
 if not dabbir_private.platform_granular_permissions_valid(p_permissions) then raise exception 'DABBIR_INVALID_GRANULAR_PERMISSION'; end if;
 select role,granular_permissions into v_role,v_actor_permissions from public.dabbir_platform_admins
 where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
 if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;
 if v_role='ROOT_OWNER' then return; end if;
 if not dabbir_private.platform_has_permission(p_actor,'manage_employees') then raise exception 'DABBIR_PLATFORM_PERMISSION_REQUIRED:manage_employees'; end if;
 if exists(select 1 from unnest(coalesce(p_permissions,'{}'::text[])) x where not (x=any(coalesce(v_actor_permissions,'{}'::text[])))) then raise exception 'DABBIR_GRANULAR_GRANT_EXCEEDS_ACTOR'; end if;
end;
$$;

create or replace function dabbir_private.platform_effective_capability(p_user_id uuid,p_code text)
returns boolean language plpgsql stable set search_path='pg_catalog','public','dabbir_private' as $$
declare v_admin public.dabbir_platform_admins%rowtype; v_owner_only boolean; v_legacy text;
begin
 select * into v_admin from public.dabbir_platform_admins where user_id=p_user_id and dabbir_private.platform_admin_is_active(p_user_id);
 if not found then return false; end if;
 if v_admin.role='ROOT_OWNER' then return true; end if;
 select owner_only into v_owner_only from dabbir_private.platform_permissions where code=p_code;
 if not found or v_owner_only then return false; end if;
 if cardinality(coalesce(v_admin.granular_permissions,'{}'::text[]))>0 then return p_code=any(v_admin.granular_permissions); end if;
 v_legacy:=case split_part(p_code,'.',1)
   when 'businesses' then 'manage_businesses' when 'customers' then 'manage_customers' when 'orders' then 'manage_orders'
   when 'bookings' then 'manage_bookings' when 'support' then 'manage_support' when 'team' then 'manage_employees'
   when 'system' then 'manage_system' when 'security' then 'manage_system' when 'audit' then 'manage_system'
   when 'reports' then case when p_code like 'reports.export%' then 'manage_system' else 'view_financials' end
   when 'payments' then case when p_code='payments.view' then 'view_financials' else 'manage_financial_operations' end
   when 'subscriptions' then case when p_code='subscriptions.view' then 'view_financials' else 'manage_financial_operations' end
   when 'approvals' then 'manage_system' when 'tasks' then 'manage_employees' else null end;
 return v_legacy is not null and v_legacy=any(coalesce(v_admin.permissions,'{}'::text[]));
end;
$$;

create or replace function public.dabbir_platform_staff_invite_create_v2(
 p_actor uuid,p_target_user_id uuid,p_email text,p_display_name text,p_permissions text[],p_preset text,p_token_hash text,p_expires_at timestamptz,
 p_role_code text,p_granular_permissions text[],p_access_scope jsonb,p_access_expires_at timestamptz,p_mfa_required boolean,p_approval_limit_aed numeric
) returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
declare v_id uuid; v_role_code text:=upper(trim(coalesce(p_role_code,'CUSTOM'))); v_granular text[]:=coalesce(p_granular_permissions,'{}'::text[]); v_scope jsonb:=coalesce(p_access_scope,'{"type":"ALL_BUSINESSES"}'::jsonb);
begin
 perform dabbir_private.platform_assert_permission(p_actor,'manage_employees');
 perform dabbir_private.platform_assert_can_grant(p_actor,p_permissions);
 perform dabbir_private.platform_assert_can_grant_granular(p_actor,v_granular);
 if v_role_code not in ('EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR','CUSTOM') then raise exception 'DABBIR_ROLE_CODE_INVALID'; end if;
 if not ((v_scope ? 'type') and (v_scope->>'type') in ('ALL_BUSINESSES','ASSIGNED_BUSINESSES_ONLY','SPECIFIC_BUSINESS','SPECIFIC_REGION','OWN_TASKS_ONLY')) then raise exception 'DABBIR_ACCESS_SCOPE_INVALID'; end if;
 if p_actor=p_target_user_id then raise exception 'DABBIR_SELF_INVITE_FORBIDDEN'; end if;
 if p_expires_at<=now() then raise exception 'DABBIR_INVITE_EXPIRY_INVALID'; end if;
 if p_access_expires_at is not null and p_access_expires_at<=now() then raise exception 'DABBIR_ACCESS_EXPIRY_INVALID'; end if;
 if p_approval_limit_aed is not null and p_approval_limit_aed<0 then raise exception 'DABBIR_APPROVAL_LIMIT_INVALID'; end if;
 if not exists(select 1 from auth.users where id=p_target_user_id and lower(email)=lower(trim(p_email))) then raise exception 'DABBIR_INVITE_USER_EMAIL_MISMATCH'; end if;
 if exists(select 1 from public.dabbir_platform_admins where user_id=p_target_user_id and role='ROOT_OWNER') then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;
 update dabbir_private.platform_staff_invitations set status='REVOKED',revoked_at=now(),updated_at=now() where lower(email)=lower(trim(p_email)) and status='PENDING';
 insert into dabbir_private.platform_staff_invitations(email,display_name,target_user_id,permissions,preset,token_hash,invited_by,expires_at,role_code,granular_permissions,access_scope,access_expires_at,mfa_required,approval_limit_aed)
 values(lower(trim(p_email)),nullif(trim(p_display_name),''),p_target_user_id,coalesce(p_permissions,'{}'::text[]),coalesce(nullif(trim(p_preset),''),'custom'),p_token_hash,p_actor,p_expires_at,v_role_code,v_granular,v_scope,p_access_expires_at,coalesce(p_mfa_required,false),p_approval_limit_aed) returning id into v_id;
 insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,after_state,result,metadata)
 values(p_actor,p_target_user_id,'EMPLOYEE_INVITED_V2','governed platform employee invitation',jsonb_build_object('authority_role','OWNER_DELEGATE','role_code',v_role_code,'permissions',p_permissions,'granular_permissions',v_granular,'access_scope',v_scope,'access_expires_at',p_access_expires_at,'mfa_required',coalesce(p_mfa_required,false),'approval_limit_aed',p_approval_limit_aed),'SUCCESS',jsonb_build_object('invitation_id',v_id));
 return jsonb_build_object('id',v_id,'status','PENDING','expires_at',p_expires_at,'access_expires_at',p_access_expires_at,'role_code',v_role_code);
end;
$$;

create or replace function public.dabbir_platform_staff_invite_accept_v1(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_inv dabbir_private.platform_staff_invitations%rowtype;
begin
 select * into v_inv from dabbir_private.platform_staff_invitations where token_hash=p_token_hash for update;
 if not found or v_inv.status<>'PENDING' or v_inv.revoked_at is not null or v_inv.accepted_at is not null then raise exception 'DABBIR_INVITATION_INVALID'; end if;
 if v_inv.expires_at<=now() then update dabbir_private.platform_staff_invitations set status='EXPIRED',updated_at=now() where id=v_inv.id; raise exception 'DABBIR_INVITATION_EXPIRED'; end if;
 if v_inv.access_expires_at is not null and v_inv.access_expires_at<=now() then raise exception 'DABBIR_ACCESS_EXPIRY_INVALID'; end if;
 if exists(select 1 from public.dabbir_platform_admins where user_id=v_inv.target_user_id and role='ROOT_OWNER') then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;
 insert into public.dabbir_platform_admins(user_id,role,active,permissions,display_name,added_by,updated_at,role_code,granular_permissions,access_scope,access_expires_at,mfa_required,approval_limit_aed)
 values(v_inv.target_user_id,'OWNER_DELEGATE',true,v_inv.permissions,v_inv.display_name,v_inv.invited_by,now(),v_inv.role_code,v_inv.granular_permissions,v_inv.access_scope,v_inv.access_expires_at,v_inv.mfa_required,v_inv.approval_limit_aed)
 on conflict(user_id) do update set role='OWNER_DELEGATE',active=true,permissions=excluded.permissions,display_name=excluded.display_name,added_by=excluded.added_by,updated_at=now(),suspended_at=null,revoked_at=null,role_code=excluded.role_code,granular_permissions=excluded.granular_permissions,access_scope=excluded.access_scope,access_expires_at=excluded.access_expires_at,mfa_required=excluded.mfa_required,approval_limit_aed=excluded.approval_limit_aed;
 update dabbir_private.platform_staff_invitations set status='ACCEPTED',accepted_at=now(),updated_at=now() where id=v_inv.id;
 insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,after_state,result,metadata) values(v_inv.invited_by,v_inv.target_user_id,'EMPLOYEE_INVITE_ACCEPTED','single-use governed platform invitation',jsonb_build_object('authority_role','OWNER_DELEGATE','role_code',v_inv.role_code,'granular_permissions',v_inv.granular_permissions,'access_scope',v_inv.access_scope,'access_expires_at',v_inv.access_expires_at,'mfa_required',v_inv.mfa_required,'approval_limit_aed',v_inv.approval_limit_aed),'SUCCESS',jsonb_build_object('invitation_id',v_inv.id));
 return jsonb_build_object('accepted',true,'user_id',v_inv.target_user_id,'role','OWNER_DELEGATE','role_code',v_inv.role_code);
end;
$$;

create or replace function public.dabbir_platform_staff_list_v2(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
declare v_staff jsonb; v_invites jsonb;
begin
 perform dabbir_private.platform_assert_permission(p_actor,'manage_employees');
 select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'email',u.email,'display_name',a.display_name,'role',a.role,'role_code',a.role_code,'permissions',case when a.role='ROOT_OWNER' then '[]'::jsonb else to_jsonb(a.permissions) end,'granular_permissions',case when a.role='ROOT_OWNER' then '[]'::jsonb else to_jsonb(a.granular_permissions) end,'access_scope',a.access_scope,'access_expires_at',a.access_expires_at,'mfa_required',a.mfa_required,'approval_limit_aed',a.approval_limit_aed,'active',a.active,'last_login_at',u.last_sign_in_at,'last_activity_at',(select max(s.last_seen_at) from dabbir_private.owner_sessions s where s.actor_user_id=a.user_id),'active_sessions',(select count(*) from dabbir_private.owner_sessions s where s.actor_user_id=a.user_id and s.revoked_at is null and s.expires_at>now()),'invited_at',a.created_at,'added_by',a.added_by,'suspended_at',a.suspended_at,'revoked_at',a.revoked_at,'last_access_reviewed_at',a.last_access_reviewed_at) order by (a.role='ROOT_OWNER') desc,a.created_at),'[]'::jsonb) into v_staff from public.dabbir_platform_admins a join auth.users u on u.id=a.user_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'display_name',i.display_name,'target_user_id',i.target_user_id,'permissions',i.permissions,'granular_permissions',i.granular_permissions,'preset',i.preset,'role_code',i.role_code,'access_scope',i.access_scope,'access_expires_at',i.access_expires_at,'mfa_required',i.mfa_required,'approval_limit_aed',i.approval_limit_aed,'status',i.status,'invited_by',i.invited_by,'expires_at',i.expires_at,'accepted_at',i.accepted_at,'revoked_at',i.revoked_at,'delivery_status',i.delivery_status,'delivery_attempts',i.delivery_attempts,'created_at',i.created_at,'updated_at',i.updated_at) order by i.created_at desc),'[]'::jsonb) into v_invites from dabbir_private.platform_staff_invitations i;
 return jsonb_build_object('staff',v_staff,'invitations',v_invites,'roles',(select coalesce(jsonb_agg(jsonb_build_object('code',r.code,'name_ar',r.name_ar,'name_en',r.name_en,'description',r.description,'permissions',to_jsonb(dabbir_private.platform_role_permissions_v1(r.code))) order by r.code),'[]'::jsonb) from dabbir_private.platform_roles r));
end;
$$;

create or replace function public.dabbir_platform_staff_governance_update_v2(p_actor uuid,p_target uuid,p_role_code text,p_granular_permissions text[],p_access_scope jsonb,p_access_expires_at timestamptz,p_mfa_required boolean,p_approval_limit_aed numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_before public.dabbir_platform_admins%rowtype; v_after public.dabbir_platform_admins%rowtype; v_role_code text:=upper(trim(coalesce(p_role_code,'CUSTOM'))); v_scope jsonb:=coalesce(p_access_scope,'{"type":"ALL_BUSINESSES"}'::jsonb); v_granular text[]:=coalesce(p_granular_permissions,'{}'::text[]);
begin
 perform dabbir_private.platform_assert_permission(p_actor,'manage_employees');
 select * into v_before from public.dabbir_platform_admins where user_id=p_target for update;
 if not found then raise exception 'DABBIR_PLATFORM_EMPLOYEE_NOT_FOUND'; end if;
 if v_before.role='ROOT_OWNER' then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;
 if p_actor=p_target then raise exception 'DABBIR_SELF_PRIVILEGE_CHANGE_FORBIDDEN'; end if;
 perform dabbir_private.platform_assert_can_grant_granular(p_actor,v_granular);
 if v_role_code not in ('EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR','CUSTOM') then raise exception 'DABBIR_ROLE_CODE_INVALID'; end if;
 if not ((v_scope ? 'type') and (v_scope->>'type') in ('ALL_BUSINESSES','ASSIGNED_BUSINESSES_ONLY','SPECIFIC_BUSINESS','SPECIFIC_REGION','OWN_TASKS_ONLY')) then raise exception 'DABBIR_ACCESS_SCOPE_INVALID'; end if;
 if p_access_expires_at is not null and p_access_expires_at<=now() then raise exception 'DABBIR_ACCESS_EXPIRY_INVALID'; end if;
 if p_approval_limit_aed is not null and p_approval_limit_aed<0 then raise exception 'DABBIR_APPROVAL_LIMIT_INVALID'; end if;
 update public.dabbir_platform_admins set role_code=v_role_code,granular_permissions=v_granular,access_scope=v_scope,access_expires_at=p_access_expires_at,mfa_required=coalesce(p_mfa_required,false),approval_limit_aed=p_approval_limit_aed,updated_at=now() where user_id=p_target;
 update dabbir_private.owner_sessions set revoked_at=now() where actor_user_id=p_target and revoked_at is null;
 select * into v_after from public.dabbir_platform_admins where user_id=p_target;
 insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,before_state,after_state,result) values(p_actor,p_target,'SET_GOVERNANCE',left(coalesce(p_reason,''),500),to_jsonb(v_before)-'user_id',to_jsonb(v_after)-'user_id','SUCCESS');
 return jsonb_build_object('user_id',p_target,'authority_role',v_after.role,'role_code',v_after.role_code,'granular_permissions',v_after.granular_permissions,'access_scope',v_after.access_scope,'access_expires_at',v_after.access_expires_at,'mfa_required',v_after.mfa_required,'approval_limit_aed',v_after.approval_limit_aed,'sessions_revoked',true);
end;
$$;

revoke all on function dabbir_private.platform_role_permissions_v1(text) from public,anon,authenticated;
revoke all on function dabbir_private.platform_granular_permissions_valid(text[]) from public,anon,authenticated;
revoke all on function dabbir_private.platform_assert_can_grant_granular(uuid,text[]) from public,anon,authenticated;
revoke all on function dabbir_private.platform_effective_capability(uuid,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_accept_v1(text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_list_v2(uuid) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_governance_update_v2(uuid,uuid,text,text[],jsonb,timestamptz,boolean,numeric,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) to service_role;
grant execute on function public.dabbir_platform_staff_invite_accept_v1(text) to service_role;
grant execute on function public.dabbir_platform_staff_list_v2(uuid) to service_role;
grant execute on function public.dabbir_platform_staff_governance_update_v2(uuid,uuid,text,text[],jsonb,timestamptz,boolean,numeric,text) to service_role;
