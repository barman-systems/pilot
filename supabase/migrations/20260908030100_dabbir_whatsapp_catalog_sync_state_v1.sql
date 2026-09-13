-- DABBIR WhatsApp Catalog sync-state v1
-- Prevents repeated Meta discovery calls when a tenant has no catalog or lacks permission.

create table if not exists public.dabbir_whatsapp_catalog_sync_state (
  connection_id uuid primary key references public.dabbir_whatsapp_connections(id) on delete cascade,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  branch_id uuid references public.dabbir_business_branches(id) on delete cascade,
  state text not null default 'never_synced' check (state in ('never_synced','synced','no_catalog','multiple_catalogs','permission_required','error')),
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  last_error_code text,
  provider_code text,
  updated_at timestamptz not null default now()
);

create index if not exists dabbir_whatsapp_catalog_sync_state_business_idx
  on public.dabbir_whatsapp_catalog_sync_state(business_id, branch_id, state, next_retry_at);

alter table public.dabbir_whatsapp_catalog_sync_state enable row level security;
revoke all on public.dabbir_whatsapp_catalog_sync_state from public,anon,authenticated;
grant select on public.dabbir_whatsapp_catalog_sync_state to authenticated;
grant select,insert,update,delete on public.dabbir_whatsapp_catalog_sync_state to service_role;

drop policy if exists dabbir_whatsapp_catalog_sync_state_owner_select on public.dabbir_whatsapp_catalog_sync_state;
create policy dabbir_whatsapp_catalog_sync_state_owner_select
on public.dabbir_whatsapp_catalog_sync_state for select to authenticated
using (
  dabbir_private.is_active_member(business_id)
  and exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_whatsapp_catalog_sync_state.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(array['owner'::text,'admin'::text])
  )
);

create or replace function public.dabbir_whatsapp_catalog_sync_due(
  p_business_id uuid,
  p_connection_id uuid,
  p_conversation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,dabbir_private
as $$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_state public.dabbir_whatsapp_catalog_sync_state%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections
   where id=p_connection_id and business_id=p_business_id and status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  if p_conversation_id is not null then
    select * into v_conversation from public.dabbir_conversations
     where id=p_conversation_id and business_id=p_business_id limit 1;
    if not found then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
    if v_connection.branch_id is not null and v_connection.branch_id is distinct from v_conversation.branch_id then
      raise exception 'WHATSAPP_CONVERSATION_BRANCH_SCOPE_MISMATCH';
    end if;
  end if;

  select * into v_state from public.dabbir_whatsapp_catalog_sync_state
   where connection_id=p_connection_id and business_id=p_business_id limit 1;

  if not found then
    return jsonb_build_object('due',true,'state','never_synced','next_retry_at',null);
  end if;
  return jsonb_build_object(
    'due',v_state.next_retry_at is null or v_state.next_retry_at <= v_now,
    'state',v_state.state,
    'next_retry_at',v_state.next_retry_at,
    'last_attempt_at',v_state.last_attempt_at
  );
end;
$$;

revoke all on function public.dabbir_whatsapp_catalog_sync_due(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_catalog_sync_due(uuid,uuid,uuid) to service_role;

create or replace function public.dabbir_whatsapp_catalog_record_attempt(
  p_business_id uuid,
  p_connection_id uuid,
  p_state text,
  p_retry_seconds integer,
  p_error_code text default null,
  p_provider_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,dabbir_private
as $$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_now timestamptz := clock_timestamp();
  v_state text := lower(trim(coalesce(p_state,'')));
  v_retry integer := greatest(0,least(coalesce(p_retry_seconds,3600),604800));
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_state not in ('never_synced','synced','no_catalog','multiple_catalogs','permission_required','error') then
    raise exception 'WHATSAPP_CATALOG_SYNC_STATE_INVALID';
  end if;

  select * into v_connection from public.dabbir_whatsapp_connections
   where id=p_connection_id and business_id=p_business_id and status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  insert into public.dabbir_whatsapp_catalog_sync_state(
    connection_id,business_id,branch_id,state,last_attempt_at,next_retry_at,last_error_code,provider_code,updated_at
  ) values (
    p_connection_id,p_business_id,v_connection.branch_id,v_state,v_now,v_now+make_interval(secs=>v_retry),
    left(nullif(trim(p_error_code),''),200),left(nullif(trim(p_provider_code),''),80),v_now
  )
  on conflict (connection_id) do update set
    business_id=excluded.business_id,
    branch_id=excluded.branch_id,
    state=excluded.state,
    last_attempt_at=excluded.last_attempt_at,
    next_retry_at=excluded.next_retry_at,
    last_error_code=excluded.last_error_code,
    provider_code=excluded.provider_code,
    updated_at=excluded.updated_at;

  return jsonb_build_object('state',v_state,'next_retry_at',v_now+make_interval(secs=>v_retry));
end;
$$;

revoke all on function public.dabbir_whatsapp_catalog_record_attempt(uuid,uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_catalog_record_attempt(uuid,uuid,text,integer,text,text) to service_role;
