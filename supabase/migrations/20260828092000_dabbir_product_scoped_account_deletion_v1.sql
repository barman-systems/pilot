-- DABBIR product-scoped account deletion for Apple account-deletion compliance.
-- IMPORTANT: auth.users is shared by more than one product in this Supabase project.
-- This function deletes the DABBIR account surface and owned DABBIR tenant data,
-- but deliberately does not delete the global auth.users identity.

create table if not exists dabbir_private.account_deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  user_fingerprint text not null check (user_fingerprint ~ '^[0-9a-f]{64}$'),
  owned_business_count integer not null default 0 check (owned_business_count >= 0),
  removed_memberships integer not null default 0 check (removed_memberships >= 0),
  retained_operational_references integer not null default 0 check (retained_operational_references >= 0),
  auth_identity_retained boolean not null default true,
  deletion_scope text not null default 'DABBIR_PRODUCT_ACCOUNT',
  completed_at timestamptz not null default now()
);

revoke all on table dabbir_private.account_deletion_receipts from public, anon, authenticated;

-- A deleted DABBIR product account must remain blocked even though the shared
-- auth.users identity is intentionally retained for other products such as ZAJEL.
alter table public.account_access_state
  drop constraint if exists account_access_state_status_check;
alter table public.account_access_state
  add constraint account_access_state_status_check
  check (status in ('active','suspended','deleted'));

create or replace function dabbir_private.account_active()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select (select auth.uid()) is not null
    and not exists (
      select 1
      from public.account_access_state s
      where s.user_id = (select auth.uid())
        and s.status in ('suspended','deleted')
    );
$function$;

revoke all on function dabbir_private.account_active() from public, anon;
grant execute on function dabbir_private.account_active() to authenticated;

