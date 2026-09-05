-- DABBIR Owner Executive Command Center / P1 Invitation Lifecycle v2 — foundation
-- Fail-closed invitation authority, scope containment, canonical permissions.

alter table dabbir_private.platform_staff_invitations
  add column if not exists token_generation integer not null default 1,
  add column if not exists resend_count integer not null default 0,
  add column if not exists last_resent_at timestamptz,
  add column if not exists revoked_by uuid,
  add column if not exists revocation_reason text,
  add column if not exists accepted_by_user_id uuid,
  add column if not exists delivery_provider text,
  add column if not exists delivery_attempted_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists delivery_error_code text;

alter table public.dabbir_owner_otp_challenges
  add column if not exists invitation_generation integer;

alter table dabbir_private.platform_staff_invitations drop constraint if exists platform_staff_invitations_token_generation_check;
alter table dabbir_private.platform_staff_invitations add constraint platform_staff_invitations_token_generation_check check (token_generation >= 1);
alter table dabbir_private.platform_staff_invitations drop constraint if exists platform_staff_invitations_resend_count_check;
alter table dabbir_private.platform_staff_invitations add constraint platform_staff_invitations_resend_count_check check (resend_count >= 0);

create or replace function dabbir_private.platform_scope_contains_v1(p_actor uuid,p_requested jsonb)
returns boolean
language plpgsql
stable
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_actor public.dabbir_platform_admins%rowtype;
  v_actor_type text;
  v_requested_type text;
  v_region text;
  v_ids jsonb;
begin
  if p_requested is null or jsonb_typeof(p_requested)<>'object' then return false; end if;
  v_requested_type:=upper(coalesce(p_requested->>'type',''));
  if v_requested_type not in ('ALL_BUSINESSES','ASSIGNED_BUSINESSES_ONLY','SPECIFIC_BUSINESS','SPECIFIC_REGION','OWN_TASKS_ONLY') then return false; end if;

  if v_requested_type='SPECIFIC_BUSINESS' then
    if nullif(p_requested->>'business_id','') is null then return false; end if;
    perform (p_requested->>'business_id')::uuid;
  elsif v_requested_type='ASSIGNED_BUSINESSES_ONLY' then
    v_ids:=coalesce(p_requested->'business_ids','[]'::jsonb);
    if jsonb_typeof(v_ids)<>'array' or jsonb_array_length(v_ids)=0 then return false; end if;
    if exists(select 1 from jsonb_array_elements_text(v_ids) as t(value) where nullif(value,'') is null) then return false; end if;
    perform value::uuid from jsonb_array_elements_text(v_ids) as t(value);
  elsif v_requested_type='SPECIFIC_REGION' then
    v_region:=upper(coalesce(p_requested->>'region_code',p_requested->>'country_code',''));
    if v_region !~ '^[A-Z]{2,3}$' then return false; end if;
  end if;

  select * into v_actor
  from public.dabbir_platform_admins
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
  if not found then return false; end if;
  if v_actor.role='ROOT_OWNER' then return true; end if;

  v_actor_type:=upper(coalesce(v_actor.access_scope->>'type',''));
  if v_actor_type='ALL_BUSINESSES' then return true; end if;
  if v_requested_type='ALL_BUSINESSES' then return false; end if;
  if v_requested_type='SPECIFIC_BUSINESS' then
    return dabbir_private.platform_scope_allows_business(p_actor,(p_requested->>'business_id')::uuid);
  end if;
  if v_requested_type='ASSIGNED_BUSINESSES_ONLY' then
    return not exists(
      select 1 from jsonb_array_elements_text(v_ids) as t(value)
      where not dabbir_private.platform_scope_allows_business(p_actor,value::uuid)
    );
  end if;
  if v_requested_type='SPECIFIC_REGION' then
    return v_actor_type='SPECIFIC_REGION'
      and upper(coalesce(v_actor.access_scope->>'region_code',v_actor.access_scope->>'country_code',''))=v_region;
  end if;
  if v_requested_type='OWN_TASKS_ONLY' then return v_actor_type='OWN_TASKS_ONLY'; end if;
  return false;
