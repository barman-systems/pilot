create or replace function dabbir_private.dabbir_create_employee_invitation(
  p_business_id uuid,
  p_email text,
  p_display_name text,
  p_role text default 'employee',
  p_permissions text[] default '{}',
  p_token_hash text default null,
  p_expires_at timestamptz default now() + interval '72 hours'
)
returns table(invitation_id uuid, business_id uuid, email text, role text, status text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email,'')));
  v_inv public.dabbir_employee_invitations%rowtype;
  v_existing_status text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_business_id is null then raise exception 'BUSINESS_REQUIRED'; end if;
  if length(v_email) < 3 or length(v_email) > 254 or position('@' in v_email) <= 1 then raise exception 'INVALID_EMAIL'; end if;
  if p_role not in ('admin','manager','employee','staff','viewer','agent') then raise exception 'INVALID_ROLE'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_TOKEN_HASH'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '14 days' then raise exception 'INVALID_EXPIRY'; end if;
  if not dabbir_private.can_manage_role(p_business_id,p_role) then raise exception 'TEAM_MANAGEMENT_REQUIRED'; end if;
  if not dabbir_private.can_grant_permissions(p_business_id,coalesce(p_permissions,'{}'::text[])) then raise exception 'PERMISSION_GRANT_NOT_ALLOWED'; end if;

  update public.dabbir_employee_invitations as inv
  set status='expired', updated_at=now()
  where inv.business_id=p_business_id
    and inv.email=v_email
    and inv.status='pending'
    and inv.expires_at<=now();

  if exists(
    select 1
    from public.dabbir_employee_invitations as inv
    where inv.business_id=p_business_id
      and inv.email=v_email
      and inv.status='pending'
  ) then
    raise exception 'INVITATION_ALREADY_PENDING';
  end if;

  select mem.status into v_existing_status
  from auth.users as usr
  join public.dabbir_memberships as mem on mem.user_id=usr.id
  where mem.business_id=p_business_id
    and lower(usr.email)=v_email
  limit 1;

  if v_existing_status in ('active','suspended') then raise exception 'EMPLOYEE_ALREADY_MEMBER'; end if;

  insert into public.dabbir_employee_invitations(
    business_id,email,display_name,role,permissions,token_hash,status,delivery_status,invited_by,expires_at
  ) values (
    p_business_id,v_email,nullif(trim(coalesce(p_display_name,'')),''),p_role,coalesce(p_permissions,'{}'::text[]),p_token_hash,'pending','prepared',v_actor,p_expires_at
  ) returning * into v_inv;

  insert into public.dabbir_access_audit(business_id,actor_user_id,invitation_id,action,metadata)
  values(p_business_id,v_actor,v_inv.id,'invitation_created',jsonb_build_object('role',p_role));

  return query select v_inv.id,v_inv.business_id,v_inv.email,v_inv.role,v_inv.status,v_inv.expires_at;
end;
$$;

revoke all on function dabbir_private.dabbir_create_employee_invitation(uuid,text,text,text,text[],text,timestamptz) from public;
grant execute on function dabbir_private.dabbir_create_employee_invitation(uuid,text,text,text,text[],text,timestamptz) to authenticated, service_role;
