-- DABBIR employee primary-branch scope v2.
-- Fix PL/pgSQL output-column ambiguity in invitation acceptance without weakening branch RLS.
-- The private function returns a table with an output variable named business_id. In v1,
-- `ON CONFLICT (business_id,user_id,branch_id)` could be parsed as an ambiguous reference.
-- Bind conflict handling to the concrete primary-key constraint instead.

create or replace function dabbir_private.dabbir_accept_employee_invitation(p_token text)
returns table(business_id uuid,role text,status text)
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_hash text;
  v_inv public.dabbir_employee_invitations%rowtype;
  v_existing public.dabbir_memberships%rowtype;
  v_primary_branch uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_email='' then raise exception 'VERIFIED_EMAIL_REQUIRED'; end if;
  if p_token is null or length(p_token)<32 or length(p_token)>256 then raise exception 'INVALID_INVITATION'; end if;
  v_hash := encode(extensions.digest(p_token,'sha256'),'hex');

  select inv.* into v_inv
  from public.dabbir_employee_invitations inv
  where inv.token_hash=v_hash
  for update;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if v_inv.status<>'pending' then raise exception 'INVITATION_NOT_PENDING'; end if;
  if v_inv.expires_at<=now() then raise exception 'INVITATION_EXPIRED'; end if;
  if lower(v_inv.email)<>v_email then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;

  if not dabbir_private.can_user_manage_role(v_inv.business_id,v_inv.invited_by,v_inv.role)
     or not dabbir_private.can_user_grant_permissions(v_inv.business_id,v_inv.invited_by,v_inv.permissions) then
    raise exception 'INVITER_NO_LONGER_AUTHORIZED';
  end if;

  v_primary_branch := dabbir_private.primary_branch_for_business(v_inv.business_id);
  if v_primary_branch is null then raise exception 'DABBIR_ACTIVE_BRANCH_REQUIRED'; end if;

  select mem.* into v_existing
  from public.dabbir_memberships mem
  where mem.business_id=v_inv.business_id
    and mem.user_id=v_user
  for update;
  if found and v_existing.status in ('active','suspended') then raise exception 'MEMBERSHIP_ALREADY_EXISTS'; end if;

  if found and v_existing.status='removed' then
    update public.dabbir_memberships mem
    set role=v_inv.role,
        permissions=v_inv.permissions,
        display_name=v_inv.display_name,
        status='active',
        invited_by=v_inv.invited_by,
        accepted_at=now(),
        suspended_at=null,
        removed_at=null,
        updated_at=now()
    where mem.business_id=v_inv.business_id
      and mem.user_id=v_user;
  else
    insert into public.dabbir_memberships(
      business_id,user_id,role,status,permissions,display_name,invited_by,accepted_at
    ) values (
      v_inv.business_id,v_user,v_inv.role,'active',v_inv.permissions,v_inv.display_name,v_inv.invited_by,now()
    );
  end if;

  insert into public.dabbir_membership_branches(
    business_id,user_id,branch_id,created_by
  ) values (
    v_inv.business_id,v_user,v_primary_branch,v_inv.invited_by
  )
  on conflict on constraint dabbir_membership_branches_pkey do nothing;

  update public.dabbir_employee_invitations accepted_inv
  set status='accepted',accepted_by=v_user,accepted_at=now(),updated_at=now()
  where accepted_inv.id=v_inv.id;

  update public.dabbir_employee_invitations other_inv
  set status='revoked',revoked_at=now(),updated_at=now()
  where other_inv.business_id=v_inv.business_id
    and other_inv.email=v_inv.email
    and other_inv.status='pending'
    and other_inv.id<>v_inv.id;

  insert into public.dabbir_access_audit(
    business_id,actor_user_id,target_user_id,invitation_id,action,metadata
  ) values (
    v_inv.business_id,
    v_user,
    v_user,
    v_inv.id,
    'invitation_accepted',
    jsonb_build_object(
      'role',v_inv.role,
      'branch_id',v_primary_branch,
      'branch_scope','primary_default'
    )
  );

  return query select v_inv.business_id,v_inv.role,'active'::text;
end;
$$;

revoke all on function dabbir_private.dabbir_accept_employee_invitation(text) from public,anon;
grant execute on function dabbir_private.dabbir_accept_employee_invitation(text) to authenticated,service_role;

create or replace function public.dabbir_accept_employee_invitation(p_token text)
returns table(business_id uuid,role text,status text)
language sql
security invoker
set search_path=public,dabbir_private,pg_temp
as $$
  select accepted.business_id,accepted.role,accepted.status
  from dabbir_private.dabbir_accept_employee_invitation(p_token) accepted;
$$;

revoke all on function public.dabbir_accept_employee_invitation(text) from public,anon;
grant execute on function public.dabbir_accept_employee_invitation(text) to authenticated;