exception when others then
  return false;
end;
$$;

create or replace function dabbir_private.platform_invitation_grant_v2(
  p_actor uuid,
  p_role_code text,
  p_requested_granular text[],
  p_access_scope jsonb,
  p_access_expires_at timestamptz,
  p_mfa_required boolean,
  p_approval_limit_aed numeric
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_actor public.dabbir_platform_admins%rowtype;
  v_role text:=upper(trim(coalesce(p_role_code,'CUSTOM')));
  v_granular text[];
  v_coarse text[];
begin
  select * into v_actor
  from public.dabbir_platform_admins
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor)
  for share;
  if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;
  if not dabbir_private.platform_effective_capability(p_actor,'team.invite') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:team.invite';
  end if;

  if v_role not in ('EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR','CUSTOM') then
    raise exception 'DABBIR_ROLE_CODE_INVALID';
  end if;

  if v_role='CUSTOM' then
    v_granular:=coalesce(p_requested_granular,'{}'::text[]);
    if cardinality(v_granular)=0 then raise exception 'DABBIR_GRANULAR_PERMISSIONS_REQUIRED'; end if;
  else
    v_granular:=dabbir_private.platform_role_permissions_v1(v_role);
  end if;

  if not dabbir_private.platform_granular_permissions_valid(v_granular) then
    raise exception 'DABBIR_INVALID_GRANULAR_PERMISSION';
  end if;

  perform dabbir_private.platform_assert_can_grant_granular(p_actor,v_granular);
  v_coarse:=dabbir_private.platform_coarse_permissions_for_role(v_role,v_granular);
  perform dabbir_private.platform_assert_can_grant(p_actor,v_coarse);

  if not dabbir_private.platform_scope_contains_v1(p_actor,p_access_scope) then
    raise exception 'DABBIR_SCOPE_GRANT_EXCEEDS_ACTOR';
  end if;
  if p_access_expires_at is not null and p_access_expires_at<=now() then raise exception 'DABBIR_ACCESS_EXPIRY_INVALID'; end if;
  if p_approval_limit_aed is not null and p_approval_limit_aed<0 then raise exception 'DABBIR_APPROVAL_LIMIT_INVALID'; end if;

  if v_actor.role<>'ROOT_OWNER' then
    if v_actor.access_expires_at is not null
       and (p_access_expires_at is null or p_access_expires_at>v_actor.access_expires_at) then
      raise exception 'DABBIR_ACCESS_EXPIRY_GRANT_EXCEEDS_ACTOR';
    end if;
    if p_approval_limit_aed is not null
       and (v_actor.approval_limit_aed is null or p_approval_limit_aed>v_actor.approval_limit_aed) then
      raise exception 'DABBIR_APPROVAL_LIMIT_GRANT_EXCEEDS_ACTOR';
    end if;
    if coalesce(v_actor.mfa_required,false) and not coalesce(p_mfa_required,false) then
      raise exception 'DABBIR_MFA_POLICY_GRANT_WEAKENS_ACTOR';
    end if;
  end if;

  return jsonb_build_object(
    'role_code',v_role,
    'granular_permissions',to_jsonb(v_granular),
    'coarse_permissions',to_jsonb(v_coarse),
    'access_scope',p_access_scope,
    'access_expires_at',p_access_expires_at,
    'mfa_required',coalesce(p_mfa_required,false),
    'approval_limit_aed',p_approval_limit_aed
  );
end;
$$;

