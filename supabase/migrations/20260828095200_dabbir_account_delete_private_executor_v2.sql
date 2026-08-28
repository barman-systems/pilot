-- Move DABBIR account deletion privilege out of the public API schema.
-- Public RPC remains SECURITY INVOKER; the privileged implementation lives in dabbir_private.

create or replace function dabbir_private.dabbir_delete_current_user_account_impl(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, extensions, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_owned_business_ids uuid[] := '{}'::uuid[];
  v_owned_business_count integer := 0;
  v_removed_memberships integer := 0;
  v_retained_refs integer := 0;
  v_receipt_id uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_confirmation is distinct from 'DELETE_DABBIR_ACCOUNT' then raise exception 'ACCOUNT_DELETE_CONFIRMATION_REQUIRED'; end if;

  if exists (select 1 from public.account_access_state where user_id=v_user and status='deleted') then
    raise exception 'DABBIR_ACCOUNT_ALREADY_DELETED';
  end if;

  if exists (select 1 from public.dabbir_platform_admins where user_id=v_user) then
    raise exception 'PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF';
  end if;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_owned_business_ids
  from public.dabbir_businesses
  where owner_id=v_user;
  v_owned_business_count := cardinality(v_owned_business_ids);

  if exists (
    select 1 from public.dabbir_retention_policies
    where business_id=any(v_owned_business_ids) and policy_state='LEGAL_HOLD'
  ) then
    raise exception 'ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD';
  end if;

  update public.dabbir_access_audit set business_id=null where business_id=any(v_owned_business_ids);
  update public.dabbir_offers set advertiser_business_id=null where advertiser_business_id=any(v_owned_business_ids);
  update public.dabbir_payments set payer_business_id=null where payer_business_id=any(v_owned_business_ids);
  update dabbir_private.platform_customer_support_cases set business_id=null where business_id=any(v_owned_business_ids);

  delete from public.dabbir_businesses where id=any(v_owned_business_ids);

  delete from public.dabbir_memberships where user_id=v_user;
  get diagnostics v_removed_memberships = row_count;

  update public.dabbir_access_audit set actor_user_id=null where actor_user_id=v_user;
  update public.dabbir_access_audit set target_user_id=null where target_user_id=v_user;
  update public.dabbir_creator_profiles set user_id=null where user_id=v_user;
  update public.dabbir_employee_invitations set accepted_by=null where accepted_by=v_user;
  delete from public.dabbir_employee_invitations where invited_by=v_user;
  update public.dabbir_handoffs set assigned_user_id=null where assigned_user_id=v_user;
  update public.dabbir_memberships set invited_by=null where invited_by=v_user;
  update public.dabbir_messages set sender_user_id=null where sender_user_id=v_user;
  update public.dabbir_offers set created_by_user_id=null where created_by_user_id=v_user;
  update public.dabbir_offers set payer_user_id=null where payer_user_id=v_user;
  update public.dabbir_owner_policy_audit set actor_user_id=null where actor_user_id=v_user;
  update public.dabbir_payments set payer_user_id=null where payer_user_id=v_user;
  update dabbir_private.platform_customer_support_cases set assigned_to=null where assigned_to=v_user;
  update dabbir_private.platform_customer_support_cases set created_by=null where created_by=v_user;
  update dabbir_private.platform_customer_support_cases set target_user_id=null where target_user_id=v_user;
  update dabbir_private.platform_customer_support_notes set actor_user_id=null where actor_user_id=v_user;
  update public.dabbir_procedure_definitions set created_by=null where created_by=v_user;
  update public.dabbir_procedure_runs set owner_approved_by=null where owner_approved_by=v_user;
  delete from public.dabbir_whatsapp_outbound_reservations where sender_user_id=v_user;

  delete from public.dabbir_user_accounts where user_id=v_user;

  insert into public.account_access_state(
    user_id,status,reason,suspended_at,suspended_by,reinstated_at,reinstated_by,updated_at
  ) values (
    v_user,'deleted','DABBIR_ACCOUNT_DELETED',null,null,null,null,now()
  )
  on conflict (user_id) do update set
    status='deleted',reason='DABBIR_ACCOUNT_DELETED',
    suspended_at=null,suspended_by=null,reinstated_at=null,reinstated_by=null,updated_at=now();

  select
      (select count(*) from public.dabbir_owner_decision_observations where owner_user_id=v_user)
    + (select count(*) from public.dabbir_owner_policy_versions where owner_user_id=v_user)
    into v_retained_refs;

  insert into dabbir_private.account_deletion_receipts(
    id,user_fingerprint,owned_business_count,removed_memberships,retained_operational_references,auth_identity_retained
  ) values (
    v_receipt_id,
    encode(extensions.digest(v_user::text,'sha256'),'hex'),
    v_owned_business_count,v_removed_memberships,v_retained_refs,true
  );

  return jsonb_build_object(
    'ok',true,'deleted',true,'scope','DABBIR_PRODUCT_ACCOUNT','receipt_id',v_receipt_id,
    'owned_businesses_deleted',v_owned_business_count,'memberships_removed',v_removed_memberships,
    'retained_operational_references',v_retained_refs,
    'auth_identity_retained_for_shared_products',true,'dabbir_access_revoked',true
  );
end;
$function$;

revoke all on function dabbir_private.dabbir_delete_current_user_account_impl(text) from public, anon;
grant execute on function dabbir_private.dabbir_delete_current_user_account_impl(text) to authenticated;

create or replace function public.dabbir_delete_current_user_account(p_confirmation text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $function$
  select dabbir_private.dabbir_delete_current_user_account_impl(p_confirmation);
$function$;

revoke all on function public.dabbir_delete_current_user_account(text) from public, anon;
grant execute on function public.dabbir_delete_current_user_account(text) to authenticated;

comment on function public.dabbir_delete_current_user_account(text) is
  'Authenticated SECURITY INVOKER wrapper for product-scoped DABBIR account deletion. Privileged implementation is isolated in dabbir_private.';
