-- DABBIR WhatsApp account-offboarding root fix v1.
-- Safety prerequisite: 20260908075400_dabbir_whatsapp_offboarding_fail_closed_v0.sql.
--
-- Correct Coexistence lifecycle:
--   DABBIR freezes outbound -> owner disconnects DABBIR from WhatsApp Business
--   -> Meta sends signed account_update/PARTNER_REMOVED -> DABBIR records a
--   privacy-minimized receipt and erases local encrypted connection credentials
--   -> only then can normal DABBIR account deletion pass the business-delete guard.

-- One Meta WABA must never cross DABBIR tenant/business boundaries. The Meta
-- partner lifecycle is WABA-scoped, so allowing this would make one tenant's
-- offboarding event capable of affecting another tenant.
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

-- Retain only proof of provider-confirmed offboarding. No access token, WABA ID,
-- phone number, customer message, or business UUID is retained in plaintext.
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

-- Validate all account-delete blockers before freezing a customer's WhatsApp.
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
    'owned_business_count',cardinality(v_owned_business_ids),
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

-- Start owner-controlled Coexistence offboarding. This function does not call Meta
-- and cannot deregister a phone. It only freezes every WhatsApp connection owned by
-- the current DABBIR account so no new outbound action can start while the owner
-- performs WhatsApp Business > Account > Business Platform > Disconnect Account.
create or replace function dabbir_private.dabbir_begin_whatsapp_account_offboarding_impl()
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

  update public.dabbir_whatsapp_connections c
     set status='offboarding_pending',
         last_error='ACCOUNT_DELETE_WAITING_FOR_META_PARTNER_REMOVED',
         updated_at=now()
   where c.business_id=any(v_owned_business_ids);

  select count(*), count(distinct c.waba_id)
    into v_connection_count, v_waba_count
  from public.dabbir_whatsapp_connections c
  where c.business_id=any(v_owned_business_ids);

  return jsonb_build_object(
    'ok',true,
    'disconnect_required',(v_connection_count > 0),
    'whatsapp_connection_count',v_connection_count,
    'whatsapp_waba_count',v_waba_count,
    'state',case when v_connection_count > 0 then 'WAITING_FOR_META_PARTNER_REMOVED' else 'NO_WHATSAPP_CONNECTIONS' end
  );
end;
$function$;

revoke all on function dabbir_private.dabbir_begin_whatsapp_account_offboarding_impl() from public, anon;
grant execute on function dabbir_private.dabbir_begin_whatsapp_account_offboarding_impl() to authenticated;

create or replace function public.dabbir_begin_whatsapp_account_offboarding()
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $function$
  select dabbir_private.dabbir_begin_whatsapp_account_offboarding_impl();
$function$;

revoke all on function public.dabbir_begin_whatsapp_account_offboarding() from public, anon;
grant execute on function public.dabbir_begin_whatsapp_account_offboarding() to authenticated;

-- Apply signed Meta lifecycle truth. PARTNER_REMOVED is the terminal evidence that
-- DABBIR's Coexistence partner relationship ended. The webhook route verifies the
-- Meta HMAC signature before it can invoke this service-role-only RPC.
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
  v_deleted integer := 0;
begin
  if v_waba !~ '^[0-9]{5,40}$' then raise exception 'WHATSAPP_ACCOUNT_UPDATE_WABA_REQUIRED'; end if;
  if length(v_event) < 3 or length(v_event) > 80 then raise exception 'WHATSAPP_ACCOUNT_UPDATE_EVENT_REQUIRED'; end if;

  if v_event <> 'PARTNER_REMOVED' then
    return jsonb_build_object('ok',true,'matched',false,'terminal',false,'event',v_event);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dabbir:offboard:' || v_waba, 0));

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
  get diagnostics v_deleted = row_count;

  if v_deleted <> v_count or v_deleted < 1 then
    raise exception 'WHATSAPP_ACCOUNT_UPDATE_DELETE_UNVERIFIED';
  end if;

  return jsonb_build_object(
    'ok',true,
    'matched',true,
    'terminal',true,
    'event',v_event,
    'connections_removed',v_deleted
  );
end;
$function$;

revoke all on function public.dabbir_whatsapp_apply_account_update(text,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.dabbir_whatsapp_apply_account_update(text,text,text,text,text,timestamptz) to service_role;

-- Last line of defence against stale workers: every provider send must re-check
-- the exact connection immediately before decrypting the credential / calling Meta.
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
