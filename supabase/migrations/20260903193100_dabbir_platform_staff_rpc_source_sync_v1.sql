begin;

create or replace function public.dabbir_platform_auth_user_by_email_v1(p_email text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','auth' as $$
declare v jsonb;
begin
  select jsonb_build_object('user_id',u.id,'email',lower(u.email),'last_sign_in_at',u.last_sign_in_at)
  into v from auth.users u where lower(u.email)=lower(trim(coalesce(p_email,''))) limit 1;
  return coalesce(v,jsonb_build_object('found',false));
end;
$$;

create or replace function public.dabbir_platform_staff_invite_create_v1(
  p_actor uuid,p_target_user_id uuid,p_email text,p_display_name text,p_permissions text[],p_preset text,p_token_hash text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
declare v_id uuid;
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_employees');
  perform dabbir_private.platform_assert_can_grant(p_actor,p_permissions);
  if p_actor=p_target_user_id then raise exception 'DABBIR_SELF_INVITE_FORBIDDEN'; end if;
  if p_expires_at<=now() then raise exception 'DABBIR_INVITE_EXPIRY_INVALID'; end if;
  if nullif(trim(p_email),'') is null or nullif(trim(p_token_hash),'') is null then raise exception 'DABBIR_INVITE_INVALID'; end if;
  if not exists(select 1 from auth.users where id=p_target_user_id and lower(email)=lower(trim(p_email))) then raise exception 'DABBIR_INVITE_USER_EMAIL_MISMATCH'; end if;
  if exists(select 1 from public.dabbir_platform_admins where user_id=p_target_user_id and role='ROOT_OWNER') then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;
  update dabbir_private.platform_staff_invitations set status='REVOKED',revoked_at=now(),updated_at=now()
    where lower(email)=lower(trim(p_email)) and status='PENDING';
  insert into dabbir_private.platform_staff_invitations(email,display_name,target_user_id,permissions,preset,token_hash,invited_by,expires_at)
  values(lower(trim(p_email)),nullif(trim(p_display_name),''),p_target_user_id,coalesce(p_permissions,'{}'::text[]),coalesce(nullif(trim(p_preset),''),'custom'),p_token_hash,p_actor,p_expires_at)
  returning id into v_id;
  insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,after_state,result,metadata)
  values(p_actor,p_target_user_id,'EMPLOYEE_INVITED','platform employee invitation',jsonb_build_object('role','OWNER_DELEGATE','permissions',p_permissions,'preset',p_preset,'invitation_id',v_id),'SUCCESS',jsonb_build_object('email',lower(trim(p_email))));
  return jsonb_build_object('id',v_id,'status','PENDING','expires_at',p_expires_at);
end;
$$;

create or replace function public.dabbir_platform_staff_invite_accept_v1(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_inv dabbir_private.platform_staff_invitations%rowtype;
begin
  select * into v_inv from dabbir_private.platform_staff_invitations where token_hash=p_token_hash for update;
  if not found or v_inv.status<>'PENDING' or v_inv.revoked_at is not null or v_inv.accepted_at is not null then raise exception 'DABBIR_INVITATION_INVALID'; end if;
  if v_inv.expires_at<=now() then
    update dabbir_private.platform_staff_invitations set status='EXPIRED',updated_at=now() where id=v_inv.id;
    raise exception 'DABBIR_INVITATION_EXPIRED';
  end if;
  if exists(select 1 from public.dabbir_platform_admins where user_id=v_inv.target_user_id and role='ROOT_OWNER') then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;
  insert into public.dabbir_platform_admins(user_id,role,active,permissions,display_name,added_by,updated_at)
  values(v_inv.target_user_id,'OWNER_DELEGATE',true,v_inv.permissions,v_inv.display_name,v_inv.invited_by,now())
  on conflict(user_id) do update set role='OWNER_DELEGATE',active=true,permissions=excluded.permissions,display_name=excluded.display_name,added_by=excluded.added_by,updated_at=now(),suspended_at=null,revoked_at=null;
  update dabbir_private.platform_staff_invitations set status='ACCEPTED',accepted_at=now(),updated_at=now() where id=v_inv.id;
  insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,after_state,result,metadata)
  values(v_inv.invited_by,v_inv.target_user_id,'EMPLOYEE_INVITE_ACCEPTED','single-use platform invitation',jsonb_build_object('role','OWNER_DELEGATE','permissions',v_inv.permissions),'SUCCESS',jsonb_build_object('invitation_id',v_inv.id));
  return jsonb_build_object('accepted',true,'user_id',v_inv.target_user_id,'role','OWNER_DELEGATE');
end;
$$;

create or replace function public.dabbir_platform_staff_list_v1(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
declare v_result jsonb;
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_employees');
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',a.user_id,'email',u.email,'display_name',a.display_name,'role',a.role,
    'permissions',case when a.role='ROOT_OWNER' then '[]'::jsonb else to_jsonb(a.permissions) end,
    'active',a.active,'last_login_at',u.last_sign_in_at,
    'last_activity_at',(select max(s.last_seen_at) from dabbir_private.owner_sessions s where s.actor_user_id=a.user_id),
    'invited_at',a.created_at,'added_by',a.added_by,'suspended_at',a.suspended_at,'revoked_at',a.revoked_at
  ) order by (a.role='ROOT_OWNER') desc,a.created_at),'[]'::jsonb) into v_result
  from public.dabbir_platform_admins a join auth.users u on u.id=a.user_id;
  return v_result;
