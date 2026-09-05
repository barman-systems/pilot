-- Auditable single-use invitation revocation for Owner Team governance.
create or replace function public.dabbir_platform_staff_invite_revoke_v1(p_actor uuid,p_invitation_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_inv dabbir_private.platform_staff_invitations%rowtype;
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_employees');
  select * into v_inv from dabbir_private.platform_staff_invitations where id=p_invitation_id for update;
  if not found then raise exception 'DABBIR_INVITATION_NOT_FOUND'; end if;
  if v_inv.status<>'PENDING' or v_inv.revoked_at is not null then raise exception 'DABBIR_INVITATION_NOT_PENDING'; end if;
  update dabbir_private.platform_staff_invitations set status='REVOKED',revoked_at=now(),updated_at=now() where id=p_invitation_id;
  insert into dabbir_private.platform_staff_audit(actor_user_id,target_user_id,action,reason,before_state,after_state,result,metadata)
  values(p_actor,v_inv.target_user_id,'INVITATION_REVOKED',left(coalesce(p_reason,''),500),jsonb_build_object('status',v_inv.status,'email',v_inv.email,'expires_at',v_inv.expires_at),jsonb_build_object('status','REVOKED','revoked_at',now()),'SUCCESS',jsonb_build_object('invitation_id',p_invitation_id));
  return jsonb_build_object('id',p_invitation_id,'status','REVOKED');
end;
$$;
revoke all on function public.dabbir_platform_staff_invite_revoke_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_staff_invite_revoke_v1(uuid,uuid,text) to service_role;
