-- DABBIR WhatsApp account-offboarding root fix v1.
-- A business must never disappear by cascade while DABBIR still has an active Meta
-- integration for it.  This migration makes offboarding explicit, tenant-safe and
-- fail-closed before any business/account deletion can complete.

-- A WABA subscription is app-wide at the WABA boundary.  Sharing one WABA across
-- different DABBIR businesses would make a remote unsubscribe for one tenant affect
-- another tenant.  Fail deployment if legacy data already violates that invariant.
do $$
begin
  if exists (
    select 1
    from public.dabbir_whatsapp_connections
    group by waba_id
    having count(distinct business_id) > 1
  ) then
    raise exception 'DABBIR_WHATSAPP_WABA_CROSS_BUSINESS_EXISTING';
  end if;
end;
$$;

create or replace function dabbir_private.guard_whatsapp_waba_business_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $function$
begin
  -- Serialize competing inserts/updates for the same Meta WABA so two tenants
  -- cannot race past the existence check.
  perform pg_advisory_xact_lock(hashtextextended('dabbir:waba:' || trim(new.waba_id), 0));

  if exists (
    select 1
    from public.dabbir_whatsapp_connections c
    where c.waba_id = trim(new.waba_id)
      and c.business_id <> new.business_id
      and c.id <> new.id
  ) then
    raise exception 'DABBIR_WHATSAPP_WABA_CROSS_BUSINESS_FORBIDDEN';
  end if;
  return new;
end;
$function$;

revoke all on function dabbir_private.guard_whatsapp_waba_business_scope() from public, anon, authenticated;

drop trigger if exists dabbir_whatsapp_waba_business_scope_guard on public.dabbir_whatsapp_connections;
create trigger dabbir_whatsapp_waba_business_scope_guard
before insert or update of waba_id, business_id on public.dabbir_whatsapp_connections
for each row execute function dabbir_private.guard_whatsapp_waba_business_scope();

-- Never let ON DELETE CASCADE erase the encrypted Meta credential before the
-- application has remotely unsubscribed and explicitly removed the connection.
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

-- Preflight the irreversible account-delete path before any external Meta mutation.
create or replace function dabbir_private.dabbir_account_delete_preflight_impl()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_owned_business_ids uuid[] := '{}'::uuid[];
  v_connection_count integer := 0;
  v_waba_ids jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists (select 1 from public.account_access_state where user_id=v_user and status='deleted') then
    raise exception 'DABBIR_ACCOUNT_ALREADY_DELETED';
  end if;
  if exists (select 1 from public.dabbir_platform_admins where user_id=v_user) then
    raise exception 'PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF';
  end if;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_owned_business_ids
  from public.dabbir_businesses
  where owner_id=v_user;

  if exists (
    select 1 from public.dabbir_retention_policies
    where business_id=any(v_owned_business_ids) and policy_state='LEGAL_HOLD'
  ) then
    raise exception 'ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD';
  end if;

  select count(*), coalesce(jsonb_agg(distinct c.waba_id), '[]'::jsonb)
    into v_connection_count, v_waba_ids
  from public.dabbir_whatsapp_connections c
  where c.business_id=any(v_owned_business_ids);

  return jsonb_build_object(
    'ok', true,
    'owned_business_ids', to_jsonb(v_owned_business_ids),
    'whatsapp_connection_count', v_connection_count,
    'whatsapp_waba_ids', v_waba_ids
  );
end;
$function$;

revoke all on function dabbir_private.dabbir_account_delete_preflight_impl() from public, anon;
grant execute on function dabbir_private.dabbir_account_delete_preflight_impl() to authenticated;

create or replace function public.dabbir_account_delete_preflight()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select dabbir_private.dabbir_account_delete_preflight_impl();
$function$;

revoke all on function public.dabbir_account_delete_preflight() from public, anon;
grant execute on function public.dabbir_account_delete_preflight() to authenticated;

-- Provider-boundary guard used by service-role senders.  This closes the normal
-- stale-reservation path after a connection has been frozen for offboarding.
create or replace function public.dabbir_whatsapp_assert_connection_sendable(
  p_business_id uuid,
  p_connection_id uuid
)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if p_business_id is null or p_connection_id is null then
    raise exception 'WHATSAPP_SENDABLE_CONTEXT_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.dabbir_whatsapp_connections c
    where c.id=p_connection_id
      and c.business_id=p_business_id
      and c.status='connected'
  ) then
    raise exception 'WHATSAPP_CONNECTION_NOT_SENDABLE';
  end if;
  return true;
end;
$function$;

revoke all on function public.dabbir_whatsapp_assert_connection_sendable(uuid,uuid) from public, anon, authenticated;
grant execute on function public.dabbir_whatsapp_assert_connection_sendable(uuid,uuid) to service_role;
