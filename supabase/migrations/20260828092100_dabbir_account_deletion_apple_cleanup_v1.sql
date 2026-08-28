-- Ensure a DABBIR product-account tombstone removes the DABBIR Apple entitlement
-- while preserving the shared auth.users identity used by unrelated products.

create or replace function dabbir_private.delete_apple_entitlement_on_account_tombstone()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if new.status = 'deleted' and old.status is distinct from 'deleted' then
    delete from public.dabbir_apple_entitlements where user_id = new.user_id;
  end if;
  return new;
end;
$function$;

revoke all on function dabbir_private.delete_apple_entitlement_on_account_tombstone() from public, anon, authenticated;

drop trigger if exists dabbir_account_delete_apple_entitlement on public.account_access_state;
create trigger dabbir_account_delete_apple_entitlement
after update of status on public.account_access_state
for each row execute function dabbir_private.delete_apple_entitlement_on_account_tombstone();

comment on function dabbir_private.delete_apple_entitlement_on_account_tombstone() is
  'Deletes DABBIR Apple entitlement state when the DABBIR product account becomes deleted; does not delete shared auth identity.';
