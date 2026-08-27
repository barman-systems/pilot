-- Allocate the visible DABBIR customer number at DABBIR Auth signup.
-- Membership trigger remains as a repair/backfill safety net.

create or replace function dabbir_private.ensure_dabbir_user_account_from_auth()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if coalesce(new.raw_user_meta_data ->> 'product', '') = 'DABBIR' then
    insert into public.dabbir_user_accounts(user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
exception
  when others then
    -- Never make Auth signup unavailable solely because the support number
    -- could not be allocated. Membership provisioning retries it later.
    raise warning 'DABBIR_CUSTOMER_NUMBER_PROVISIONING_DEFERRED user_id=% sqlstate=%', new.id, sqlstate;
    return new;
end;
$function$;

revoke all on function dabbir_private.ensure_dabbir_user_account_from_auth() from public, anon, authenticated;

drop trigger if exists dabbir_auth_user_ensure_customer_number on auth.users;
create trigger dabbir_auth_user_ensure_customer_number
after insert or update of raw_user_meta_data on auth.users
for each row execute function dabbir_private.ensure_dabbir_user_account_from_auth();
