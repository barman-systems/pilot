-- DABBIR Owner Executive Command Center Phase 2 P0
-- Keep legacy coarse permissions synchronized with functional role/granular authority.

create or replace function dabbir_private.platform_coarse_permissions_for_role(
  p_role_code text,
  p_granular text[] default '{}'::text[]
)
returns text[]
language plpgsql
stable
set search_path='pg_catalog','dabbir_private'
as $$
declare
  v_role text:=upper(trim(coalesce(p_role_code,'CUSTOM')));
  v_g text[]:=coalesce(p_granular,'{}'::text[]);
  v_out text[]:='{}'::text[];
begin
  if v_role='EXECUTIVE_ADMIN' then
    return array['manage_customers','manage_businesses','manage_orders','manage_bookings','manage_products','manage_services','manage_support','manage_incidents','manage_integrations','manage_employees','manage_system','manage_releases','manage_ceo_commands','view_financials','manage_financial_operations']::text[];
  elsif v_role='OPERATIONS_MANAGER' then
    return array['manage_customers','manage_businesses','manage_orders','manage_bookings','manage_products','manage_services','manage_support','manage_incidents','manage_integrations']::text[];
  elsif v_role='CUSTOMER_SUPPORT' then
    return array['manage_customers','manage_support','manage_incidents']::text[];
  elsif v_role='FINANCE' then
    return array['view_financials','manage_financial_operations']::text[];
  elsif v_role='GROWTH_SALES' then
    return array['manage_customers','manage_businesses']::text[];
  elsif v_role='TECHNICAL_ADMIN' then
    return array['manage_incidents','manage_integrations','manage_system','manage_releases','manage_ceo_commands']::text[];
  elsif v_role='VIEWER_AUDITOR' then
    return array['manage_customers','manage_businesses','manage_orders','manage_bookings','manage_support','manage_system','view_financials']::text[];
  elsif v_role<>'CUSTOM' then
    raise exception 'DABBIR_ROLE_CODE_INVALID';
  end if;

  if cardinality(v_g)=0 then return v_out; end if;
  if exists(select 1 from unnest(v_g) x where x like 'businesses.%') then v_out:=array_append(v_out,'manage_businesses'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'customers.%') then v_out:=array_append(v_out,'manage_customers'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'orders.%') then v_out:=array_append(v_out,'manage_orders'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'bookings.%') then v_out:=array_append(v_out,'manage_bookings'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'support.%') then v_out:=array_append(v_out,'manage_support'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'team.%') then v_out:=array_append(v_out,'manage_employees'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'system.%' or x like 'security.%' or x like 'audit.%') then v_out:=array_append(v_out,'manage_system'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'payments.%' or x like 'subscriptions.%' or x like 'reports.%') then v_out:=array_append(v_out,'view_financials'); end if;
  if exists(select 1 from unnest(v_g) x where x in ('orders.refund','payments.refund','subscriptions.modify','subscriptions.cancel')) then v_out:=array_append(v_out,'manage_financial_operations'); end if;
  return (select coalesce(array_agg(distinct x order by x),'{}'::text[]) from unnest(v_out) x);
end;
$$;

create or replace function public.dabbir_platform_staff_invite_create_v2(
  p_actor uuid,p_target_user_id uuid,p_email text,p_display_name text,p_permissions text[],p_preset text,p_token_hash text,p_expires_at timestamptz,
  p_role_code text,p_granular_permissions text[],p_access_scope jsonb,p_access_expires_at timestamptz,p_mfa_required boolean,p_approval_limit_aed numeric
)
returns jsonb
language plpgsql security definer
set search_path='pg_catalog','public','auth','dabbir_private'
as $$
declare
  v_id uuid;
  v_role_code text:=upper(trim(coalesce(p_role_code,'CUSTOM')));
  v_granular text[]:=coalesce(p_granular_permissions,'{}'::text[]);
  v_scope jsonb:=coalesce(p_access_scope,'{"type":"ALL_BUSINESSES"}'::jsonb);
  v_coarse text[];
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_employees');
  perform dabbir_private.platform_assert_can_grant_granular(p_actor,v_granular);
  if v_role_code not in ('EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR','CUSTOM') then raise exception 'DABBIR_ROLE_CODE_INVALID'; end if;
  if v_role_code='CUSTOM' and cardinality(v_granular)=0 then raise exception 'DABBIR_GRANULAR_PERMISSIONS_REQUIRED'; end if;
  v_coarse:=dabbir_private.platform_coarse_permissions_for_role(v_role_code,v_granular);
  perform dabbir_private.platform_assert_can_grant(p_actor,v_coarse);
  if not ((v_scope ? 'type') and (v_scope->>'type') in ('ALL_BUSINESSES','ASSIGNED_BUSINESSES_ONLY','SPECIFIC_BUSINESS','SPECIFIC_REGION','OWN_TASKS_ONLY')) then raise exception 'DABBIR_ACCESS_SCOPE_INVALID'; end if;
  if p_actor=p_target_user_id then raise exception 'DABBIR_SELF_INVITE_FORBIDDEN'; end if;
  if p_expires_at<=now() then raise exception 'DABBIR_INVITE_EXPIRY_INVALID'; end if;
  if p_access_expires_at is not null and p_access_expires_at<=now() then raise exception 'DABBIR_ACCESS_EXPIRY_INVALID'; end if;
  if p_approval_limit_aed is not null and p_approval_limit_aed<0 then raise exception 'DABBIR_APPROVAL_LIMIT_INVALID'; end if;
  if nullif(trim(p_email),'') is null or nullif(trim(p_token_hash),'') is null then raise exception 'DABBIR_INVITE_INVALID'; end if;
  if not exists(select 1 from auth.users where id=p_target_user_id and lower(email)=lower(trim(p_email))) then raise exception 'DABBIR_INVITE_USER_EMAIL_MISMATCH'; end if;
  if exists(select 1 from public.dabbir_platform_admins where user_id=p_target_user_id and role='ROOT_OWNER') then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;
  update dabbir_private.platform_staff_invitations set status='REVOKED',revoked_at=now(),updated_at=now() where lower(email)=lower(trim(p_email)) and status='PENDING';
  insert into dabbir_private.platform_staff_invitations(email,display_name,target_user_id,permissions,preset,token_hash,invited_by,expires_at,role_code,granular_permissions,access_scope,access_expires_at,mfa_required,approval_limit_aed)
  values(lower(trim(p_email)),nullif(trim(p_display_name),''),p_target_user_id,v_coarse,coalesce(nullif(trim(p_preset),''),'custom'),p_token_hash,p_actor,p_expires_at,v_role_code,v_granular,v_scope,p_access_expires_at,coalesce(p_mfa_required,false),p_approval_limit_aed)
  returning id into v_id;
  insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,after_state,result,metadata)
  values(p_actor,p_target_user_id,'EMPLOYEE_INVITED_V2','governed platform employee invitation',jsonb_build_object('authority_role','OWNER_DELEGATE','role_code',v_role_code,'permissions',v_coarse,'granular_permissions',v_granular,'access_scope',v_scope,'access_expires_at',p_access_expires_at,'mfa_required',coalesce(p_mfa_required,false),'approval_limit_aed',p_approval_limit_aed),'SUCCESS',jsonb_build_object('invitation_id',v_id));
  return jsonb_build_object('id',v_id,'status','PENDING','expires_at',p_expires_at,'access_expires_at',p_access_expires_at,'role_code',v_role_code);
