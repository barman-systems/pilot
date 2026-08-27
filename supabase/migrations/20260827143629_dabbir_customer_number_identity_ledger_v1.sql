-- Private immutable recovery ledger for DABBIR visible customer numbers.

create table if not exists dabbir_private.dabbir_customer_number_ledger (
  user_id uuid primary key,
  customer_no text not null unique,
  allocated_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint dabbir_customer_number_ledger_format check (customer_no ~ '^DAB-[0-9]{6,}$')
);

create or replace function dabbir_private.block_customer_number_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, dabbir_private
as $function$
begin
  raise exception 'DABBIR_CUSTOMER_NUMBER_LEDGER_APPEND_ONLY';
end;
$function$;
revoke all on function dabbir_private.block_customer_number_ledger_mutation() from public, anon, authenticated;

drop trigger if exists dabbir_customer_number_ledger_append_only on dabbir_private.dabbir_customer_number_ledger;
create trigger dabbir_customer_number_ledger_append_only
before update or delete on dabbir_private.dabbir_customer_number_ledger
for each row execute function dabbir_private.block_customer_number_ledger_mutation();

insert into dabbir_private.dabbir_customer_number_ledger(user_id, customer_no, allocated_at)
select user_id, customer_no, created_at
from public.dabbir_user_accounts
on conflict (user_id) do nothing;

create or replace function dabbir_private.record_customer_number_ledger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private
as $function$
declare
  v_existing text;
begin
  select customer_no into v_existing
  from dabbir_private.dabbir_customer_number_ledger
  where user_id = new.user_id;

  if found then
    if v_existing is distinct from new.customer_no then
      raise exception 'DABBIR_CUSTOMER_NUMBER_LEDGER_MISMATCH';
    end if;
    return new;
  end if;

  insert into dabbir_private.dabbir_customer_number_ledger(user_id, customer_no, allocated_at)
  values (new.user_id, new.customer_no, new.created_at);
  return new;
end;
$function$;
revoke all on function dabbir_private.record_customer_number_ledger() from public, anon, authenticated;

drop trigger if exists dabbir_user_account_record_ledger on public.dabbir_user_accounts;
create trigger dabbir_user_account_record_ledger
after insert on public.dabbir_user_accounts
for each row execute function dabbir_private.record_customer_number_ledger();

create or replace function dabbir_private.repair_customer_number(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private
as $function$
declare
  v_row dabbir_private.dabbir_customer_number_ledger%rowtype;
begin
  select * into v_row
  from dabbir_private.dabbir_customer_number_ledger
  where user_id = p_user_id;
  if not found then
    raise exception 'DABBIR_CUSTOMER_NUMBER_LEDGER_NOT_FOUND';
  end if;

  insert into public.dabbir_user_accounts(user_id, customer_no, created_at)
  values (v_row.user_id, v_row.customer_no, v_row.allocated_at)
  on conflict (user_id) do nothing;

  return v_row.customer_no;
end;
$function$;
revoke all on function dabbir_private.repair_customer_number(uuid) from public, anon, authenticated;
grant execute on function dabbir_private.repair_customer_number(uuid) to service_role;
