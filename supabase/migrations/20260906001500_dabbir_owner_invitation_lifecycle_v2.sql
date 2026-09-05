-- DABBIR Owner Executive Command Center / P1 Invitation Lifecycle v2
-- Fail-closed invitation authority, scope containment, rotation and exact acceptance.

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

alter table dabbir_private.owner_otp_challenges
  add column if not exists invitation_generation integer;

alter table dabbir_private.platform_staff_invitations drop constraint if exists platform_staff_invitations_token_generation_check;
alter table dabbir_private.platform_staff_invitations add constraint platform_staff_invitations_token_generation_check check (token_generation >= 1);
alter table dabbir_private.platform_staff_invitations drop constraint if exists platform_staff_invitations_resend_count_check;
alter table dabbir_private.platform_staff_invitations add constraint platform_staff_invitations_resend_count_check check (resend_count >= 0);

create or replace function dabbir_private.platform_scope_contains_v1(p_actor uuid,p_requested jsonb)
returns boolean language plpgsql stable set search_path='pg_catalog','public','dabbir_private' as $$
declare v_actor public.dabbir_platform_admins%rowtype; v_actor_type text; v_requested_type text; v_region text; v_ids jsonb;
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
 select * into v_actor from public.dabbir_platform_admins where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
 if not found then return false; end if;
 if v_actor.role='ROOT_OWNER' then return true; end if;
 v_actor_type:=upper(coalesce(v_actor.access_scope->>'type',''));
 if v_actor_type='ALL_BUSINESSES' then return true; end if;
 if v_requested_type='ALL_BUSINESSES' then return false; end if;
 if v_requested_type='SPECIFIC_BUSINESS' then return dabbir_private.platform_scope_allows_business(p_actor,(p_requested->>'business_id')::uuid); end if;
 if v_requested_type='ASSIGNED_BUSINESSES_ONLY' then
   return not exists(select 1 from jsonb_array_elements_text(v_ids) as t(value) where not dabbir_private.platform_scope_allows_business(p_actor,value::uuid));
 end if;
 if v_requested_type='SPECIFIC_REGION' then
   return v_actor_type='SPECIFIC_REGION' and upper(coalesce(v_actor.access_scope->>'region_code',v_actor.access_scope->>'country_code',''))=v_region;
 end if;
 if v_requested_type='OWN_TASKS_ONLY' then return v_actor_type='OWN_TASKS_ONLY'; end if;
 return false;
exception when others then return false;
end;
$$;

create or replace function dabbir_private.platform_invitation_grant_v2(p_actor uuid,p_role_code text,p_requested_granular text[],p_access_scope jsonb,p_access_expires_at timestamptz,p_mfa_required boolean,p_approval_limit_aed numeric)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_actor public.dabbir_platform_admins%rowtype; v_role text:=upper(trim(coalesce(p_role_code,'CUSTOM'))); v_granular text[]; v_coarse text[];
begin
 select * into v_actor from public.dabbir_platform_admins where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor) for share;
 if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;
 if not dabbir_private.platform_effective_capability(p_actor,'team.invite') then raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:team.invite'; end if;
 if v_role not in ('EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR','CUSTOM') then raise exception 'DABBIR_ROLE_CODE_INVALID'; end if;
 if v_role='CUSTOM' then
   v_granular:=coalesce(p_requested_granular,'{}'::text[]);
   if cardinality(v_granular)=0 then raise exception 'DABBIR_GRANULAR_PERMISSIONS_REQUIRED'; end if;
 else
   v_granular:=dabbir_private.platform_role_permissions_v1(v_role);
 end if;
 if not dabbir_private.platform_granular_permissions_valid(v_granular) then raise exception 'DABBIR_INVALID_GRANULAR_PERMISSION'; end if;
 perform dabbir_private.platform_assert_can_grant_granular(p_actor,v_granular);
 v_coarse:=dabbir_private.platform_coarse_permissions_for_role(v_role,v_granular);
 perform dabbir_private.platform_assert_can_grant(p_actor,v_coarse);
 if not dabbir_private.platform_scope_contains_v1(p_actor,p_access_scope) then raise exception 'DABBIR_SCOPE_GRANT_EXCEEDS_ACTOR'; end if;
 if p_access_expires_at is not null and p_access_expires_at<=now() then raise exception 'DABBIR_ACCESS_EXPIRY_INVALID'; end if;
 if p_approval_limit_aed is not null and p_approval_limit_aed<0 then raise exception 'DABBIR_APPROVAL_LIMIT_INVALID'; end if;
 if v_actor.role<>'ROOT_OWNER' then
   if v_actor.access_expires_at is not null and (p_access_expires_at is null or p_access_expires_at>v_actor.access_expires_at) then raise exception 'DABBIR_ACCESS_EXPIRY_GRANT_EXCEEDS_ACTOR'; end if;
   if p_approval_limit_aed is not null and (v_actor.approval_limit_aed is null or p_approval_limit_aed>v_actor.approval_limit_aed) then raise exception 'DABBIR_APPROVAL_LIMIT_GRANT_EXCEEDS_ACTOR'; end if;
   if coalesce(v_actor.mfa_required,false) and not coalesce(p_mfa_required,false) then raise exception 'DABBIR_MFA_POLICY_GRANT_WEAKENS_ACTOR'; end if;
 end if;
 return jsonb_build_object('role_code',v_role,'granular_permissions',to_jsonb(v_granular),'coarse_permissions',to_jsonb(v_coarse),'access_scope',p_access_scope,'access_expires_at',p_access_expires_at,'mfa_required',coalesce(p_mfa_required,false),'approval_limit_aed',p_approval_limit_aed);