create or replace function public.dabbir_platform_staff_invite_create_v2(
  p_actor uuid,p_target_user_id uuid,p_email text,p_display_name text,p_permissions text[],p_preset text,p_token_hash text,p_expires_at timestamptz,
  p_role_code text,p_granular_permissions text[],p_access_scope jsonb,p_access_expires_at timestamptz,p_mfa_required boolean,p_approval_limit_aed numeric
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth','dabbir_private'
as $$
declare
  v_id uuid;
  v_auth jsonb;
  v_granular text[];
  v_coarse text[];
  v_scope jsonb:=coalesce(p_access_scope,'{"type":"ALL_BUSINESSES"}'::jsonb);
begin
  if p_actor=p_target_user_id then raise exception 'DABBIR_SELF_INVITE_FORBIDDEN'; end if;
  if p_expires_at is null or p_expires_at<=now() then raise exception 'DABBIR_INVITE_EXPIRY_INVALID'; end if;
  if nullif(trim(p_email),'') is null or nullif(trim(p_token_hash),'') is null then raise exception 'DABBIR_INVITE_INVALID'; end if;
  if not exists(select 1 from auth.users where id=p_target_user_id and lower(email)=lower(trim(p_email))) then raise exception 'DABBIR_INVITE_USER_EMAIL_MISMATCH'; end if;
  if exists(select 1 from public.dabbir_platform_admins where user_id=p_target_user_id and role='ROOT_OWNER') then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;

  v_auth:=dabbir_private.platform_invitation_grant_v2(
    p_actor,p_role_code,p_granular_permissions,v_scope,p_access_expires_at,p_mfa_required,p_approval_limit_aed
  );
  select coalesce(array_agg(value),'{}'::text[]) into v_granular from jsonb_array_elements_text(v_auth->'granular_permissions');
  select coalesce(array_agg(value),'{}'::text[]) into v_coarse from jsonb_array_elements_text(v_auth->'coarse_permissions');

  update dabbir_private.platform_staff_invitations
  set status='REVOKED',revoked_at=now(),revoked_by=p_actor,
      revocation_reason='SUPERSEDED_BY_NEW_INVITATION',token_generation=token_generation+1,
      token_hash='revoked:'||id::text||':'||(token_generation+1)::text,updated_at=now()
  where lower(email)=lower(trim(p_email)) and status='PENDING';

  insert into dabbir_private.platform_staff_invitations(
    email,display_name,target_user_id,permissions,preset,token_hash,invited_by,expires_at,
    role_code,granular_permissions,access_scope,access_expires_at,mfa_required,approval_limit_aed,
    token_generation,resend_count,delivery_status
  ) values(
    lower(trim(p_email)),nullif(trim(p_display_name),''),p_target_user_id,v_coarse,
    coalesce(nullif(trim(p_preset),''),'custom'),p_token_hash,p_actor,p_expires_at,
    v_auth->>'role_code',v_granular,v_scope,p_access_expires_at,coalesce(p_mfa_required,false),p_approval_limit_aed,
    1,0,'PREPARED'
  ) returning id into v_id;

  insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,after_state,result,metadata)
  values(
    p_actor,p_target_user_id,'INVITE_CREATED','governed platform invitation',
    jsonb_build_object('authority_role','OWNER_DELEGATE','role_code',v_auth->>'role_code','permissions',v_coarse,
      'granular_permissions',v_granular,'access_scope',v_scope,'access_expires_at',p_access_expires_at,
      'mfa_required',coalesce(p_mfa_required,false),'approval_limit_aed',p_approval_limit_aed,'token_generation',1),
    'SUCCESS',jsonb_build_object('invitation_id',v_id,'email',lower(trim(p_email)))
  );

  return jsonb_build_object('id',v_id,'status','PENDING','expires_at',p_expires_at,'access_expires_at',p_access_expires_at,
    'role_code',v_auth->>'role_code','token_generation',1,'delivery_status','PREPARED');
end;
$$;

revoke all on function dabbir_private.platform_scope_contains_v1(uuid,jsonb) from public,anon,authenticated;
revoke all on function dabbir_private.platform_invitation_grant_v2(uuid,text,text[],jsonb,timestamptz,boolean,numeric) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) from public,anon,authenticated;
grant execute on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) to service_role;
