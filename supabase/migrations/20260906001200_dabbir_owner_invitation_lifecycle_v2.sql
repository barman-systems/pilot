-- DABBIR Owner Executive Command Center Phase 2 / P1
-- Invitation lifecycle v2: fail-closed delegation containment, rotation, sponsor revalidation and auditable terminal state.
-- DABBIR-DESTRUCTIVE-MIGRATION-REVIEWED: additive metadata + security function replacements only; no business data deletion.

alter table dabbir_private.platform_staff_invitations
  add column if not exists generation integer not null default 1,
  add column if not exists resend_count integer not null default 0,
  add column if not exists last_resent_at timestamptz,
  add column if not exists revoked_by uuid,
  add column if not exists revocation_reason text,
  add column if not exists accepted_by_user_id uuid,
  add column if not exists delivery_provider text,
  add column if not exists delivery_attempted_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists delivery_error_code text;

alter table dabbir_private.platform_staff_invitations
  drop constraint if exists platform_staff_invitations_generation_check;
alter table dabbir_private.platform_staff_invitations
  add constraint platform_staff_invitations_generation_check check (generation > 0);

alter table dabbir_private.platform_staff_invitations
  drop constraint if exists platform_staff_invitations_resend_count_check;
alter table dabbir_private.platform_staff_invitations
  add constraint platform_staff_invitations_resend_count_check check (resend_count >= 0);

alter table public.dabbir_owner_otp_challenges
  add column if not exists invitation_generation integer;

create index if not exists platform_staff_invitations_pending_email_idx
  on dabbir_private.platform_staff_invitations(lower(email), created_at desc)
  where status='PENDING' and revoked_at is null and accepted_at is null;

create or replace function dabbir_private.platform_scope_shape_valid_v2(p_scope jsonb)
returns boolean
language plpgsql
stable
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_type text;
  v_count integer;
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if p_scope is null or coalesce(jsonb_typeof(p_scope),'') <> 'object' then return false; end if;
  v_type:=upper(coalesce(p_scope->>'type',''));

  if v_type in ('ALL_BUSINESSES','OWN_TASKS_ONLY') then return true; end if;

  if v_type='SPECIFIC_BUSINESS' then
    if coalesce(p_scope->>'business_id','') !~* v_uuid_re then return false; end if;
    return exists(
      select 1 from public.dabbir_businesses b
      where b.id=(p_scope->>'business_id')::uuid
    );
  end if;

  if v_type='ASSIGNED_BUSINESSES_ONLY' then
    if coalesce(jsonb_typeof(p_scope->'business_ids'),'') <> 'array' then return false; end if;
    select count(*) into v_count from jsonb_array_elements_text(p_scope->'business_ids');
    if v_count < 1 or v_count > 100 then return false; end if;
    if exists(
      select 1 from jsonb_array_elements_text(p_scope->'business_ids') x
      where x !~* v_uuid_re
    ) then return false; end if;
    if exists(
      select 1 from jsonb_array_elements_text(p_scope->'business_ids') x
      where not exists(select 1 from public.dabbir_businesses b where b.id=x::uuid)
    ) then return false; end if;
    return true;
  end if;

  if v_type='SPECIFIC_REGION' then
    return upper(coalesce(p_scope->>'region_code',p_scope->>'country_code','')) ~ '^[A-Z]{2,3}$';
  end if;

  return false;
exception when others then
  return false;
end;
$$;

create or replace function dabbir_private.platform_scope_grant_allowed_v2(p_actor uuid,p_scope jsonb)
returns boolean
language plpgsql
stable
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_actor_role text;
  v_actor_scope jsonb;
  v_actor_type text;
  v_child_type text;
  v_actor_region text;
  v_child_region text;
begin
  if not dabbir_private.platform_scope_shape_valid_v2(p_scope) then return false; end if;

  select role,access_scope into v_actor_role,v_actor_scope
  from public.dabbir_platform_admins
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
  if not found then return false; end if;

  if v_actor_role='ROOT_OWNER' then return true; end if;

  v_actor_type:=upper(coalesce(v_actor_scope->>'type',''));
  v_child_type:=upper(coalesce(p_scope->>'type',''));

  if v_actor_type='ALL_BUSINESSES' then return true; end if;

  if v_child_type='SPECIFIC_BUSINESS' then
    return dabbir_private.platform_scope_allows_business(p_actor,(p_scope->>'business_id')::uuid);
  end if;

  if v_child_type='ASSIGNED_BUSINESSES_ONLY' then
    return not exists(
      select 1
      from jsonb_array_elements_text(p_scope->'business_ids') x
      where not dabbir_private.platform_scope_allows_business(p_actor,x::uuid)
    );
  end if;

  if v_child_type='SPECIFIC_REGION' then
    if v_actor_type<>'SPECIFIC_REGION' then return false; end if;
    v_actor_region:=upper(coalesce(v_actor_scope->>'region_code',v_actor_scope->>'country_code',''));
    v_child_region:=upper(coalesce(p_scope->>'region_code',p_scope->>'country_code',''));
    return v_actor_region<>'' and v_actor_region=v_child_region;
  end if;

  if v_child_type='OWN_TASKS_ONLY' then
    return v_actor_type='OWN_TASKS_ONLY';
  end if;

  return false;