end;
$$;

create or replace function public.dabbir_platform_staff_invite_create_v2(p_actor uuid,p_target_user_id uuid,p_email text,p_display_name text,p_permissions text[],p_preset text,p_token_hash text,p_expires_at timestamptz,p_role_code text,p_granular_permissions text[],p_access_scope jsonb,p_access_expires_at timestamptz,p_mfa_required boolean,p_approval_limit_aed numeric)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
declare v_id uuid; v_auth jsonb; v_granular text[]; v_coarse text[]; v_scope jsonb:=coalesce(p_access_scope,'{"type":"ALL_BUSINESSES"}'::jsonb);
begin
 if p_actor=p_target_user_id then raise exception 'DABBIR_SELF_INVITE_FORBIDDEN'; end if;
 if p_expires_at is null or p_expires_at<=now() then raise exception 'DABBIR_INVITE_EXPIRY_INVALID'; end if;
 if nullif(trim(p_email),'') is null or nullif(trim(p_token_hash),'') is null then raise exception 'DABBIR_INVITE_INVALID'; end if;
 if not exists(select 1 from auth.users where id=p_target_user_id and lower(email)=lower(trim(p_email))) then raise exception 'DABBIR_INVITE_USER_EMAIL_MISMATCH'; end if;
 if exists(select 1 from public.dabbir_platform_admins where user_id=p_target_user_id and role='ROOT_OWNER') then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;
 v_auth:=dabbir_private.platform_invitation_grant_v2(p_actor,p_role_code,p_granular_permissions,v_scope,p_access_expires_at,p_mfa_required,p_approval_limit_aed);
 select coalesce(array_agg(value),'{}'::text[]) into v_granular from jsonb_array_elements_text(v_auth->'granular_permissions');
 select coalesce(array_agg(value),'{}'::text[]) into v_coarse from jsonb_array_elements_text(v_auth->'coarse_permissions');
 update dabbir_private.platform_staff_invitations set status='REVOKED',revoked_at=now(),revoked_by=p_actor,revocation_reason='SUPERSEDED_BY_NEW_INVITATION',token_generation=token_generation+1,token_hash='revoked:'||id::text||':'||(token_generation+1)::text,updated_at=now() where lower(email)=lower(trim(p_email)) and status='PENDING';
 insert into dabbir_private.platform_staff_invitations(email,display_name,target_user_id,permissions,preset,token_hash,invited_by,expires_at,role_code,granular_permissions,access_scope,access_expires_at,mfa_required,approval_limit_aed,token_generation,resend_count,delivery_status)
 values(lower(trim(p_email)),nullif(trim(p_display_name),''),p_target_user_id,v_coarse,coalesce(nullif(trim(p_preset),''),'custom'),p_token_hash,p_actor,p_expires_at,v_auth->>'role_code',v_granular,v_scope,p_access_expires_at,coalesce(p_mfa_required,false),p_approval_limit_aed,1,0,'PREPARED') returning id into v_id;
 insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,after_state,result,metadata)
 values(p_actor,p_target_user_id,'INVITE_CREATED','governed platform invitation',jsonb_build_object('authority_role','OWNER_DELEGATE','role_code',v_auth->>'role_code','permissions',v_coarse,'granular_permissions',v_granular,'access_scope',v_scope,'access_expires_at',p_access_expires_at,'mfa_required',coalesce(p_mfa_required,false),'approval_limit_aed',p_approval_limit_aed,'token_generation',1),'SUCCESS',jsonb_build_object('invitation_id',v_id,'email',lower(trim(p_email))));
 return jsonb_build_object('id',v_id,'status','PENDING','expires_at',p_expires_at,'access_expires_at',p_access_expires_at,'role_code',v_auth->>'role_code','token_generation',1,'delivery_status','PREPARED');
