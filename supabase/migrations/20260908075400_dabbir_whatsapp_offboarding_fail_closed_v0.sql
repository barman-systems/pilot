-- Safety-first gate deployed before the application offboarding rollout.
-- 1) A DABBIR business with any WhatsApp connection cannot be deleted by cascade.
-- 2) If a newer/preview account-delete binary attempts the superseded local marker,
--    rewrite it to a non-sendable pending state so that caller verification fails
--    before it can contact Meta.

alter table public.dabbir_whatsapp_connections
  drop constraint if exists dabbir_whatsapp_connections_status_check;

alter table public.dabbir_whatsapp_connections
  add constraint dabbir_whatsapp_connections_status_check
  check (status in ('connected','verification_required','offboarding_pending','disconnected','error'));

create or replace function dabbir_private.guard_business_delete_whatsapp_offboarding()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $function$
begin
  if exists (
    select 1 from public.dabbir_whatsapp_connections c where c.business_id = old.id
  ) then
    raise exception 'DABBIR_WHATSAPP_OFFBOARDING_REQUIRED_BEFORE_BUSINESS_DELETE';
  end if;
  return old;
end;
$function$;

revoke all on function dabbir_private.guard_business_delete_whatsapp_offboarding() from public, anon, authenticated;

drop trigger if exists dabbir_business_delete_whatsapp_offboarding_guard on public.dabbir_businesses;
create trigger dabbir_business_delete_whatsapp_offboarding_guard
before delete on public.dabbir_businesses
for each row execute function dabbir_private.guard_business_delete_whatsapp_offboarding();

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

drop trigger if exists dabbir_whatsapp_block_legacy_account_offboarding on public.dabbir_whatsapp_connections;
create trigger dabbir_whatsapp_block_legacy_account_offboarding
before update of status,last_error on public.dabbir_whatsapp_connections
for each row execute function dabbir_private.block_legacy_whatsapp_account_offboarding();