exception when others then
  return false;
end;
$$;

create or replace function dabbir_private.platform_assert_scope_grant_v2(p_actor uuid,p_scope jsonb)
returns void
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
begin
  if not dabbir_private.platform_scope_grant_allowed_v2(p_actor,p_scope) then
    raise exception 'DABBIR_SCOPE_GRANT_EXCEEDS_ACTOR';
  end if;
end;
$$;

create or replace function dabbir_private.platform_invite_granular_for_role_v2(
  p_role_code text,
  p_granular text[] default '{}'::text[]
)
returns text[]
language plpgsql
stable
set search_path='pg_catalog','dabbir_private'
as $$
declare
  v_role text:=upper(trim(coalesce(p_role_code,'')));
  v_requested text[];
  v_canonical text[];
begin
  select coalesce(array_agg(distinct trim(x) order by trim(x)),'{}'::text[])
  into v_requested
  from unnest(coalesce(p_granular,'{}'::text[])) x
  where nullif(trim(x),'') is not null;

  if v_role='CUSTOM' then
    if cardinality(v_requested)=0 then raise exception 'DABBIR_GRANULAR_PERMISSIONS_REQUIRED'; end if;
    if not dabbir_private.platform_granular_permissions_valid(v_requested) then
      raise exception 'DABBIR_INVALID_GRANULAR_PERMISSION';
    end if;
    return v_requested;
  end if;

  if v_role not in ('EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR') then
    raise exception 'DABBIR_ROLE_CODE_INVALID';
  end if;

  v_canonical:=dabbir_private.platform_role_permissions_v1(v_role);
  if cardinality(v_canonical)=0 then raise exception 'DABBIR_ROLE_PERMISSION_MAP_EMPTY'; end if;

  if cardinality(v_requested)>0
     and not (v_requested @> v_canonical and v_canonical @> v_requested) then
    raise exception 'DABBIR_ROLE_PERMISSION_MISMATCH';
  end if;
  return v_canonical;
end;
$$;

create or replace function dabbir_private.platform_assert_invite_grant_v2(
  p_actor uuid,
  p_granular text[],
  p_coarse text[],
  p_scope jsonb,
  p_access_expires_at timestamptz,
  p_approval_limit_aed numeric
)
returns void
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_actor public.dabbir_platform_admins%rowtype;
begin
  select * into v_actor
  from public.dabbir_platform_admins
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
  if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;

  if not dabbir_private.platform_effective_capability(p_actor,'team.invite') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:team.invite';
  end if;

  perform dabbir_private.platform_assert_can_grant_granular(p_actor,coalesce(p_granular,'{}'::text[]));
  perform dabbir_private.platform_assert_can_grant(p_actor,coalesce(p_coarse,'{}'::text[]));
  perform dabbir_private.platform_assert_scope_grant_v2(p_actor,p_scope);

  if p_access_expires_at is not null and p_access_expires_at<=now() then
    raise exception 'DABBIR_ACCESS_EXPIRY_INVALID';
  end if;
  if p_approval_limit_aed is not null and p_approval_limit_aed<0 then
    raise exception 'DABBIR_APPROVAL_LIMIT_INVALID';
  end if;

  if v_actor.role<>'ROOT_OWNER' then
    if v_actor.access_expires_at is not null
       and (p_access_expires_at is null or p_access_expires_at>v_actor.access_expires_at) then
      raise exception 'DABBIR_ACCESS_EXPIRY_EXCEEDS_ACTOR';
    end if;

    if v_actor.approval_limit_aed is null then
      if p_approval_limit_aed is not null then
        raise exception 'DABBIR_APPROVAL_LIMIT_EXCEEDS_ACTOR';
      end if;
    elsif p_approval_limit_aed is null or p_approval_limit_aed>v_actor.approval_limit_aed then
      raise exception 'DABBIR_APPROVAL_LIMIT_EXCEEDS_ACTOR';
    end if;
  end if;
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
  v_role_code text:=upper(trim(coalesce(p_role_code,'CUSTOM')));
  v_granular text[];
  v_scope jsonb:=coalesce(p_access_scope,'{"type":"ALL_BUSINESSES"}'::jsonb);
  v_coarse text[];
  v_email text:=lower(trim(coalesce(p_email,'')));
