-- PILOT employee access v9: fix ambiguous membership references and record business-scope session revocation.

create or replace function pilot_private.pilot_set_employee_status(p_business_id uuid,p_user_id uuid,p_status text)
returns table(user_id uuid,role text,status text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid();
  v_old public.pilot_memberships%rowtype;
  v_new public.pilot_memberships%rowtype;
  v_email text;
  v_action text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_status not in ('active','suspended','removed') then raise exception 'INVALID_STATUS'; end if;
  select m.* into v_old from public.pilot_memberships m where m.business_id=p_business_id and m.user_id=p_user_id for update;
  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
  if v_old.role='owner' then raise exception 'OWNER_IMMUTABLE'; end if;
  if not pilot_private.can_manage_role(p_business_id,v_old.role) then raise exception 'TEAM_MANAGEMENT_REQUIRED'; end if;
  if v_old.status='removed' and p_status='active' then raise exception 'NEW_INVITATION_REQUIRED'; end if;

  update public.pilot_memberships m
  set status=p_status,
      suspended_at=case when p_status='suspended' then now() else null end,
      removed_at=case when p_status='removed' then now() else null end,
      updated_at=now()
  where m.business_id=p_business_id and m.user_id=p_user_id returning m.* into v_new;

  if p_status='suspended' then v_action:='employee_suspended';
  elsif p_status='removed' then v_action:='employee_removed';
  elsif v_old.status='suspended' and p_status='active' then v_action:='employee_reactivated';
  else v_action:=null;
  end if;

  if p_status='removed' then
    select lower(u.email) into v_email from auth.users u where u.id=p_user_id;
    if v_email is not null then
      update public.pilot_employee_invitations i
      set status='revoked',revoked_at=now(),updated_at=now()
      where i.business_id=p_business_id and i.email=v_email and i.status='pending';
    end if;
  end if;

  if v_action is not null then
    insert into public.pilot_access_audit(business_id,actor_user_id,target_user_id,action,metadata)
    values(p_business_id,v_actor,p_user_id,v_action,jsonb_build_object('from',v_old.status,'to',v_new.status));
  end if;
  if p_status in ('suspended','removed') then
    insert into public.pilot_access_audit(business_id,actor_user_id,target_user_id,action,metadata)
    values(p_business_id,v_actor,p_user_id,'session_revoked',jsonb_build_object('scope','business_membership','reason',p_status));
  end if;
  return query select v_new.user_id,v_new.role,v_new.status;
end;$$;

create or replace function pilot_private.pilot_update_employee_access(p_business_id uuid,p_user_id uuid,p_role text,p_permissions text[] default '{}'::text[])
returns table(user_id uuid,role text,status text,permissions text[])
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid();
  v_old public.pilot_memberships%rowtype;
  v_new public.pilot_memberships%rowtype;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select m.* into v_old from public.pilot_memberships m where m.business_id=p_business_id and m.user_id=p_user_id for update;
  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
  if v_old.role='owner' or p_role='owner' then raise exception 'OWNER_IMMUTABLE'; end if;
  if not pilot_private.can_manage_role(p_business_id,v_old.role) or not pilot_private.can_manage_role(p_business_id,p_role) then raise exception 'TEAM_MANAGEMENT_REQUIRED'; end if;
  if p_role not in ('admin','manager','employee','staff','viewer','agent') then raise exception 'INVALID_ROLE'; end if;
  if not pilot_private.can_grant_permissions(p_business_id,coalesce(p_permissions,'{}'::text[])) then raise exception 'PERMISSION_GRANT_NOT_ALLOWED'; end if;

  update public.pilot_memberships m
  set role=p_role,permissions=coalesce(p_permissions,'{}'::text[]),updated_at=now()
  where m.business_id=p_business_id and m.user_id=p_user_id returning m.* into v_new;

  if v_old.role<>v_new.role then
    insert into public.pilot_access_audit(business_id,actor_user_id,target_user_id,action,metadata)
    values(p_business_id,v_actor,p_user_id,'role_changed',jsonb_build_object('from',v_old.role,'to',v_new.role));
  end if;
  if v_old.permissions is distinct from v_new.permissions then
    insert into public.pilot_access_audit(business_id,actor_user_id,target_user_id,action,metadata)
    values(p_business_id,v_actor,p_user_id,'permission_changed',jsonb_build_object('count',cardinality(v_new.permissions)));
  end if;
  return query select v_new.user_id,v_new.role,v_new.status,v_new.permissions;
end;$$;
