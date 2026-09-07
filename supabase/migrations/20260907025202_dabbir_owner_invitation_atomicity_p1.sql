-- P1: atomic OTP completion, invitation concurrency and policy containment.
-- No customer data, ROOT_OWNER rows or secrets are changed by this migration.
-- Existing authority tables and invitation RPCs remain authoritative.
set lock_timeout='5s';

create or replace function dabbir_private.platform_assert_mfa_grant_v1(p_actor uuid,p_required boolean)
returns void language plpgsql security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare v_actor public.dabbir_platform_admins%rowtype;
begin
  select * into v_actor from public.dabbir_platform_admins
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor) for share;
  if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;
  if v_actor.role<>'ROOT_OWNER' and v_actor.mfa_required and not coalesce(p_required,false) then
    raise exception 'DABBIR_MFA_POLICY_GRANT_WEAKENS_ACTOR';
  end if;
end;
$$;
revoke all on function dabbir_private.platform_assert_mfa_grant_v1(uuid,boolean) from public,anon,authenticated;


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
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor)
  for share;
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
  -- Serialize invitations for the same auth identity without changing that identity.
  perform 1 from auth.users where id=p_target_user_id for no key update;
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
  perform dabbir_private.platform_assert_mfa_grant_v1(p_actor,p_mfa_required);
  if exists(select 1 from public.dabbir_platform_admins where user_id=p_target_user_id) then
    raise exception 'DABBIR_PLATFORM_EMPLOYEE_ALREADY_EXISTS';
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

  perform 1 from auth.users where id=p_user_id for no key update;
  if exists(select 1 from public.dabbir_platform_admins where user_id=p_user_id) then
    return jsonb_build_object('accepted',false,'reason','PLATFORM_EMPLOYEE_ALREADY_EXISTS');
  end if;

  begin
    perform dabbir_private.platform_assert_mfa_grant_v1(v_inv.invited_by,v_inv.mfa_required);
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
  );

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

  perform dabbir_private.platform_assert_mfa_grant_v1(v_inv.invited_by,v_inv.mfa_required);
  perform dabbir_private.platform_assert_mfa_grant_v1(p_actor,v_inv.mfa_required);
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

create or replace function public.dabbir_platform_staff_invite_delivery_v3(
  p_actor uuid,
  p_invitation_id uuid,
  p_status text,
  p_provider text,
  p_provider_message_id text,
  p_error_code text,
  p_generation integer
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

  if p_generation is null or p_generation<>v_inv.generation then
    raise exception 'DABBIR_INVITATION_GENERATION_STALE';
  end if;
  if v_inv.delivery_status<>'PREPARED' then
    raise exception 'DABBIR_INVITATION_DELIVERY_ALREADY_RECORDED';
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
    jsonb_build_object('invitation_id',v_inv.id,'generation',v_inv.generation,'provider_message_id',v_message_id)
  );

  return jsonb_build_object(
    'id',v_inv.id,
    'delivery_status',v_status,
    'delivery_attempts',v_inv.delivery_attempts+1
  );
end;
$$;


-- Old unbound RPCs cannot silently select a newer invitation or write a stale delivery result.
create or replace function public.dabbir_platform_staff_accept_for_user_v1(p_user_id uuid)
returns jsonb language sql security definer set search_path='pg_catalog'
as $$ select jsonb_build_object('accepted',false,'reason','INVITATION_GENERATION_REQUIRED') $$;
create or replace function public.dabbir_platform_staff_invite_create_v1(
 p_actor uuid,p_target_user_id uuid,p_email text,p_display_name text,p_permissions text[],p_preset text,p_token_hash text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path='pg_catalog'
as $$ begin raise exception 'DABBIR_INVITATION_V2_REQUIRED'; end; $$;
create or replace function public.dabbir_platform_staff_invite_delivery_v2(
 p_actor uuid,p_invitation_id uuid,p_status text,p_provider text,p_provider_message_id text,p_error_code text)
returns jsonb language plpgsql security definer set search_path='pg_catalog'
as $$ begin raise exception 'DABBIR_INVITATION_GENERATION_REQUIRED'; end; $$;

create or replace function public.dabbir_owner_session_issue_v1(p_actor_user_id uuid,p_token_hash text,p_expires_at timestamptz)
returns void language plpgsql security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare v_admin public.dabbir_platform_admins%rowtype;
begin
  if p_actor_user_id is null or nullif(trim(p_token_hash),'') is null or p_expires_at is null
     or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '12 hours' then
    raise exception 'INVALID_OWNER_SESSION';
  end if;
  select * into v_admin from public.dabbir_platform_admins
  where user_id=p_actor_user_id and dabbir_private.platform_admin_is_active(p_actor_user_id) for share;
  if not found then raise exception 'DABBIR_PLATFORM_IDENTITY_REQUIRED'; end if;
  if v_admin.mfa_required then raise exception 'MFA_REQUIRED_NOT_CONFIGURED'; end if;
  insert into dabbir_private.owner_sessions(actor_user_id,token_hash,expires_at,last_seen_at)
  values(p_actor_user_id,p_token_hash,least(p_expires_at,coalesce(v_admin.access_expires_at,p_expires_at)),clock_timestamp());
end;
$$;

create or replace function public.dabbir_owner_otp_complete_v1(
 p_challenge_id uuid,p_otp_hash text,p_session_token_hash text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare v_challenge public.dabbir_owner_otp_challenges%rowtype; v_accepted jsonb; v_error text;
begin
  select * into v_challenge from public.dabbir_owner_otp_challenges where id=p_challenge_id for update;
  if not found or v_challenge.actor_user_id is null or v_challenge.consumed_at is not null
     or v_challenge.expires_at<=clock_timestamp() or v_challenge.attempts>=5 then
    return jsonb_build_object('authenticated',false,'error','INVALID_OWNER_OTP');
  end if;
  update public.dabbir_owner_otp_challenges set attempts=attempts+1 where id=p_challenge_id;
  if p_otp_hash is null or p_otp_hash<>v_challenge.otp_hash then
    return jsonb_build_object('authenticated',false,'error','INVALID_OWNER_OTP');
  end if;
  update public.dabbir_owner_otp_challenges set consumed_at=clock_timestamp() where id=p_challenge_id;
  -- A failed session insert rolls back acceptance as well; the OTP remains spent.
  begin
    if v_challenge.invitation_id is not null then
      v_accepted:=public.dabbir_platform_staff_accept_for_user_v2(
        v_challenge.actor_user_id,v_challenge.invitation_id,v_challenge.invitation_generation);
      if coalesce((v_accepted->>'accepted')::boolean,false) is not true then
        return jsonb_build_object('authenticated',false,'error','INVITATION_ACCEPT_FAILED',
          'reason',v_accepted->>'reason');
      end if;
    end if;
    perform public.dabbir_owner_session_issue_v1(v_challenge.actor_user_id,p_session_token_hash,p_expires_at);
  exception when others then
    v_error:=case when sqlerrm='MFA_REQUIRED_NOT_CONFIGURED' then sqlerrm else 'OWNER_AUTH_UNAVAILABLE' end;
  end;
  if v_error is not null then
    return jsonb_build_object('authenticated',false,'error',v_error);
  end if;
  return jsonb_build_object('authenticated',true);
end;
$$;

revoke all on function public.dabbir_owner_otp_complete_v1(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_owner_otp_complete_v1(uuid,text,text,timestamptz) to service_role;
revoke all on function public.dabbir_platform_staff_invite_delivery_v3(uuid,uuid,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.dabbir_platform_staff_invite_delivery_v3(uuid,uuid,text,text,text,text,integer) to service_role;