begin
  v_granular:=dabbir_private.platform_invite_granular_for_role_v2(v_role_code,p_granular_permissions);
  v_coarse:=dabbir_private.platform_coarse_permissions_for_role(v_role_code,v_granular);
  perform dabbir_private.platform_assert_invite_grant_v2(
    p_actor,v_granular,v_coarse,v_scope,p_access_expires_at,p_approval_limit_aed
  );

  if p_actor=p_target_user_id then raise exception 'DABBIR_SELF_INVITE_FORBIDDEN'; end if;
  if p_expires_at is null or p_expires_at<=now() then raise exception 'DABBIR_INVITE_EXPIRY_INVALID'; end if;
  if v_email='' or nullif(trim(p_token_hash),'') is null then raise exception 'DABBIR_INVITE_INVALID'; end if;
  if not exists(select 1 from auth.users where id=p_target_user_id and lower(email)=v_email) then
    raise exception 'DABBIR_INVITE_USER_EMAIL_MISMATCH';
  end if;
  if exists(select 1 from public.dabbir_platform_admins where user_id=p_target_user_id and role='ROOT_OWNER') then
    raise exception 'DABBIR_ROOT_OWNER_PROTECTED';
  end if;
  if exists(
    select 1
    from dabbir_private.platform_staff_invitations i
    where lower(i.email)=v_email
      and i.status='PENDING'
      and i.revoked_at is null
      and i.accepted_at is null
      and i.expires_at>now()
  ) then
    raise exception 'DABBIR_INVITATION_ALREADY_PENDING';
  end if;

  insert into dabbir_private.platform_staff_invitations(
    email,display_name,target_user_id,permissions,preset,token_hash,invited_by,expires_at,
    role_code,granular_permissions,access_scope,access_expires_at,mfa_required,approval_limit_aed,
    generation,resend_count,delivery_status
  )
  values(
    v_email,nullif(trim(p_display_name),''),p_target_user_id,v_coarse,coalesce(nullif(trim(p_preset),''),'custom'),
    p_token_hash,p_actor,p_expires_at,v_role_code,v_granular,v_scope,p_access_expires_at,
    coalesce(p_mfa_required,false),p_approval_limit_aed,1,0,'PREPARED'
  )
  returning id into v_id;

  insert into dabbir_private.platform_staff_audit(
    actor_user_id,target_user_id,action,reason,after_state,result,metadata
  )
  values(
    p_actor,p_target_user_id,'INVITE_CREATED','governed platform employee invitation',
    jsonb_build_object(
      'authority_role','OWNER_DELEGATE',
      'role_code',v_role_code,
      'permissions',v_coarse,
      'granular_permissions',v_granular,
      'access_scope',v_scope,
      'access_expires_at',p_access_expires_at,
      'mfa_required',coalesce(p_mfa_required,false),
      'approval_limit_aed',p_approval_limit_aed,
      'generation',1,
      'delivery_status','PREPARED'
    ),
    'SUCCESS',
    jsonb_build_object(
      'invitation_id',v_id,
      'email',v_email,
      'coarse_input_ignored',not (
        coalesce(p_permissions,'{}'::text[]) @> v_coarse
        and v_coarse @> coalesce(p_permissions,'{}'::text[])
      )
    )
  );

  return jsonb_build_object(
    'id',v_id,
    'status','PENDING',
    'expires_at',p_expires_at,
    'access_expires_at',p_access_expires_at,
    'role_code',v_role_code,
    'generation',1,
    'delivery_status','PREPARED'
  );
end;
$$;