end;
$$;

create or replace function public.dabbir_platform_staff_invite_resend_v2(p_actor uuid,p_invitation_id uuid,p_token_hash text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_inv dabbir_private.platform_staff_invitations%rowtype; v_actor_role text; v_auth jsonb;
begin
 if nullif(trim(p_token_hash),'') is null then raise exception 'DABBIR_INVITE_INVALID'; end if;
 if p_expires_at is null or p_expires_at<=now() then raise exception 'DABBIR_INVITE_EXPIRY_INVALID'; end if;
 if not dabbir_private.platform_effective_capability(p_actor,'team.invite') then raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:team.invite'; end if;
 select role into v_actor_role from public.dabbir_platform_admins where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
 if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;
 select * into v_inv from dabbir_private.platform_staff_invitations where id=p_invitation_id for update;
 if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
 if v_inv.status<>'PENDING' or v_inv.revoked_at is not null or v_inv.accepted_at is not null then raise exception 'DABBIR_INVITATION_NOT_PENDING'; end if;
 if v_actor_role<>'ROOT_OWNER' and v_inv.invited_by<>p_actor then raise exception 'DABBIR_INVITATION_MANAGEMENT_FORBIDDEN'; end if;
 v_auth:=dabbir_private.platform_invitation_grant_v2(v_inv.invited_by,v_inv.role_code,v_inv.granular_permissions,v_inv.access_scope,v_inv.access_expires_at,v_inv.mfa_required,v_inv.approval_limit_aed);
 update dabbir_private.platform_staff_invitations set token_hash=p_token_hash,token_generation=token_generation+1,resend_count=resend_count+1,last_resent_at=now(),expires_at=p_expires_at,delivery_status='PREPARED',delivery_provider=null,delivery_attempted_at=null,provider_message_id=null,delivery_error_code=null,updated_at=now() where id=p_invitation_id;
 insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,before_state,after_state,result,metadata)
 values(p_actor,v_inv.target_user_id,'INVITE_RESENT','invitation delivery rotated',jsonb_build_object('token_generation',v_inv.token_generation,'expires_at',v_inv.expires_at,'resend_count',v_inv.resend_count),jsonb_build_object('token_generation',v_inv.token_generation+1,'expires_at',p_expires_at,'resend_count',v_inv.resend_count+1),'SUCCESS',jsonb_build_object('invitation_id',p_invitation_id,'sponsor',v_inv.invited_by));
 return jsonb_build_object('id',p_invitation_id,'status','PENDING','email',v_inv.email,'display_name',v_inv.display_name,'expires_at',p_expires_at,'token_generation',v_inv.token_generation+1,'resend_count',v_inv.resend_count+1,'delivery_status','PREPARED');
end;
$$;