create or replace function public.dabbir_delete_current_user_account(p_confirmation text)
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
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_confirmation is distinct from 'DELETE_DABBIR_ACCOUNT' then
    raise exception 'ACCOUNT_DELETE_CONFIRMATION_REQUIRED';
  end if;

  if exists (
    select 1 from public.account_access_state
    where user_id = v_user and status = 'deleted'
  ) then
    raise exception 'DABBIR_ACCOUNT_ALREADY_DELETED';
  end if;

  -- Platform administrators require a controlled platform-role handoff before
  -- their DABBIR product account can be removed. Ordinary customer accounts do not.
  if exists (select 1 from public.dabbir_platform_admins where user_id = v_user) then
    raise exception 'PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF';
  end if;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_owned_business_ids
  from public.dabbir_businesses
  where owner_id = v_user;
  v_owned_business_count := cardinality(v_owned_business_ids);

  if exists (
    select 1
    from public.dabbir_retention_policies
    where business_id = any(v_owned_business_ids)
      and policy_state = 'LEGAL_HOLD'
  ) then
    raise exception 'ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD';
  end if;

  -- Four business references intentionally use NO ACTION so financial/support/
  -- access evidence can outlive a tenant where legally required. Detach the
  -- tenant identifier first, then the owned business delete cascades through
  -- ordinary DABBIR operational/customer/message/integration data.
  update public.dabbir_access_audit
     set business_id = null
   where business_id = any(v_owned_business_ids);
  update public.dabbir_offers
     set advertiser_business_id = null
   where advertiser_business_id = any(v_owned_business_ids);
  update public.dabbir_payments
     set payer_business_id = null
   where payer_business_id = any(v_owned_business_ids);
  update dabbir_private.platform_customer_support_cases
     set business_id = null
   where business_id = any(v_owned_business_ids);

  delete from public.dabbir_businesses
   where id = any(v_owned_business_ids);

  -- Remove DABBIR access to tenants the deleting account does not own.
  delete from public.dabbir_memberships where user_id = v_user;
  get diagnostics v_removed_memberships = row_count;

  -- Remove or de-identify remaining DABBIR references to the current user where
  -- the schema permits it. Retained governance records are counted below.
  update public.dabbir_access_audit set actor_user_id = null where actor_user_id = v_user;
  update public.dabbir_access_audit set target_user_id = null where target_user_id = v_user;
  update public.dabbir_creator_profiles set user_id = null where user_id = v_user;
  update public.dabbir_employee_invitations set accepted_by = null where accepted_by = v_user;
  delete from public.dabbir_employee_invitations where invited_by = v_user;
  update public.dabbir_handoffs set assigned_user_id = null where assigned_user_id = v_user;
  update public.dabbir_memberships set invited_by = null where invited_by = v_user;
  update public.dabbir_messages set sender_user_id = null where sender_user_id = v_user;
  update public.dabbir_offers set created_by_user_id = null where created_by_user_id = v_user;
  update public.dabbir_offers set payer_user_id = null where payer_user_id = v_user;
  update public.dabbir_owner_policy_audit set actor_user_id = null where actor_user_id = v_user;
  update public.dabbir_payments set payer_user_id = null where payer_user_id = v_user;
  update dabbir_private.platform_customer_support_cases set assigned_to = null where assigned_to = v_user;
  update dabbir_private.platform_customer_support_cases set created_by = null where created_by = v_user;
  update dabbir_private.platform_customer_support_cases set target_user_id = null where target_user_id = v_user;
  update dabbir_private.platform_customer_support_notes set actor_user_id = null where actor_user_id = v_user;
  update public.dabbir_procedure_definitions set created_by = null where created_by = v_user;
  update public.dabbir_procedure_runs set owner_approved_by = null where owner_approved_by = v_user;
  delete from public.dabbir_whatsapp_outbound_reservations where sender_user_id = v_user;

  -- DABBIR-specific visible account identity is removed. The global auth identity
  -- is intentionally retained because other products in this Supabase project can
  -- reference the same auth.users row.
  delete from public.dabbir_user_accounts where user_id = v_user;

  -- Product tombstone: block all future DABBIR API access while allowing the same
  -- auth.users identity to continue serving unrelated products in this project.
  insert into public.account_access_state(
    user_id,status,reason,suspended_at,suspended_by,reinstated_at,reinstated_by,updated_at
  ) values (
    v_user,'deleted','DABBIR_ACCOUNT_DELETED',null,null,null,null,now()
  )
  on conflict (user_id) do update set
    status='deleted',
    reason='DABBIR_ACCOUNT_DELETED',
    suspended_at=null,
    suspended_by=null,
    reinstated_at=null,
    reinstated_by=null,
    updated_at=now();

  select
      (select count(*) from public.dabbir_owner_decision_observations where owner_user_id = v_user)
    + (select count(*) from public.dabbir_owner_policy_versions where owner_user_id = v_user)
    into v_retained_refs;

  insert into dabbir_private.account_deletion_receipts(
    id,
    user_fingerprint,
    owned_business_count,
    removed_memberships,
    retained_operational_references,
    auth_identity_retained
  ) values (
    v_receipt_id,
    encode(extensions.digest(v_user::text, 'sha256'), 'hex'),
    v_owned_business_count,
    v_removed_memberships,
    v_retained_refs,
    true
  );

  return jsonb_build_object(
    'ok', true,
    'deleted', true,
    'scope', 'DABBIR_PRODUCT_ACCOUNT',
    'receipt_id', v_receipt_id,
    'owned_businesses_deleted', v_owned_business_count,
    'memberships_removed', v_removed_memberships,
    'retained_operational_references', v_retained_refs,
    'auth_identity_retained_for_shared_products', true,
    'dabbir_access_revoked', true
  );
end;
$function$;

revoke all on function public.dabbir_delete_current_user_account(text) from public, anon;
grant execute on function public.dabbir_delete_current_user_account(text) to authenticated;

comment on function public.dabbir_delete_current_user_account(text) is
  'Deletes the current authenticated user DABBIR product account and owned DABBIR tenant data, revokes future DABBIR access, and preserves the shared Supabase auth identity for other products.';