create or replace function public.dabbir_platform_staff_invite_resend_v2(
  p_actor uuid,
  p_invitation_id uuid,
  p_new_token_hash text,
  p_new_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_inv dabbir_private.platform_staff_invitations%rowtype;
  v_actor_role text;
  v_sponsor_role text;
  v_granular text[];
  v_coarse text[];
  v_before jsonb;
begin
  if nullif(trim(p_new_token_hash),'') is null then raise exception 'DABBIR_INVITE_INVALID'; end if;
  if p_new_expires_at is null or p_new_expires_at<=now() then raise exception 'DABBIR_INVITE_EXPIRY_INVALID'; end if;

  select * into v_inv
  from dabbir_private.platform_staff_invitations
  where id=p_invitation_id
  for update;
  if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
  if v_inv.status<>'PENDING' or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    raise exception 'DABBIR_INVITATION_NOT_PENDING';
  end if;
  if v_inv.expires_at<=now() then raise exception 'DABBIR_INVITATION_EXPIRED'; end if;
  if p_new_token_hash=v_inv.token_hash then raise exception 'DABBIR_INVITE_ROTATION_REQUIRED'; end if;

  select role into v_actor_role
  from public.dabbir_platform_admins
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
  if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;

  select role into v_sponsor_role
  from public.dabbir_platform_admins
  where user_id=v_inv.invited_by and dabbir_private.platform_admin_is_active(v_inv.invited_by);
  if not found then raise exception 'DABBIR_INVITE_SPONSOR_AUTHORITY_CHANGED'; end if;

  if v_sponsor_role='ROOT_OWNER' and v_actor_role<>'ROOT_OWNER' then
    raise exception 'DABBIR_ROOT_INVITATION_PROTECTED';
  end if;

  v_granular:=dabbir_private.platform_invite_granular_for_role_v2(v_inv.role_code,v_inv.granular_permissions);
  v_coarse:=dabbir_private.platform_coarse_permissions_for_role(v_inv.role_code,v_granular);
  if not (coalesce(v_inv.permissions,'{}'::text[]) @> v_coarse and v_coarse @> coalesce(v_inv.permissions,'{}'::text[])) then
    raise exception 'DABBIR_INVITATION_POLICY_CHANGED';
  end if;

  begin
    perform dabbir_private.platform_assert_invite_grant_v2(
      v_inv.invited_by,v_granular,v_coarse,v_inv.access_scope,v_inv.access_expires_at,v_inv.approval_limit_aed
    );
  exception when others then
    raise exception 'DABBIR_INVITE_SPONSOR_AUTHORITY_CHANGED';
  end;

  perform dabbir_private.platform_assert_invite_grant_v2(
    p_actor,v_granular,v_coarse,v_inv.access_scope,v_inv.access_expires_at,v_inv.approval_limit_aed
  );

  v_before:=jsonb_build_object(
    'status',v_inv.status,
    'generation',v_inv.generation,
    'expires_at',v_inv.expires_at,
    'delivery_status',v_inv.delivery_status,
    'resend_count',v_inv.resend_count
  );

  update dabbir_private.platform_staff_invitations
  set token_hash=p_new_token_hash,
      generation=generation+1,
      resend_count=resend_count+1,
      last_resent_at=now(),
      expires_at=p_new_expires_at,
      delivery_status='PREPARED',
      delivery_provider=null,
      delivery_attempted_at=null,
      provider_message_id=null,
      delivery_error_code=null,
      updated_at=now()
  where id=p_invitation_id
    and status='PENDING'
    and revoked_at is null
    and accepted_at is null;

  if not found then raise exception 'DABBIR_INVITATION_STATE_RACE'; end if;

  select * into v_inv from dabbir_private.platform_staff_invitations where id=p_invitation_id;

  insert into dabbir_private.platform_staff_audit(
    actor_user_id,target_user_id,action,reason,before_state,after_state,result,metadata
  )
  values(
    p_actor,v_inv.target_user_id,'INVITE_RESENT','invitation token generation rotated',
    v_before,
    jsonb_build_object(
      'status',v_inv.status,
      'generation',v_inv.generation,
      'expires_at',v_inv.expires_at,
      'delivery_status',v_inv.delivery_status,
      'resend_count',v_inv.resend_count
    ),
    'PREPARED',
    jsonb_build_object('invitation_id',v_inv.id,'email',v_inv.email)
  );

  return jsonb_build_object(
    'id',v_inv.id,
    'email',v_inv.email,
    'display_name',v_inv.display_name,
    'status',v_inv.status,
    'expires_at',v_inv.expires_at,
    'generation',v_inv.generation,
    'resend_count',v_inv.resend_count,
    'delivery_status',v_inv.delivery_status
  );
end;
$$;

create or replace function public.dabbir_platform_staff_invite_revoke_v2(
  p_actor uuid,
  p_invitation_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_inv dabbir_private.platform_staff_invitations%rowtype;
  v_actor_role text;
  v_sponsor_role text;
  v_granular text[];
  v_coarse text[];
  v_reason text:=left(trim(coalesce(p_reason,'')),500);
  v_before jsonb;
begin
  if v_reason='' then raise exception 'DABBIR_INVITATION_REVOKE_REASON_REQUIRED'; end if;

  select * into v_inv
  from dabbir_private.platform_staff_invitations
  where id=p_invitation_id
  for update;
  if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
  if v_inv.status<>'PENDING' or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    raise exception 'DABBIR_INVITATION_NOT_PENDING';
  end if;

  select role into v_actor_role
  from public.dabbir_platform_admins
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
  if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;
  if not dabbir_private.platform_effective_capability(p_actor,'team.invite') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:team.invite';
  end if;

  select role into v_sponsor_role
  from public.dabbir_platform_admins
  where user_id=v_inv.invited_by;
  if v_sponsor_role='ROOT_OWNER' and v_actor_role<>'ROOT_OWNER' then
    raise exception 'DABBIR_ROOT_INVITATION_PROTECTED';
  end if;

  v_granular:=dabbir_private.platform_invite_granular_for_role_v2(v_inv.role_code,v_inv.granular_permissions);
  v_coarse:=dabbir_private.platform_coarse_permissions_for_role(v_inv.role_code,v_granular);
  perform dabbir_private.platform_assert_invite_grant_v2(
    p_actor,v_granular,v_coarse,v_inv.access_scope,v_inv.access_expires_at,v_inv.approval_limit_aed
  );

  v_before:=jsonb_build_object(
    'status',v_inv.status,
    'generation',v_inv.generation,
    'expires_at',v_inv.expires_at,
    'delivery_status',v_inv.delivery_status
  );

  update dabbir_private.platform_staff_invitations
  set status='REVOKED',
      revoked_at=now(),
      revoked_by=p_actor,
      revocation_reason=v_reason,
      generation=generation+1,
      token_hash='revoked:'||id::text||':'||(generation+1)::text,
      updated_at=now()
  where id=p_invitation_id
    and status='PENDING'
    and revoked_at is null
    and accepted_at is null;
  if not found then raise exception 'DABBIR_INVITATION_STATE_RACE'; end if;

  select * into v_inv from dabbir_private.platform_staff_invitations where id=p_invitation_id;

  insert into dabbir_private.platform_staff_audit(
    actor_user_id,target_user_id,action,reason,before_state,after_state,result,metadata
  )
  values(
    p_actor,v_inv.target_user_id,'INVITE_REVOKED',v_reason,
    v_before,
    jsonb_build_object(
      'status',v_inv.status,
      'revoked_at',v_inv.revoked_at,
      'revoked_by',v_inv.revoked_by,
      'generation',v_inv.generation
    ),
    'SUCCESS',
    jsonb_build_object('invitation_id',v_inv.id,'email',v_inv.email)
  );

  return jsonb_build_object(
    'id',v_inv.id,
    'status',v_inv.status,
    'revoked_at',v_inv.revoked_at,
    'generation',v_inv.generation
  );
end;
$$;

create or replace function public.dabbir_platform_staff_invite_revoke_v1(p_actor uuid,p_invitation_id uuid,p_reason text)
returns jsonb
language sql
security definer
set search_path='pg_catalog','public'
as $$
  select public.dabbir_platform_staff_invite_revoke_v2(p_actor,p_invitation_id,p_reason)
$$;

create or replace function public.dabbir_platform_staff_invite_delivery_v2(
  p_actor uuid,
  p_invitation_id uuid,
  p_status text,
  p_provider text,
  p_provider_message_id text,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_status text:=upper(trim(coalesce(p_status,'')));
  v_inv dabbir_private.platform_staff_invitations%rowtype;
  v_provider text:=left(nullif(trim(coalesce(p_provider,'')),''),80);
  v_message_id text:=left(nullif(trim(coalesce(p_provider_message_id,'')),''),200);
  v_error text:=left(nullif(trim(coalesce(p_error_code,'')),''),120);
  v_actor_role text;
  v_sponsor_role text;
  v_granular text[];
  v_coarse text[];
begin
  if v_status not in ('SENT','FAILED') then raise exception 'DABBIR_INVITE_DELIVERY_STATUS_INVALID'; end if;

  select * into v_inv
  from dabbir_private.platform_staff_invitations
  where id=p_invitation_id
  for update;
  if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
  if v_inv.status<>'PENDING' or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    raise exception 'DABBIR_INVITATION_NOT_PENDING';
  end if;

  select role into v_actor_role
  from public.dabbir_platform_admins
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
  if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;
  select role into v_sponsor_role from public.dabbir_platform_admins where user_id=v_inv.invited_by;
  if v_sponsor_role='ROOT_OWNER' and v_actor_role<>'ROOT_OWNER' then
    raise exception 'DABBIR_ROOT_INVITATION_PROTECTED';
  end if;

  v_granular:=dabbir_private.platform_invite_granular_for_role_v2(v_inv.role_code,v_inv.granular_permissions);
  v_coarse:=dabbir_private.platform_coarse_permissions_for_role(v_inv.role_code,v_granular);
  perform dabbir_private.platform_assert_invite_grant_v2(
    p_actor,v_granular,v_coarse,v_inv.access_scope,v_inv.access_expires_at,v_inv.approval_limit_aed
  );

  update dabbir_private.platform_staff_invitations
  set delivery_status=v_status,
      delivery_attempts=delivery_attempts+1,
      delivery_provider=v_provider,
      delivery_attempted_at=now(),
      provider_message_id=case when v_status='SENT' then v_message_id else null end,
      delivery_error_code=case when v_status='FAILED' then coalesce(v_error,'UNKNOWN') else null end,
      updated_at=now()
  where id=p_invitation_id;

  insert into dabbir_private.platform_staff_audit(
    actor_user_id,target_user_id,action,reason,before_state,after_state,result,metadata
  )
  values(
    p_actor,v_inv.target_user_id,
    case when v_status='FAILED' then 'INVITE_DELIVERY_FAILED' else 'INVITE_DELIVERED' end,
    case when v_status='FAILED' then coalesce(v_error,'UNKNOWN') else 'email provider accepted invitation message' end,
    jsonb_build_object('delivery_status',v_inv.delivery_status,'delivery_attempts',v_inv.delivery_attempts),
    jsonb_build_object('delivery_status',v_status,'delivery_attempts',v_inv.delivery_attempts+1,'delivery_provider',v_provider),
    v_status,
    jsonb_build_object('invitation_id',v_inv.id,'provider_message_id',v_message_id)
  );

  return jsonb_build_object(
    'id',v_inv.id,
    'delivery_status',v_status,
    'delivery_attempts',v_inv.delivery_attempts+1
  );
end;
$$;

create or replace function public.dabbir_platform_staff_accept_for_user_v2(
  p_user_id uuid,
  p_invitation_id uuid,
  p_generation integer
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth','dabbir_private'
as $$
declare
  v_inv dabbir_private.platform_staff_invitations%rowtype;
  v_granular text[];
  v_coarse text[];
  v_after public.dabbir_platform_admins%rowtype;
  v_failure text;
begin
  select * into v_inv
  from dabbir_private.platform_staff_invitations
  where id=p_invitation_id
  for update;

  if not found then
    return jsonb_build_object('accepted',false,'reason','INVITATION_NOT_FOUND');
  end if;

  if v_inv.target_user_id<>p_user_id then
    insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,result,metadata)
    values(v_inv.invited_by,p_user_id,'INVITE_ACCEPT_FAILED','INVITATION_USER_MISMATCH','FAILED',jsonb_build_object('invitation_id',v_inv.id));
    return jsonb_build_object('accepted',false,'reason','INVITATION_USER_MISMATCH');
  end if;

  if v_inv.status<>'PENDING' or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,result,metadata)
    values(v_inv.invited_by,p_user_id,'INVITE_ACCEPT_FAILED','INVITATION_NOT_PENDING','FAILED',jsonb_build_object('invitation_id',v_inv.id));
    return jsonb_build_object('accepted',false,'reason','INVITATION_NOT_PENDING');
  end if;

  if p_generation is null or p_generation<>v_inv.generation then
    insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,result,metadata)
    values(v_inv.invited_by,p_user_id,'INVITE_ACCEPT_FAILED','INVITATION_GENERATION_STALE','FAILED',jsonb_build_object('invitation_id',v_inv.id,'current_generation',v_inv.generation));
    return jsonb_build_object('accepted',false,'reason','INVITATION_GENERATION_STALE');
  end if;

  if v_inv.expires_at<=now() then
    update dabbir_private.platform_staff_invitations
    set status='EXPIRED',
        generation=generation+1,
        token_hash='expired:'||id::text||':'||(generation+1)::text,
        updated_at=now()
    where id=v_inv.id and status='PENDING';
    insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,result,metadata)
    values(v_inv.invited_by,p_user_id,'INVITE_ACCEPT_FAILED','INVITATION_EXPIRED','FAILED',jsonb_build_object('invitation_id',v_inv.id));
    return jsonb_build_object('accepted',false,'reason','INVITATION_EXPIRED');
  end if;

  if v_inv.access_expires_at is not null and v_inv.access_expires_at<=now() then
    insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,result,metadata)
    values(v_inv.invited_by,p_user_id,'INVITE_ACCEPT_FAILED','ACCESS_EXPIRY_INVALID','FAILED',jsonb_build_object('invitation_id',v_inv.id));
    return jsonb_build_object('accepted',false,'reason','ACCESS_EXPIRY_INVALID');
  end if;

  if not exists(
    select 1 from auth.users u
    where u.id=p_user_id and lower(u.email)=lower(v_inv.email)
  ) then
    insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,result,metadata)
    values(v_inv.invited_by,p_user_id,'INVITE_ACCEPT_FAILED','INVITATION_EMAIL_MISMATCH','FAILED',jsonb_build_object('invitation_id',v_inv.id));
    return jsonb_build_object('accepted',false,'reason','INVITATION_EMAIL_MISMATCH');
  end if;

  if exists(select 1 from public.dabbir_platform_admins where user_id=p_user_id and role='ROOT_OWNER') then
    insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,result,metadata)
    values(v_inv.invited_by,p_user_id,'INVITE_ACCEPT_FAILED','ROOT_OWNER_PROTECTED','FAILED',jsonb_build_object('invitation_id',v_inv.id));
    return jsonb_build_object('accepted',false,'reason','ROOT_OWNER_PROTECTED');
  end if;

  begin
    v_granular:=dabbir_private.platform_invite_granular_for_role_v2(v_inv.role_code,v_inv.granular_permissions);
    v_coarse:=dabbir_private.platform_coarse_permissions_for_role(v_inv.role_code,v_granular);
    if not (coalesce(v_inv.permissions,'{}'::text[]) @> v_coarse and v_coarse @> coalesce(v_inv.permissions,'{}'::text[])) then
      raise exception 'DABBIR_INVITATION_POLICY_CHANGED';
    end if;
    perform dabbir_private.platform_assert_invite_grant_v2(
      v_inv.invited_by,v_granular,v_coarse,v_inv.access_scope,v_inv.access_expires_at,v_inv.approval_limit_aed
    );
  exception when others then
    v_failure:='INVITE_SPONSOR_AUTHORITY_CHANGED';
  end;

  if v_failure is not null then
    insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,result,metadata)
    values(v_inv.invited_by,p_user_id,'INVITE_ACCEPT_FAILED',v_failure,'FAILED',jsonb_build_object('invitation_id',v_inv.id));
    return jsonb_build_object('accepted',false,'reason',v_failure);
  end if;

  insert into public.dabbir_platform_admins(
    user_id,role,active,permissions,display_name,added_by,updated_at,
    role_code,granular_permissions,access_scope,access_expires_at,mfa_required,approval_limit_aed
  )
  values(
    v_inv.target_user_id,'OWNER_DELEGATE',true,v_coarse,v_inv.display_name,v_inv.invited_by,now(),
    v_inv.role_code,v_granular,v_inv.access_scope,v_inv.access_expires_at,v_inv.mfa_required,v_inv.approval_limit_aed
  )
  on conflict(user_id) do update
  set role='OWNER_DELEGATE',
      active=true,
      permissions=excluded.permissions,
      display_name=excluded.display_name,
      added_by=excluded.added_by,
      updated_at=now(),
      suspended_at=null,
      revoked_at=null,
      role_code=excluded.role_code,
      granular_permissions=excluded.granular_permissions,
      access_scope=excluded.access_scope,
      access_expires_at=excluded.access_expires_at,
      mfa_required=excluded.mfa_required,
      approval_limit_aed=excluded.approval_limit_aed;

  update dabbir_private.platform_staff_invitations
  set status='ACCEPTED',
      accepted_at=now(),
      accepted_by_user_id=p_user_id,
      generation=generation+1,
      token_hash='accepted:'||id::text||':'||(generation+1)::text,
      updated_at=now()
  where id=v_inv.id
    and status='PENDING'
    and revoked_at is null
    and accepted_at is null
    and generation=p_generation;
  if not found then raise exception 'DABBIR_INVITATION_STATE_RACE'; end if;

  select * into v_after from public.dabbir_platform_admins where user_id=p_user_id;

  insert into dabbir_private.platform_staff_audit(
    actor_user_id,target_user_id,action,reason,after_state,result,metadata
  )
  values(
    v_inv.invited_by,p_user_id,'INVITE_ACCEPTED','single-use governed platform invitation',
    jsonb_build_object(
      'authority_role',v_after.role,
      'role_code',v_after.role_code,
      'permissions',v_after.permissions,
      'granular_permissions',v_after.granular_permissions,
      'access_scope',v_after.access_scope,
      'access_expires_at',v_after.access_expires_at,
      'mfa_required',v_after.mfa_required,
      'approval_limit_aed',v_after.approval_limit_aed
    ),
    'SUCCESS',
    jsonb_build_object('invitation_id',v_inv.id,'accepted_generation',p_generation)
  );

  return jsonb_build_object(
    'accepted',true,
    'user_id',p_user_id,
    'role','OWNER_DELEGATE',
    'role_code',v_after.role_code
  );
