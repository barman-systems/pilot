-- DABBIR customer number allocation must never reuse an immutable ledger number.
-- Mumbai cutover evidence showed the restored sequence could lag behind the append-only
-- identity ledger, causing onboarding to fail with SQLSTATE 23505.

-- First align the sequence with every number already reserved in either truth surface.
select setval(
  'dabbir_private.dabbir_customer_number_seq'::regclass,
  greatest(
    (select last_value from dabbir_private.dabbir_customer_number_seq),
    coalesce((
      select max(substring(customer_no from 5)::bigint)
      from dabbir_private.dabbir_customer_number_ledger
      where customer_no ~ '^DAB-[0-9]+$'
    ), 100000),
    coalesce((
      select max(substring(customer_no from 5)::bigint)
      from public.dabbir_user_accounts
      where customer_no ~ '^DAB-[0-9]+$'
    ), 100000)
  ),
  true
);

-- Defense in depth: even if a future restore/cutover regresses the sequence again,
-- skip every number already present in the immutable ledger or active account table.
create or replace function dabbir_private.next_customer_number()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private
as $function$
declare
  v_no bigint;
  v_candidate text;
begin
  loop
    v_no := nextval('dabbir_private.dabbir_customer_number_seq');
    v_candidate := 'DAB-' || v_no::text;

    if not exists (
      select 1
      from dabbir_private.dabbir_customer_number_ledger l
      where l.customer_no = v_candidate
    ) and not exists (
      select 1
      from public.dabbir_user_accounts a
      where a.customer_no = v_candidate
    ) then
      return v_candidate;
    end if;
  end loop;
end;
$function$;

revoke all on function dabbir_private.next_customer_number() from public, anon, authenticated;

comment on function dabbir_private.next_customer_number() is
  'Allocates a monotonic DABBIR customer number while refusing to reuse any number reserved by the immutable ledger or active accounts, even after sequence restore drift.';