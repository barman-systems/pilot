-- Compatibility hardening for older DABBIR clients.
-- Legacy account deletion attempted status=disconnected with this exact marker,
-- then planned to unsubscribe WABA webhooks. Rewrite that state transition to the
-- provider-confirmed Coexistence offboarding state. The legacy caller verifies it
-- received `disconnected`, sees `offboarding_pending` instead, and stops before any
-- Meta request. DABBIR outbound is already frozen because only `connected` sends.
create or replace function dabbir_private.block_legacy_whatsapp_account_offboarding()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $function$
begin
  if new.status='disconnected'
     and new.last_error='ACCOUNT_DELETE_OFFBOARDING'
  then
    new.status := 'offboarding_pending';
    new.last_error := 'ACCOUNT_DELETE_WAITING_FOR_META_PARTNER_REMOVED';
  end if;
  return new;
end;
$function$;

revoke all on function dabbir_private.block_legacy_whatsapp_account_offboarding() from public, anon, authenticated;