exception when others then
  insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,result,metadata)
  values(v_inv.invited_by,p_user_id,'INVITE_ACCEPT_FAILED',left(sqlerrm,500),'FAILED',jsonb_build_object('invitation_id',p_invitation_id));
  return jsonb_build_object('accepted',false,'reason','INVITATION_ACCEPT_FAILED');
end;
$$;

create or replace function public.dabbir_platform_staff_invite_accept_v1(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_inv dabbir_private.platform_staff_invitations%rowtype;
begin
  select * into v_inv
  from dabbir_private.platform_staff_invitations
  where token_hash=p_token_hash;
  if not found then return jsonb_build_object('accepted',false,'reason','INVITATION_INVALID'); end if;
  return public.dabbir_platform_staff_accept_for_user_v2(v_inv.target_user_id,v_inv.id,v_inv.generation);
end;
$$;

create or replace function public.dabbir_platform_staff_accept_for_user_v1(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_inv dabbir_private.platform_staff_invitations%rowtype;
begin
  select * into v_inv
  from dabbir_private.platform_staff_invitations
  where target_user_id=p_user_id
    and status='PENDING'
    and revoked_at is null
    and accepted_at is null
    and expires_at>now()
  order by created_at desc
  limit 1;
  if not found then return jsonb_build_object('accepted',false,'reason','NO_PENDING_INVITATION'); end if;
  return public.dabbir_platform_staff_accept_for_user_v2(p_user_id,v_inv.id,v_inv.generation);
end;
$$;

create or replace function public.dabbir_platform_login_identity_v1(p_login text)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth','dabbir_private'
as $$
declare
  v_login text:=lower(trim(coalesce(p_login,'')));
  v_result jsonb;
begin
  if v_login in ('barmanadmin','__root__') then
    select jsonb_build_object(
      'user_id',a.user_id,
      'email',lower(u.email),
      'authority_role',a.role,
      'display_name',a.display_name,
      'permissions',a.permissions,
      'invitation_id',null,
      'invitation_generation',null
    )
    into v_result
    from public.dabbir_platform_admins a
    join auth.users u on u.id=a.user_id
    where a.role='ROOT_OWNER'
      and dabbir_private.platform_admin_is_active(a.user_id)
    limit 1;
  elsif position('@' in v_login)>1 then
    select jsonb_build_object(
      'user_id',a.user_id,
      'email',lower(u.email),
      'authority_role',a.role,
      'display_name',a.display_name,
      'permissions',a.permissions,
      'invitation_id',null,
      'invitation_generation',null
    )
    into v_result
    from public.dabbir_platform_admins a
    join auth.users u on u.id=a.user_id
    where lower(u.email)=v_login
      and a.role='OWNER_DELEGATE'
      and dabbir_private.platform_admin_is_active(a.user_id)
    limit 1;

    if v_result is null then
      select jsonb_build_object(
        'user_id',i.target_user_id,
        'email',lower(i.email),
        'authority_role','OWNER_DELEGATE',
        'display_name',i.display_name,
        'permissions',i.permissions,
        'invitation_id',i.id,
        'invitation_generation',i.generation
      )
      into v_result
      from dabbir_private.platform_staff_invitations i
      join auth.users u on u.id=i.target_user_id and lower(u.email)=lower(i.email)
      where lower(i.email)=v_login
        and i.status='PENDING'
        and i.revoked_at is null
        and i.accepted_at is null
        and i.expires_at>now()
      order by i.created_at desc
      limit 1;
    end if;
  end if;

  return coalesce(v_result,jsonb_build_object('found',false));
end;
$$;

create or replace function public.dabbir_platform_staff_list_v2(p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth','dabbir_private'
as $$
declare
  v_staff jsonb;
  v_invites jsonb;
begin
  if not dabbir_private.platform_effective_capability(p_actor,'team.view') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:team.view';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',a.user_id,
    'email',u.email,
    'display_name',a.display_name,
    'role',a.role,
    'role_code',a.role_code,
    'permissions',case when a.role='ROOT_OWNER' then '[]'::jsonb else to_jsonb(a.permissions) end,
    'granular_permissions',case when a.role='ROOT_OWNER' then '[]'::jsonb else to_jsonb(a.granular_permissions) end,
    'access_scope',a.access_scope,
    'access_expires_at',a.access_expires_at,
    'mfa_required',a.mfa_required,
    'approval_limit_aed',a.approval_limit_aed,
    'active',a.active,
    'last_login_at',u.last_sign_in_at,
    'last_activity_at',(select max(s.last_seen_at) from dabbir_private.owner_sessions s where s.actor_user_id=a.user_id),
    'active_sessions',(select count(*) from dabbir_private.owner_sessions s where s.actor_user_id=a.user_id and s.revoked_at is null and s.expires_at>now()),
    'invited_at',a.created_at,
    'added_by',a.added_by,
    'suspended_at',a.suspended_at,
    'revoked_at',a.revoked_at,
    'last_access_reviewed_at',a.last_access_reviewed_at
  ) order by (a.role='ROOT_OWNER') desc,a.created_at),'[]'::jsonb)
  into v_staff
  from public.dabbir_platform_admins a
  join auth.users u on u.id=a.user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,
    'email',i.email,
    'display_name',i.display_name,
    'target_user_id',i.target_user_id,
    'permissions',i.permissions,
    'granular_permissions',i.granular_permissions,
    'preset',i.preset,
    'role_code',i.role_code,
    'access_scope',i.access_scope,
    'access_expires_at',i.access_expires_at,
    'mfa_required',i.mfa_required,
    'approval_limit_aed',i.approval_limit_aed,
    'status',case when i.status='PENDING' and i.expires_at<=now() then 'EXPIRED' else i.status end,
    'invited_by',i.invited_by,
    'expires_at',i.expires_at,
    'accepted_at',i.accepted_at,
    'revoked_at',i.revoked_at,
    'revoked_by',i.revoked_by,
    'revocation_reason',i.revocation_reason,
    'delivery_status',i.delivery_status,
    'delivery_attempts',i.delivery_attempts,
    'delivery_provider',i.delivery_provider,
    'delivery_attempted_at',i.delivery_attempted_at,
    'delivery_error_code',i.delivery_error_code,
    'generation',i.generation,
    'resend_count',i.resend_count,
    'last_resent_at',i.last_resent_at,
    'created_at',i.created_at,
    'updated_at',i.updated_at
  ) order by i.created_at desc),'[]'::jsonb)
  into v_invites
  from dabbir_private.platform_staff_invitations i;

  return jsonb_build_object(
    'staff',v_staff,
    'invitations',v_invites,
    'roles',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'code',r.code,
        'name_ar',r.name_ar,
        'name_en',r.name_en,
        'description',r.description,
        'permissions',to_jsonb(dabbir_private.platform_role_permissions_v1(r.code))
      ) order by r.code),'[]'::jsonb)
      from dabbir_private.platform_roles r
    )
  );