end;
$$;

create or replace function public.dabbir_platform_staff_list_v2(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
declare v_staff jsonb; v_invites jsonb;
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_employees');
  v_staff:=public.dabbir_platform_staff_list_v1(p_actor);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'email',i.email,'display_name',i.display_name,'target_user_id',i.target_user_id,'permissions',i.permissions,'preset',i.preset,'status',i.status,
    'invited_by',i.invited_by,'expires_at',i.expires_at,'accepted_at',i.accepted_at,'revoked_at',i.revoked_at,'delivery_status',i.delivery_status,'delivery_attempts',i.delivery_attempts,
    'created_at',i.created_at,'updated_at',i.updated_at
  ) order by i.created_at desc),'[]'::jsonb) into v_invites from dabbir_private.platform_staff_invitations i;
  return jsonb_build_object('staff',v_staff,'invitations',v_invites);
end;
$$;

create or replace function public.dabbir_platform_staff_update_v1(p_actor uuid,p_target uuid,p_action text,p_permissions text[] default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_before public.dabbir_platform_admins%rowtype; v_after public.dabbir_platform_admins%rowtype; v_action text:=upper(trim(coalesce(p_action,'')));
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_employees');
  select * into v_before from public.dabbir_platform_admins where user_id=p_target for update;
  if not found then raise exception 'DABBIR_PLATFORM_EMPLOYEE_NOT_FOUND'; end if;
  if v_before.role='ROOT_OWNER' then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;
  if p_actor=p_target and v_action in ('SET_PERMISSIONS','SUSPEND','REMOVE','REVOKE_SESSIONS') then raise exception 'DABBIR_SELF_PRIVILEGE_CHANGE_FORBIDDEN'; end if;
  if v_action='SET_PERMISSIONS' then
    perform dabbir_private.platform_assert_can_grant(p_actor,p_permissions);
    update public.dabbir_platform_admins set permissions=coalesce(p_permissions,'{}'::text[]),updated_at=now() where user_id=p_target;
  elsif v_action='SUSPEND' then
    update public.dabbir_platform_admins set active=false,suspended_at=now(),updated_at=now() where user_id=p_target;
    update dabbir_private.owner_sessions set revoked_at=now() where actor_user_id=p_target and revoked_at is null;
  elsif v_action='REACTIVATE' then
    update public.dabbir_platform_admins set active=true,suspended_at=null,revoked_at=null,updated_at=now() where user_id=p_target;
  elsif v_action='REVOKE_SESSIONS' then
    update dabbir_private.owner_sessions set revoked_at=now() where actor_user_id=p_target and revoked_at is null;
  elsif v_action='REMOVE' then
    update public.dabbir_platform_admins set active=false,revoked_at=now(),updated_at=now() where user_id=p_target;
    update dabbir_private.owner_sessions set revoked_at=now() where actor_user_id=p_target and revoked_at is null;
  else raise exception 'DABBIR_PLATFORM_EMPLOYEE_ACTION_INVALID'; end if;
  select * into v_after from public.dabbir_platform_admins where user_id=p_target;
  insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,before_state,after_state,result)
  values(p_actor,p_target,v_action,left(coalesce(p_reason,''),500),to_jsonb(v_before)-'user_id',to_jsonb(v_after)-'user_id','SUCCESS');
  return jsonb_build_object('user_id',p_target,'role',v_after.role,'permissions',v_after.permissions,'active',v_after.active,'suspended_at',v_after.suspended_at,'revoked_at',v_after.revoked_at);
end;
$$;

create or replace function public.dabbir_platform_staff_invite_delivery_v1(p_invitation_id uuid,p_status text)
returns void language plpgsql security definer set search_path='pg_catalog','dabbir_private' as $$
begin
  if upper(trim(p_status)) not in('SENT','FAILED') then raise exception 'DABBIR_INVITE_DELIVERY_STATUS_INVALID'; end if;
  update dabbir_private.platform_staff_invitations set delivery_status=upper(trim(p_status)),delivery_attempts=delivery_attempts+1,updated_at=now() where id=p_invitation_id;
  if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.dabbir_platform_auth_user_by_email_v1(text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_create_v1(uuid,uuid,text,text,text[],text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_accept_v1(text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_list_v1(uuid) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_list_v2(uuid) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_update_v1(uuid,uuid,text,text[],text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_delivery_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_auth_user_by_email_v1(text) to service_role;
grant execute on function public.dabbir_platform_staff_invite_create_v1(uuid,uuid,text,text,text[],text,text,timestamptz) to service_role;
grant execute on function public.dabbir_platform_staff_invite_accept_v1(text) to service_role;
grant execute on function public.dabbir_platform_staff_list_v1(uuid) to service_role;
grant execute on function public.dabbir_platform_staff_list_v2(uuid) to service_role;
grant execute on function public.dabbir_platform_staff_update_v1(uuid,uuid,text,text[],text) to service_role;
grant execute on function public.dabbir_platform_staff_invite_delivery_v1(uuid,text) to service_role;

commit;
