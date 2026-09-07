-- DABBIR Owner Executive Command Center / P1 invitation lifecycle reconciliation.
-- Restore the canonical 20260906001200 create contract after the later applied foundation
-- migration temporarily replaced it. generation remains the authoritative replay boundary.

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

revoke all on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) from public,anon,authenticated;
grant execute on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) to service_role;

comment on column dabbir_private.platform_staff_invitations.token_generation is
  'Deprecated duplicate introduced by 20260906001500; generation is authoritative. Remove only after dependency/data review.';
