-- DABBIR WhatsApp account-offboarding root fix v1.
-- Coexistence offboarding is owner-controlled in the WhatsApp Business app.
-- DABBIR must freeze outbound immediately, wait for Meta's signed
-- account_update/PARTNER_REMOVED evidence, erase the encrypted connection, and
-- only then permit business/account deletion.

-- Offboarding is a real lifecycle state.  It is deliberately non-sendable.
alter table public.dabbir_whatsapp_connections
  drop constraint if exists dabbir_whatsapp_connections_status_check;

alter table public.dabbir_whatsapp_connections
  add constraint dabbir_whatsapp_connections_status_check
  check (status in ('connected','verification_required','offboarding_pending','disconnected','error'));

-- A WABA subscription/partner relationship is wider than one branch. Sharing one
-- WABA across different DABBIR businesses could let one tenant's lifecycle event
-- affect another tenant. Fail deployment if legacy data already violates this.
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
  perform pg_advisory_xact_lock(hashtextextended('dabbir:waba:' || trim(new.waba_id), 0));

  if exists (
    select 1
    from public.dabbir_whatsapp_connections c
    where c.waba_id = trim(new.waba_id)
      and c.business_id <> new.business_id
      and c.id is distinct from new.id
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

-- Never let ON DELETE CASCADE erase Meta credentials before provider-confirmed
-- offboarding has explicitly removed the connection row.
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

-- Minimal retained evidence that Meta, not a local UI action, confirmed the
-- partner removal. Identifiers are one-way fingerprints; access tokens are never
-- copied into this table.
create table if not exists dabbir_private.whatsapp_offboarding_receipts (
  id uuid primary key default gen_random_uuid(),
  business_fingerprint text not null,
  waba_fingerprint text not null,
  phone_fingerprint text,
  connection_count integer not null check (connection_count > 0),
  provider_event text not null,
  initiated_by text,
  reason text,
  provider_occurred_at timestamptz,
  received_at timestamptz not null default now()
);

revoke all on table dabbir_private.whatsapp_offboarding_receipts from public, anon, authenticated;

-- Apply the signed Meta account_update lifecycle event. PARTNER_REMOVED is the
-- provider evidence that a Coexistence business disconnected DABBIR/Cloud API.
-- Because the partner relationship is WABA-scoped, all local connections for the
-- WABA are removed together. This also handles system-initiated partner removal
-- (for example primary-device inactivity) truthfully.
create or replace function public.dabbir_whatsapp_apply_account_update(
  p_waba_id text,
  p_event text,
  p_phone_number text default null,
  p_reason text default null,
  p_initiated_by text default null,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, dabbir_private, extensions, pg_temp
as $function$
declare
  v_waba text := trim(coalesce(p_waba_id,''));
  v_event text := upper(trim(coalesce(p_event,'')));
  v_phone text := regexp_replace(coalesce(p_phone_number,''),'[^0-9]','','g');
  v_business uuid;
  v_count integer := 0;
begin
  if v_waba !~ '^[0-9]{5,40}$' then raise exception 'WHATSAPP_ACCOUNT_UPDATE_WABA_REQUIRED'; end if;
  if length(v_event) < 3 or length(v_event) > 80 then raise exception 'WHATSAPP_ACCOUNT_UPDATE_EVENT_REQUIRED'; end if;

  if v_event <> 'PARTNER_REMOVED' then
    return jsonb_build_object('ok',true,'matched',false,'terminal',false,'event',v_event);
  end if;

  select c.business_id
    into v_business
  from public.dabbir_whatsapp_connections c
  where c.waba_id=v_waba
  order by c.created_at asc
  limit 1;

  if v_business is null then
    return jsonb_build_object('ok',true,'matched',false,'terminal',true,'event',v_event);
  end if;

  select count(*) into v_count
  from public.dabbir_whatsapp_connections c
  where c.waba_id=v_waba and c.business_id=v_business;

  insert into dabbir_private.whatsapp_offboarding_receipts(
    business_fingerprint,waba_fingerprint,phone_fingerprint,connection_count,
    provider_event,initiated_by,reason,provider_occurred_at
  ) values (
    encode(extensions.digest(v_business::text,'sha256'),'hex'),
    encode(extensions.digest(v_waba,'sha256'),'hex'),
    case when v_phone='' then null else encode(extensions.digest(v_phone,'sha256'),'hex') end,
    v_count,
    v_event,
    left(nullif(trim(coalesce(p_initiated_by,'')),''),40),
    left(nullif(trim(coalesce(p_reason,'')),''),120),
    p_occurred_at
  );

  delete from public.dabbir_whatsapp_connections c
  where c.waba_id=v_waba and c.business_id=v_business;

  if not found then raise exception 'WHATSAPP_ACCOUNT_UPDATE_DELETE_UNVERIFIED'; end if;

  return jsonb_build_object(
    'ok',true,
    'matched',true,
    'terminal',true,
    'event',v_event,
    'business_id',v_business,
    'connections_removed',v_count
  );
end;
$function$;

revoke all on function public.dabbir_whatsapp_apply_account_update(text,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.dabbir_whatsapp_apply_account_update(text,text,text,text,text,timestamptz) to service_role;

-- Preflight every irreversible account-delete blocker before the application
-- changes WhatsApp state. If any WhatsApp connection remains, deletion must pause
-- until Meta emits PARTNER_REMOVED and the function above removes the credentials.
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
  v_waba_count integer := 0;
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

  select count(*), count(distinct c.waba_id)
    into v_connection_count, v_waba_count
  from public.dabbir_whatsapp_connections c
  where c.business_id=any(v_owned_business_ids);

  return jsonb_build_object(
    'ok',true,
    'owned_business_ids',to_jsonb(v_owned_business_ids),
    'whatsapp_connection_count',v_connection_count,
    'whatsapp_waba_count',v_waba_count,
    'whatsapp_disconnect_required',(v_connection_count > 0)
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

-- Provider-boundary guard closes stale-worker races after account deletion changes
-- a connection to offboarding_pending. Only an exact live connected row may send.
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
