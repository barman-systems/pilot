-- DABBIR account deletion Apple-compliance preflight v1.
-- This performs every known deterministic deletion blocker check before any
-- external Sign in with Apple token revocation occurs. It does not mutate data.

create or replace function dabbir_private.dabbir_delete_current_user_account_preflight_impl(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_owned_business_ids uuid[] := '{}'::uuid[];
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_confirmation is distinct from 'DELETE_DABBIR_ACCOUNT' then raise exception 'ACCOUNT_DELETE_CONFIRMATION_REQUIRED'; end if;

  if exists (
    select 1 from public.account_access_state
    where user_id = v_user and status = 'deleted'
  ) then
    raise exception 'DABBIR_ACCOUNT_ALREADY_DELETED';
  end if;

  if exists (select 1 from public.dabbir_platform_admins where user_id = v_user) then
    raise exception 'PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF';
  end if;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_owned_business_ids
  from public.dabbir_businesses
  where owner_id = v_user;

  if exists (
    select 1 from public.dabbir_retention_policies
    where business_id = any(v_owned_business_ids)
      and policy_state = 'LEGAL_HOLD'
  ) then
    raise exception 'ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD';
  end if;

  return jsonb_build_object(
    'ok', true,
    'allowed', true,
    'scope', 'DABBIR_PRODUCT_ACCOUNT'
  );
end;
$function$;

revoke all on function dabbir_private.dabbir_delete_current_user_account_preflight_impl(text) from public, anon;
grant execute on function dabbir_private.dabbir_delete_current_user_account_preflight_impl(text) to authenticated;

create or replace function public.dabbir_delete_current_user_account_preflight(p_confirmation text)
returns jsonb
language sql
set search_path = ''
as $function$
  select dabbir_private.dabbir_delete_current_user_account_preflight_impl(p_confirmation);
$function$;

revoke all on function public.dabbir_delete_current_user_account_preflight(text) from public, anon;
grant execute on function public.dabbir_delete_current_user_account_preflight(text) to authenticated;

comment on function public.dabbir_delete_current_user_account_preflight(text) is
  'Read-only account deletion preflight. Verifies DABBIR deletion blockers before any external Apple authorization revocation.';