create or replace function public.dabbir_platform_staff_invite_revoke_v2(p_actor uuid,p_invitation_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_inv dabbir_private.platform_staff_invitations%rowtype; v_actor_role text; v_reason text:=left(trim(coalesce(p_reason,'')),500);
begin
 if v_reason='' then raise exception 'DABBIR_INVITATION_REVOKE_REASON_REQUIRED'; end if;
 if not dabbir_private.platform_effective_capability(p_actor,'team.invite') then raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:team.invite'; end if;
 select role into v_actor_role from public.dabbir_platform_admins where user_id=p_actor and dabbir_private.platform_admin_is_active(p_actor);
 if not found then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;
 select * into v_inv from dabbir_private.platform_staff_invitations where id=p_invitation_id for update;
 if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
 if v_inv.status<>'PENDING' or v_inv.revoked_at is not null or v_inv.accepted_at is not null then raise exception 'DABBIR_INVITATION_NOT_PENDING'; end if;
 if v_actor_role<>'ROOT_OWNER' and v_inv.invited_by<>p_actor then raise exception 'DABBIR_INVITATION_MANAGEMENT_FORBIDDEN'; end if;
 update dabbir_private.platform_staff_invitations set status='REVOKED',revoked_at=now(),revoked_by=p_actor,revocation_reason=v_reason,token_generation=token_generation+1,token_hash='revoked:'||id::text||':'||(token_generation+1)::text,updated_at=now() where id=p_invitation_id;
 insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,before_state,after_state,result,metadata)
 values(p_actor,v_inv.target_user_id,'INVITE_REVOKED',v_reason,jsonb_build_object('status',v_inv.status,'token_generation',v_inv.token_generation,'expires_at',v_inv.expires_at),jsonb_build_object('status','REVOKED','token_generation',v_inv.token_generation+1,'revoked_at',now()),'SUCCESS',jsonb_build_object('invitation_id',p_invitation_id,'sponsor',v_inv.invited_by));
 return jsonb_build_object('id',p_invitation_id,'status','REVOKED','revoked',true);
end;
$$;

create or replace function public.dabbir_platform_staff_invite_delivery_v2(p_invitation_id uuid,p_status text,p_provider text,p_provider_message_id text,p_error_code text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','dabbir_private' as $$
declare v_status text:=upper(trim(coalesce(p_status,''))); v_inv dabbir_private.platform_staff_invitations%rowtype;
begin
 if v_status not in ('SENT','FAILED') then raise exception 'DABBIR_INVITE_DELIVERY_STATUS_INVALID'; end if;
 select * into v_inv from dabbir_private.platform_staff_invitations where id=p_invitation_id for update;
 if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
 update dabbir_private.platform_staff_invitations set delivery_status=v_status,delivery_attempts=delivery_attempts+1,delivery_provider=nullif(trim(coalesce(p_provider,'')),''),delivery_attempted_at=now(),provider_message_id=case when v_status='SENT' then nullif(trim(coalesce(p_provider_message_id,'')),'') else null end,delivery_error_code=case when v_status='FAILED' then nullif(trim(coalesce(p_error_code,'')),'') else null end,updated_at=now() where id=p_invitation_id;
 insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,before_state,after_state,result,metadata)
 values(v_inv.invited_by,v_inv.target_user_id,case when v_status='SENT' then 'INVITE_DELIVERED' else 'INVITE_DELIVERY_FAILED' end,case when v_status='FAILED' then left(coalesce(p_error_code,'DELIVERY_FAILED'),500) else 'email delivered' end,jsonb_build_object('delivery_status',v_inv.delivery_status,'delivery_attempts',v_inv.delivery_attempts),jsonb_build_object('delivery_status',v_status,'delivery_attempts',v_inv.delivery_attempts+1,'provider',nullif(trim(coalesce(p_provider,'')),'')),case when v_status='SENT' then 'SUCCESS' else 'FAILED' end,jsonb_build_object('invitation_id',p_invitation_id));
 return jsonb_build_object('id',p_invitation_id,'delivery_status',v_status,'delivery_attempts',v_inv.delivery_attempts+1);
end;
$$;