end;
$$;

create or replace function public.dabbir_platform_staff_governance_update_v2(
  p_actor uuid,p_target uuid,p_role_code text,p_granular_permissions text[],p_access_scope jsonb,p_access_expires_at timestamptz,p_mfa_required boolean,p_approval_limit_aed numeric,p_reason text
)
returns jsonb
language plpgsql security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_before public.dabbir_platform_admins%rowtype;
  v_after public.dabbir_platform_admins%rowtype;
  v_role_code text:=upper(trim(coalesce(p_role_code,'CUSTOM')));
  v_scope jsonb:=coalesce(p_access_scope,'{"type":"ALL_BUSINESSES"}'::jsonb);
  v_granular text[]:=coalesce(p_granular_permissions,'{}'::text[]);
  v_coarse text[];
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_employees');
  select * into v_before from public.dabbir_platform_admins where user_id=p_target for update;
  if not found then raise exception 'DABBIR_PLATFORM_EMPLOYEE_NOT_FOUND'; end if;
  if v_before.role='ROOT_OWNER' then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;
  if p_actor=p_target then raise exception 'DABBIR_SELF_PRIVILEGE_CHANGE_FORBIDDEN'; end if;
  if v_role_code not in ('EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR','CUSTOM') then raise exception 'DABBIR_ROLE_CODE_INVALID'; end if;
  if v_role_code='CUSTOM' and cardinality(v_granular)=0 then raise exception 'DABBIR_GRANULAR_PERMISSIONS_REQUIRED'; end if;
  perform dabbir_private.platform_assert_can_grant_granular(p_actor,v_granular);
  v_coarse:=dabbir_private.platform_coarse_permissions_for_role(v_role_code,v_granular);
  perform dabbir_private.platform_assert_can_grant(p_actor,v_coarse);
  if not ((v_scope ? 'type') and (v_scope->>'type') in ('ALL_BUSINESSES','ASSIGNED_BUSINESSES_ONLY','SPECIFIC_BUSINESS','SPECIFIC_REGION','OWN_TASKS_ONLY')) then raise exception 'DABBIR_ACCESS_SCOPE_INVALID'; end if;
  if p_access_expires_at is not null and p_access_expires_at<=now() then raise exception 'DABBIR_ACCESS_EXPIRY_INVALID'; end if;
  if p_approval_limit_aed is not null and p_approval_limit_aed<0 then raise exception 'DABBIR_APPROVAL_LIMIT_INVALID'; end if;
  update public.dabbir_platform_admins
  set role_code=v_role_code,permissions=v_coarse,granular_permissions=v_granular,access_scope=v_scope,access_expires_at=p_access_expires_at,mfa_required=coalesce(p_mfa_required,false),approval_limit_aed=p_approval_limit_aed,updated_at=now()
  where user_id=p_target;
  update dabbir_private.owner_sessions set revoked_at=now() where actor_user_id=p_target and revoked_at is null;
  select * into v_after from public.dabbir_platform_admins where user_id=p_target;
  insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,before_state,after_state,result)
  values(p_actor,p_target,'SET_GOVERNANCE',left(coalesce(p_reason,''),500),to_jsonb(v_before)-'user_id',to_jsonb(v_after)-'user_id','SUCCESS');
  return jsonb_build_object('user_id',p_target,'authority_role',v_after.role,'role_code',v_after.role_code,'permissions',v_after.permissions,'granular_permissions',v_after.granular_permissions,'access_scope',v_after.access_scope,'access_expires_at',v_after.access_expires_at,'mfa_required',v_after.mfa_required,'approval_limit_aed',v_after.approval_limit_aed,'sessions_revoked',true);
end;
$$;

revoke all on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_governance_update_v2(uuid,uuid,text,text[],jsonb,timestamptz,boolean,numeric,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) to service_role;
grant execute on function public.dabbir_platform_staff_governance_update_v2(uuid,uuid,text,text[],jsonb,timestamptz,boolean,numeric,text) to service_role;