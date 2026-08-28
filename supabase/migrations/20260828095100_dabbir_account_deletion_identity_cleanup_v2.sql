-- DABBIR account-deletion identity cleanup v2.
-- The v1 cleanup removed Apple entitlement state. This additive migration also
-- de-identifies retained DABBIR owner-memory records without deleting the shared
-- auth.users identity that may be used by unrelated products such as ZAJEL.

alter table public.dabbir_owner_decision_observations
  alter column owner_user_id drop not null;
alter table public.dabbir_owner_policy_versions
  alter column owner_user_id drop not null;

alter table public.dabbir_owner_decision_observations
  drop constraint if exists dabbir_owner_decision_observations_owner_user_id_fkey;
alter table public.dabbir_owner_decision_observations
  add constraint dabbir_owner_decision_observations_owner_user_id_fkey
  foreign key (owner_user_id) references auth.users(id) on delete set null;

alter table public.dabbir_owner_policy_versions
  drop constraint if exists dabbir_owner_policy_versions_owner_user_id_fkey;
alter table public.dabbir_owner_policy_versions
  add constraint dabbir_owner_policy_versions_owner_user_id_fkey
  foreign key (owner_user_id) references auth.users(id) on delete set null;

create or replace function dabbir_private.cleanup_dabbir_identity_on_account_tombstone()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if new.status = 'deleted'
     and (tg_op = 'INSERT' or old.status is distinct from 'deleted') then
    delete from public.dabbir_apple_entitlements where user_id = new.user_id;
    update public.dabbir_owner_decision_observations
       set owner_user_id = null
     where owner_user_id = new.user_id;
    update public.dabbir_owner_policy_versions
       set owner_user_id = null
     where owner_user_id = new.user_id;
  end if;
  return new;
end;
$function$;

revoke all on function dabbir_private.cleanup_dabbir_identity_on_account_tombstone() from public, anon, authenticated;

drop trigger if exists dabbir_account_delete_apple_entitlement on public.account_access_state;
drop trigger if exists dabbir_account_delete_identity_cleanup on public.account_access_state;
create trigger dabbir_account_delete_identity_cleanup
after insert or update of status on public.account_access_state
for each row execute function dabbir_private.cleanup_dabbir_identity_on_account_tombstone();

comment on function dabbir_private.cleanup_dabbir_identity_on_account_tombstone() is
  'Removes DABBIR Apple entitlement state and de-identifies retained DABBIR owner-memory records when the DABBIR product account becomes deleted; shared auth identity is preserved.';