create or replace function public.dabbir_platform_staff_accept_for_invitation_v2(p_user_id uuid,p_invitation_id uuid,p_generation integer)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
declare v_inv dabbir_private.platform_staff_invitations%rowtype; v_auth jsonb; v_granular text[]; v_coarse text[]; v_reason text;
begin
 begin
  select * into v_inv from dabbir_private.platform_staff_invitations where id=p_invitation_id for update;
  if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
  if v_inv.target_user_id<>p_user_id then raise exception 'DABBIR_INVITE_USER_MISMATCH'; end if;
  if v_inv.token_generation<>p_generation then raise exception 'DABBIR_INVITATION_GENERATION_STALE'; end if;
  if v_inv.status<>'PENDING' or v_inv.revoked_at is not null or v_inv.accepted_at is not null then raise exception 'DABBIR_INVITATION_INVALID'; end if;
  if v_inv.expires_at<=now() then raise exception 'DABBIR_INVITATION_EXPIRED'; end if;
  if v_inv.access_expires_at is not null and v_inv.access_expires_at<=now() then raise exception 'DABBIR_ACCESS_EXPIRY_INVALID'; end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id and lower(u.email)=lower(v_inv.email)) then raise exception 'DABBIR_INVITE_USER_EMAIL_MISMATCH'; end if;
  if exists(select 1 from public.dabbir_platform_admins where user_id=p_user_id and role='ROOT_OWNER') then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'; end if;
  v_auth:=dabbir_private.platform_invitation_grant_v2(v_inv.invited_by,v_inv.role_code,v_inv.granular_permissions,v_inv.access_scope,v_inv.access_expires_at,v_inv.mfa_required,v_inv.approval_limit_aed);
  select coalesce(array_agg(value),'{}'::text[]) into v_granular from jsonb_array_elements_text(v_auth->'granular_permissions');
  select coalesce(array_agg(value),'{}'::text[]) into v_coarse from jsonb_array_elements_text(v_auth->'coarse_permissions');
  insert into public.dabbir_platform_admins(user_id,role,active,permissions,display_name,added_by,updated_at,role_code,granular_permissions,access_scope,access_expires_at,mfa_required,approval_limit_aed)
  values(v_inv.target_user_id,'OWNER_DELEGATE',true,v_coarse,v_inv.display_name,v_inv.invited_by,now(),v_auth->>'role_code',v_granular,v_inv.access_scope,v_inv.access_expires_at,v_inv.mfa_required,v_inv.approval_limit_aed)
  on conflict(user_id) do update set role='OWNER_DELEGATE',active=true,permissions=excluded.permissions,display_name=excluded.display_name,added_by=excluded.added_by,updated_at=now(),suspended_at=null,revoked_at=null,role_code=excluded.role_code,granular_permissions=excluded.granular_permissions,access_scope=excluded.access_scope,access_expires_at=excluded.access_expires_at,mfa_required=excluded.mfa_required,approval_limit_aed=excluded.approval_limit_aed;
  update dabbir_private.platform_staff_invitations set status='ACCEPTED',accepted_at=now(),accepted_by_user_id=p_user_id,token_generation=token_generation+1,token_hash='accepted:'||id::text||':'||(token_generation+1)::text,updated_at=now() where id=p_invitation_id and status='PENDING' and token_generation=p_generation;
  if not found then raise exception 'DABBIR_INVITATION_RACE_LOST'; end if;
  insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,after_state,result,metadata)
  values(p_user_id,p_user_id,'INVITE_ACCEPTED','exact invitation acceptance',jsonb_build_object('authority_role','OWNER_DELEGATE','role_code',v_auth->>'role_code','permissions',v_coarse,'granular_permissions',v_granular,'access_scope',v_inv.access_scope,'access_expires_at',v_inv.access_expires_at,'mfa_required',v_inv.mfa_required,'approval_limit_aed',v_inv.approval_limit_aed),'SUCCESS',jsonb_build_object('invitation_id',p_invitation_id,'sponsor',v_inv.invited_by,'accepted_generation',p_generation));
  return jsonb_build_object('accepted',true,'user_id',p_user_id,'role','OWNER_DELEGATE','role_code',v_auth->>'role_code','invitation_id',p_invitation_id);
 exception when others then
  v_reason:=left(sqlerrm,500);
  insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,result,metadata)
  values(p_user_id,p_user_id,'INVITE_ACCEPT_FAILED',v_reason,'FAILED',jsonb_build_object('invitation_id',p_invitation_id,'requested_generation',p_generation));
  return jsonb_build_object('accepted',false,'reason',v_reason,'invitation_id',p_invitation_id);
 end;
end;
$$;

