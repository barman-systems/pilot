-- DABBIR customer number single-source cleanup.
-- Keep public.dabbir_user_accounts + dabbir_private ledger as authoritative.
-- Remove the parallel dabbir_user_numbers implementation only after proving exact identity parity.

do $block$
declare
  v_mismatch_count bigint;
begin
  if to_regclass('public.dabbir_user_accounts') is null then
    raise exception 'DABBIR_CUSTOMER_NUMBER_AUTHORITATIVE_REGISTRY_MISSING';
  end if;

  if to_regclass('public.dabbir_user_numbers') is null then
    return;
  end if;

  select count(*)
    into v_mismatch_count
  from public.dabbir_user_accounts a
  full join public.dabbir_user_numbers n using (user_id)
  where a.user_id is null
     or n.user_id is null
     or a.customer_no is distinct from n.customer_no;

  if v_mismatch_count <> 0 then
    raise exception 'DABBIR_CUSTOMER_NUMBER_REGISTRY_MISMATCH count=%', v_mismatch_count;
  end if;
end;
$block$;

drop trigger if exists trg_dabbir_assign_user_number_on_membership on public.dabbir_memberships;

drop function if exists public.dabbir_support_resolve_account(text);
drop function if exists public.dabbir_resolve_customer_no(text);
drop function if exists public.dabbir_my_customer_no();
drop function if exists public.dabbir_assign_user_number_on_membership();
drop function if exists public.dabbir_ensure_user_number(uuid);

drop table if exists public.dabbir_user_numbers;

comment on table public.dabbir_user_accounts is
  'AUTHORITATIVE DABBIR visible account-number registry. UUID auth.users.id remains canonical; customer_no is the stable human-facing support identifier.';