end;
$$;

revoke all on function dabbir_private.platform_scope_shape_valid_v2(jsonb) from public,anon,authenticated;
revoke all on function dabbir_private.platform_scope_grant_allowed_v2(uuid,jsonb) from public,anon,authenticated;
revoke all on function dabbir_private.platform_assert_scope_grant_v2(uuid,jsonb) from public,anon,authenticated;
revoke all on function dabbir_private.platform_invite_granular_for_role_v2(text,text[]) from public,anon,authenticated;
revoke all on function dabbir_private.platform_assert_invite_grant_v2(uuid,text[],text[],jsonb,timestamptz,numeric) from public,anon,authenticated;

revoke all on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_resend_v2(uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_revoke_v2(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_revoke_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_delivery_v2(uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_accept_for_user_v2(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_accept_v1(text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_accept_for_user_v1(uuid) from public,anon,authenticated;
revoke all on function public.dabbir_platform_login_identity_v1(text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_list_v2(uuid) from public,anon,authenticated;

grant execute on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) to service_role;
grant execute on function public.dabbir_platform_staff_invite_resend_v2(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.dabbir_platform_staff_invite_revoke_v2(uuid,uuid,text) to service_role;
grant execute on function public.dabbir_platform_staff_invite_revoke_v1(uuid,uuid,text) to service_role;
grant execute on function public.dabbir_platform_staff_invite_delivery_v2(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.dabbir_platform_staff_accept_for_user_v2(uuid,uuid,integer) to service_role;
grant execute on function public.dabbir_platform_staff_invite_accept_v1(text) to service_role;
grant execute on function public.dabbir_platform_staff_accept_for_user_v1(uuid) to service_role;
grant execute on function public.dabbir_platform_login_identity_v1(text) to service_role;
grant execute on function public.dabbir_platform_staff_list_v2(uuid) to service_role;