create or replace function dabbir_private.owner_otp_invitation_generation_v1()
returns trigger language plpgsql security definer set search_path='pg_catalog','dabbir_private' as $$
begin
 if new.invitation_id is not null and new.invitation_generation is null then
   select token_generation into new.invitation_generation from dabbir_private.platform_staff_invitations where id=new.invitation_id;
 end if;
 return new;
end;
$$;

drop trigger if exists owner_otp_invitation_generation_v1 on dabbir_private.owner_otp_challenges;
create trigger owner_otp_invitation_generation_v1 before insert or update of invitation_id on dabbir_private.owner_otp_challenges for each row execute function dabbir_private.owner_otp_invitation_generation_v1();

update dabbir_private.owner_otp_challenges c set invitation_generation=i.token_generation from dabbir_private.platform_staff_invitations i where c.invitation_id=i.id and c.invitation_generation is null and c.consumed_at is null and c.expires_at>now();

create or replace function public.dabbir_platform_login_identity_v1(p_login text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
declare v_login text:=lower(trim(coalesce(p_login,''))); v_result jsonb;
begin
 if v_login in ('barmanadmin','__root__') then
  select jsonb_build_object('user_id',a.user_id,'email',lower(u.email),'authority_role',a.role,'display_name',a.display_name,'permissions',a.permissions,'invitation_id',null,'invitation_generation',null) into v_result from public.dabbir_platform_admins a join auth.users u on u.id=a.user_id where a.role='ROOT_OWNER' and dabbir_private.platform_admin_is_active(a.user_id) limit 1;
 elsif position('@' in v_login)>1 then
  select jsonb_build_object('user_id',a.user_id,'email',lower(u.email),'authority_role',a.role,'display_name',a.display_name,'permissions',a.permissions,'invitation_id',null,'invitation_generation',null) into v_result from public.dabbir_platform_admins a join auth.users u on u.id=a.user_id where lower(u.email)=v_login and a.role='OWNER_DELEGATE' and dabbir_private.platform_admin_is_active(a.user_id) limit 1;
  if v_result is null then
   select jsonb_build_object('user_id',i.target_user_id,'email',lower(i.email),'authority_role','OWNER_DELEGATE','display_name',i.display_name,'permissions',i.permissions,'invitation_id',i.id,'invitation_generation',i.token_generation) into v_result from dabbir_private.platform_staff_invitations i where lower(i.email)=v_login and i.status='PENDING' and i.revoked_at is null and i.expires_at>now() order by i.created_at desc limit 1;
  end if;
 end if;
 return coalesce(v_result,jsonb_build_object('found',false));
end;
$$;

create or replace function public.dabbir_platform_staff_accept_for_user_v1(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_invitation_id uuid; v_generation integer; v_pairs integer;
begin
 select count(*),min(invitation_id),min(invitation_generation) into v_pairs,v_invitation_id,v_generation from (select distinct c.invitation_id,c.invitation_generation from dabbir_private.owner_otp_challenges c where c.actor_user_id=p_user_id and c.invitation_id is not null and c.invitation_generation is not null and c.consumed_at is null and c.expires_at>now()) q;
 if v_pairs<>1 or v_invitation_id is null or v_generation is null then return jsonb_build_object('accepted',false,'reason','EXACT_INVITATION_REQUIRED'); end if;
 return public.dabbir_platform_staff_accept_for_invitation_v2(p_user_id,v_invitation_id,v_generation);
end;
$$;

create or replace function public.dabbir_platform_staff_invite_accept_v1(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_inv dabbir_private.platform_staff_invitations%rowtype;
begin
 select * into v_inv from dabbir_private.platform_staff_invitations where token_hash=p_token_hash for update;
 if not found then return jsonb_build_object('accepted',false,'reason','DABBIR_INVITATION_INVALID'); end if;
 return public.dabbir_platform_staff_accept_for_invitation_v2(v_inv.target_user_id,v_inv.id,v_inv.token_generation);
end;
$$;

create or replace function public.dabbir_platform_staff_list_v2(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
declare v_staff jsonb; v_invites jsonb;
begin
 if not dabbir_private.platform_effective_capability(p_actor,'team.view') then raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:team.view'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'email',u.email,'display_name',a.display_name,'role',a.role,'role_code',a.role_code,'permissions',case when a.role='ROOT_OWNER' then '[]'::jsonb else to_jsonb(a.permissions) end,'granular_permissions',case when a.role='ROOT_OWNER' then '[]'::jsonb else to_jsonb(a.granular_permissions) end,'access_scope',a.access_scope,'access_expires_at',a.access_expires_at,'mfa_required',a.mfa_required,'approval_limit_aed',a.approval_limit_aed,'active',a.active,'last_login_at',u.last_sign_in_at,'last_activity_at',(select max(s.last_seen_at) from dabbir_private.owner_sessions s where s.actor_user_id=a.user_id),'active_sessions',(select count(*) from dabbir_private.owner_sessions s where s.actor_user_id=a.user_id and s.revoked_at is null and s.expires_at>now()),'invited_at',a.created_at,'added_by',a.added_by,'suspended_at',a.suspended_at,'revoked_at',a.revoked_at,'last_access_reviewed_at',a.last_access_reviewed_at) order by (a.role='ROOT_OWNER') desc,a.created_at),'[]'::jsonb) into v_staff from public.dabbir_platform_admins a join auth.users u on u.id=a.user_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'display_name',i.display_name,'target_user_id',i.target_user_id,'permissions',i.permissions,'granular_permissions',i.granular_permissions,'preset',i.preset,'role_code',i.role_code,'access_scope',i.access_scope,'access_expires_at',i.access_expires_at,'mfa_required',i.mfa_required,'approval_limit_aed',i.approval_limit_aed,'status',i.status,'invited_by',i.invited_by,'expires_at',i.expires_at,'accepted_at',i.accepted_at,'accepted_by_user_id',i.accepted_by_user_id,'revoked_at',i.revoked_at,'revoked_by',i.revoked_by,'revocation_reason',i.revocation_reason,'delivery_status',i.delivery_status,'delivery_attempts',i.delivery_attempts,'delivery_provider',i.delivery_provider,'delivery_attempted_at',i.delivery_attempted_at,'delivery_error_code',i.delivery_error_code,'token_generation',i.token_generation,'resend_count',i.resend_count,'last_resent_at',i.last_resent_at,'created_at',i.created_at,'updated_at',i.updated_at) order by i.created_at desc),'[]'::jsonb) into v_invites from dabbir_private.platform_staff_invitations i;
 return jsonb_build_object('staff',v_staff,'invitations',v_invites,'roles',(select coalesce(jsonb_agg(jsonb_build_object('code',r.code,'name_ar',r.name_ar,'name_en',r.name_en,'description',r.description,'permissions',to_jsonb(dabbir_private.platform_role_permissions_v1(r.code))) order by r.code),'[]'::jsonb) from dabbir_private.platform_roles r));
end;
$$;

revoke all on function dabbir_private.platform_scope_contains_v1(uuid,jsonb) from public,anon,authenticated;
revoke all on function dabbir_private.platform_invitation_grant_v2(uuid,text,text[],jsonb,timestamptz,boolean,numeric) from public,anon,authenticated;
revoke all on function dabbir_private.owner_otp_invitation_generation_v1() from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_resend_v2(uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_revoke_v2(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_delivery_v2(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_accept_for_invitation_v2(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.dabbir_platform_login_identity_v1(text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_accept_for_user_v1(uuid) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_invite_accept_v1(text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_staff_list_v2(uuid) from public,anon,authenticated;

grant execute on function public.dabbir_platform_staff_invite_create_v2(uuid,uuid,text,text,text[],text,text,timestamptz,text,text[],jsonb,timestamptz,boolean,numeric) to service_role;
grant execute on function public.dabbir_platform_staff_invite_resend_v2(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.dabbir_platform_staff_invite_revoke_v2(uuid,uuid,text) to service_role;
grant execute on function public.dabbir_platform_staff_invite_delivery_v2(uuid,text,text,text,text) to service_role;
grant execute on function public.dabbir_platform_staff_accept_for_invitation_v2(uuid,uuid,integer) to service_role;
grant execute on function public.dabbir_platform_login_identity_v1(text) to service_role;
grant execute on function public.dabbir_platform_staff_accept_for_user_v1(uuid) to service_role;
grant execute on function public.dabbir_platform_staff_invite_accept_v1(text) to service_role;
grant execute on function public.dabbir_platform_staff_list_v2(uuid) to service_role;
