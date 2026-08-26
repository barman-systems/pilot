-- Production parity for the DABBIR AI full-customer-journey fixes.
-- 1) Remove PL/pgSQL output-column ambiguity from one-time invite acceptance.
-- 2) Keep QA cleanup callable only by service_role and scoped to DABBIR AI QA businesses.

create or replace function dabbir_private.dabbir_accept_employee_invitation(p_token text)
returns table(business_id uuid, role text, status text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_hash text;
  v_inv public.dabbir_employee_invitations%rowtype;
  v_existing public.dabbir_memberships%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_email='' then raise exception 'VERIFIED_EMAIL_REQUIRED'; end if;
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then raise exception 'INVALID_INVITATION'; end if;
  v_hash := encode(extensions.digest(p_token,'sha256'),'hex');

  select inv.* into v_inv
  from public.dabbir_employee_invitations as inv
  where inv.token_hash=v_hash
  for update;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if v_inv.status<>'pending' then raise exception 'INVITATION_NOT_PENDING'; end if;
  if v_inv.expires_at<=now() then raise exception 'INVITATION_EXPIRED'; end if;
  if lower(v_inv.email)<>v_email then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;

  if not exists(
    select 1
    from public.dabbir_memberships as inviter
    where inviter.business_id=v_inv.business_id
      and inviter.user_id=v_inv.invited_by
      and inviter.status='active'
      and ((inviter.role='owner' and v_inv.role in ('admin','manager','employee','staff','viewer','agent'))
        or (inviter.role='admin' and v_inv.role in ('manager','employee','staff','viewer','agent')))
  ) then raise exception 'INVITER_NO_LONGER_AUTHORIZED'; end if;

  select mem.* into v_existing
  from public.dabbir_memberships as mem
  where mem.business_id=v_inv.business_id
    and mem.user_id=v_user
  for update;
  if found and v_existing.status in ('active','suspended') then raise exception 'MEMBERSHIP_ALREADY_EXISTS'; end if;

  if found and v_existing.status='removed' then
    update public.dabbir_memberships as mem
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

  update public.dabbir_employee_invitations as accepted_inv
  set status='accepted',accepted_by=v_user,accepted_at=now(),updated_at=now()
  where accepted_inv.id=v_inv.id;

  update public.dabbir_employee_invitations as other_inv
  set status='revoked',revoked_at=now(),updated_at=now()
  where other_inv.business_id=v_inv.business_id
    and other_inv.email=v_inv.email
    and other_inv.status='pending'
    and other_inv.id<>v_inv.id;

  insert into public.dabbir_access_audit(business_id,actor_user_id,target_user_id,invitation_id,action,metadata)
  values(v_inv.business_id,v_user,v_user,v_inv.id,'invitation_accepted',jsonb_build_object('role',v_inv.role));

  return query select v_inv.business_id,v_inv.role,'active'::text;
end;
$$;

revoke all on function dabbir_private.dabbir_accept_employee_invitation(text) from public, anon;
grant execute on function dabbir_private.dabbir_accept_employee_invitation(text) to authenticated, service_role;

create or replace function public.dabbir_accept_employee_invitation(p_token text)
returns table(business_id uuid, role text, status text)
language sql
set search_path = public, dabbir_private, pg_temp
as $$
  select accepted.business_id, accepted.role, accepted.status
  from dabbir_private.dabbir_accept_employee_invitation(p_token) as accepted;
$$;

revoke all on function public.dabbir_accept_employee_invitation(text) from public, anon;
grant execute on function public.dabbir_accept_employee_invitation(text) to authenticated, service_role;

create or replace function public.dabbir_qa_cleanup_business(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
  v_owner_id uuid;
begin
  select b.name, b.owner_id into v_name, v_owner_id
  from public.dabbir_businesses as b
  where b.id = p_business_id;

  if not found then
    return jsonb_build_object('ok', true, 'deleted', false, 'reason', 'BUSINESS_NOT_FOUND');
  end if;

  if v_name not like 'DABBIR AI QA %' then
    raise exception 'QA_CLEANUP_SCOPE_DENIED' using errcode = '42501';
  end if;

  delete from public.dabbir_access_audit where business_id = p_business_id;
  delete from public.dabbir_privacy_audit where business_id = p_business_id;
  delete from public.dabbir_procedure_audit where business_id = p_business_id;
  delete from public.dabbir_message_batch_items where business_id = p_business_id;
  delete from public.dabbir_message_batches where business_id = p_business_id;
  delete from public.dabbir_quality_regression_cases where business_id = p_business_id;
  delete from public.dabbir_quality_events where business_id = p_business_id;
  delete from public.dabbir_quality_cases where business_id = p_business_id;
  delete from public.dabbir_customer_evidence where business_id = p_business_id;
  delete from public.dabbir_verification_challenges where business_id = p_business_id;
  delete from public.dabbir_customer_consents where business_id = p_business_id;
  delete from public.dabbir_privacy_requests where business_id = p_business_id;
  delete from public.dabbir_event_inbox where business_id = p_business_id;
  delete from public.dabbir_operation_outcomes where business_id = p_business_id;
  delete from public.dabbir_procedure_steps where business_id = p_business_id;
  delete from public.dabbir_procedure_runs where business_id = p_business_id;
  delete from public.dabbir_procedure_definitions where business_id = p_business_id;
  delete from public.dabbir_action_policies where business_id = p_business_id;
  delete from public.dabbir_conversation_outcomes where business_id = p_business_id;
  delete from public.dabbir_handoffs where business_id = p_business_id;
  delete from public.dabbir_followups where business_id = p_business_id;
  delete from public.dabbir_appointments where business_id = p_business_id;
  delete from public.dabbir_orders where business_id = p_business_id;
  delete from public.dabbir_inventory where business_id = p_business_id;
  delete from public.dabbir_products where business_id = p_business_id;
  delete from public.dabbir_services where business_id = p_business_id;
  delete from public.dabbir_messages where business_id = p_business_id;
  delete from public.dabbir_conversations where business_id = p_business_id;
  delete from public.dabbir_customer_memory where business_id = p_business_id;
  delete from public.dabbir_customer_management where business_id = p_business_id;
  delete from public.dabbir_customer_identities where business_id = p_business_id;
  delete from public.dabbir_business_knowledge where business_id = p_business_id;
  delete from public.dabbir_demo_events where business_id = p_business_id;
  delete from public.dabbir_employee_invitations where business_id = p_business_id;
  delete from public.dabbir_retention_policies where business_id = p_business_id;
  delete from public.dabbir_privacy_controls where business_id = p_business_id;
  delete from public.dabbir_channels where business_id = p_business_id;
  delete from public.dabbir_memberships where business_id = p_business_id;
  delete from public.dabbir_businesses where id = p_business_id;

  return jsonb_build_object('ok', true, 'deleted', true, 'business_id', p_business_id, 'owner_id', v_owner_id);
end;
$$;

revoke all on function public.dabbir_qa_cleanup_business(uuid) from public, anon, authenticated;
grant execute on function public.dabbir_qa_cleanup_business(uuid) to service_role;
