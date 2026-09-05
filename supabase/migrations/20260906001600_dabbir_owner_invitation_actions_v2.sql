-- DABBIR Owner Executive Command Center / P1 Invitation Lifecycle v2 — resend, revoke, delivery

create or replace function public.dabbir_platform_staff_invite_resend_v2(
  p_actor uuid,
  p_invitation_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_inv dabbir_private.platform_staff_invitations%rowtype;
  v_actor_role text;
  v_auth jsonb;
begin
  if nullif(trim(p_token_hash),'') is null then raise exception 'DABBIR_INVITE_INVALID'; end if;
  if p_expires_at is null or p_expires_at<=now() then raise exception 'DABBIR_INVITE_EXPIRY_INVALID'; end if;
  if not dabbir_private.platform_effective_capability(p_actor,'team.invite') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:team.invite';
  end if;

  select role into v_actor_role
  from public.dabbir_platform_admins
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
  if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;

  select * into v_inv
  from dabbir_private.platform_staff_invitations
  where id=p_invitation_id
  for update;
  if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
  if v_inv.status<>'PENDING' or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    raise exception 'DABBIR_INVITATION_NOT_PENDING';
  end if;
  if v_actor_role<>'ROOT_OWNER' and v_inv.invited_by<>p_actor then
    raise exception 'DABBIR_INVITATION_MANAGEMENT_FORBIDDEN';
  end if;

  v_auth:=dabbir_private.platform_invitation_grant_v2(
    v_inv.invited_by,v_inv.role_code,v_inv.granular_permissions,v_inv.access_scope,
    v_inv.access_expires_at,v_inv.mfa_required,v_inv.approval_limit_aed
  );

  update dabbir_private.platform_staff_invitations
  set token_hash=p_token_hash,
      token_generation=token_generation+1,
      resend_count=resend_count+1,
      last_resent_at=now(),
      expires_at=p_expires_at,
      delivery_status='PREPARED',
      delivery_provider=null,
      delivery_attempted_at=null,
      provider_message_id=null,
      delivery_error_code=null,
      updated_at=now()
  where id=p_invitation_id;

  insert into dabbir_private.platform_staff_audit(
    actor_user_id,target_user_id,action,reason,before_state,after_state,result,metadata
  ) values(
    p_actor,v_inv.target_user_id,'INVITE_RESENT','invitation delivery rotated',
    jsonb_build_object('token_generation',v_inv.token_generation,'expires_at',v_inv.expires_at,'resend_count',v_inv.resend_count),
    jsonb_build_object('token_generation',v_inv.token_generation+1,'expires_at',p_expires_at,'resend_count',v_inv.resend_count+1),
    'SUCCESS',jsonb_build_object('invitation_id',p_invitation_id,'sponsor',v_inv.invited_by)
  );

  return jsonb_build_object(
    'id',p_invitation_id,'status','PENDING','email',v_inv.email,'display_name',v_inv.display_name,
    'expires_at',p_expires_at,'token_generation',v_inv.token_generation+1,
    'resend_count',v_inv.resend_count+1,'delivery_status','PREPARED'
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
  v_reason text:=left(trim(coalesce(p_reason,'')),500);
begin
  if v_reason='' then raise exception 'DABBIR_INVITATION_REVOKE_REASON_REQUIRED'; end if;
  if not dabbir_private.platform_effective_capability(p_actor,'team.invite') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:team.invite';
  end if;

  select role into v_actor_role
  from public.dabbir_platform_admins
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
  if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;

  select * into v_inv
  from dabbir_private.platform_staff_invitations
  where id=p_invitation_id
  for update;
  if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
  if v_inv.status<>'PENDING' or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    raise exception 'DABBIR_INVITATION_NOT_PENDING';
  end if;
  if v_actor_role<>'ROOT_OWNER' and v_inv.invited_by<>p_actor then
    raise exception 'DABBIR_INVITATION_MANAGEMENT_FORBIDDEN';
  end if;

  update dabbir_private.platform_staff_invitations
  set status='REVOKED',
      revoked_at=now(),
      revoked_by=p_actor,
      revocation_reason=v_reason,
      token_generation=token_generation+1,
      token_hash='revoked:'||id::text||':'||(token_generation+1)::text,
      updated_at=now()
  where id=p_invitation_id;

  insert into dabbir_private.platform_staff_audit(
    actor_user_id,target_user_id,action,reason,before_state,after_state,result,metadata
  ) values(
    p_actor,v_inv.target_user_id,'INVITE_REVOKED',v_reason,
    jsonb_build_object('status',v_inv.status,'token_generation',v_inv.token_generation,'expires_at',v_inv.expires_at),
    jsonb_build_object('status','REVOKED','token_generation',v_inv.token_generation+1,'revoked_at',now()),
    'SUCCESS',jsonb_build_object('invitation_id',p_invitation_id,'sponsor',v_inv.invited_by)
  );

  return jsonb_build_object('id',p_invitation_id,'status','REVOKED','revoked',true);
end;
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
  v_actor_role text;
begin
  if v_status not in ('SENT','FAILED') then raise exception 'DABBIR_INVITE_DELIVERY_STATUS_INVALID'; end if;
  if not dabbir_private.platform_effective_capability(p_actor,'team.invite') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:team.invite';
  end if;
  select role into v_actor_role
  from public.dabbir_platform_admins
  where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
  if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;

  select * into v_inv
  from dabbir_private.platform_staff_invitations
  where id=p_invitation_id
  for update;
  if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
  if v_actor_role<>'ROOT_OWNER' and v_inv.invited_by<>p_actor then
    raise exception 'DABBIR_INVITATION_MANAGEMENT_FORBIDDEN';
  end if;

  update dabbir_private.platform_staff_invitations
  set delivery_status=v_status,
      delivery_attempts=delivery_attempts+1,
      delivery_provider=nullif(trim(coalesce(p_provider,'')),''),
      delivery_attempted_at=now(),
      provider_message_id=case when v_status='SENT' then nullif(trim(coalesce(p_provider_message_id,'')),'') else null end,
      delivery_error_code=case when v_status='FAILED' then nullif(trim(coalesce(p_error_code,'')),'') else null end,
      updated_at=now()
  where id=p_invitation_id;

  insert into dabbir_private.platform_staff_audit(
    actor_user_id,target_user_id,action,reason,before_state,after_state,result,metadata
  ) values(
    p_actor,v_inv.target_user_id,
    case when v_status='SENT' then 'INVITE_DELIVERED' else 'INVITE_DELIVERY_FAILED' end,
    case when v_status='FAILED' then left(coalesce(p_error_code,'DELIVERY_FAILED'),500) else 'email delivered' end,
    jsonb_build_object('delivery_status',v_inv.delivery_status,'delivery_attempts',v_inv.delivery_attempts),
    jsonb_build_object('delivery_status',v_status,'delivery_attempts',v_inv.delivery_attempts+1,'provider',nullif(trim(coalesce(p_provider,'')),'')),
    case when v_status='SENT' then 'SUCCESS' else 'FAILED' end,
    jsonb_build_object('invitation_id',p_invitation_id)
  );

  return jsonb_build_object('id',p_invitation_id,'delivery_status',v_status,'delivery_attempts',v_inv.delivery_attempts+1);
end;
$$;

revoke all on function public.dabbir_platform_staff_invite_resend_v2(uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_revoke_v2(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_delivery_v2(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_staff_invite_resend_v2(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.dabbir_platform_staff_invite_revoke_v2(uuid,uuid,text) to service_role;
grant execute on function public.dabbir_platform_staff_invite_delivery_v2(uuid,uuid,text,text,text,text) to service_role;
