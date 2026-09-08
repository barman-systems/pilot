-- DABBIR WhatsApp Catalog v1
-- Tenant-scoped Meta catalog discovery/sync and deterministic service mapping.

create table if not exists public.dabbir_whatsapp_catalogs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  branch_id uuid references public.dabbir_business_branches(id) on delete cascade,
  connection_id uuid not null references public.dabbir_whatsapp_connections(id) on delete cascade,
  meta_catalog_id text not null check (meta_catalog_id ~ '^[0-9]{5,40}$'),
  name text,
  status text not null default 'connected' check (status in ('connected','disconnected','error')),
  is_primary boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, meta_catalog_id)
);

create unique index if not exists dabbir_whatsapp_catalogs_one_primary_per_connection
  on public.dabbir_whatsapp_catalogs(connection_id)
  where is_primary;
create index if not exists dabbir_whatsapp_catalogs_business_branch_idx
  on public.dabbir_whatsapp_catalogs(business_id, branch_id, status);

create table if not exists public.dabbir_whatsapp_catalog_items (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.dabbir_whatsapp_catalogs(id) on delete cascade,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  branch_id uuid references public.dabbir_business_branches(id) on delete cascade,
  connection_id uuid not null references public.dabbir_whatsapp_connections(id) on delete cascade,
  meta_product_id text,
  product_retailer_id text not null check (length(product_retailer_id) between 1 and 255),
  service_id uuid references public.dabbir_services(id) on delete set null,
  name text,
  description text,
  price_text text,
  currency text,
  image_url text,
  availability text,
  visibility text,
  match_source text not null default 'none' check (match_source in ('none','retailer_service_id','exact_name','manual')),
  active boolean not null default true,
  raw_payload jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_id, product_retailer_id)
);

create index if not exists dabbir_whatsapp_catalog_items_business_branch_idx
  on public.dabbir_whatsapp_catalog_items(business_id, branch_id, active);
create index if not exists dabbir_whatsapp_catalog_items_service_idx
  on public.dabbir_whatsapp_catalog_items(service_id)
  where active and service_id is not null;

alter table public.dabbir_whatsapp_catalogs enable row level security;
alter table public.dabbir_whatsapp_catalog_items enable row level security;

revoke all on public.dabbir_whatsapp_catalogs from public, anon, authenticated;
revoke all on public.dabbir_whatsapp_catalog_items from public, anon, authenticated;
grant select on public.dabbir_whatsapp_catalogs to authenticated;
grant select on public.dabbir_whatsapp_catalog_items to authenticated;
grant select, insert, update, delete on public.dabbir_whatsapp_catalogs to service_role;
grant select, insert, update, delete on public.dabbir_whatsapp_catalog_items to service_role;

drop policy if exists dabbir_whatsapp_catalogs_owner_select on public.dabbir_whatsapp_catalogs;
create policy dabbir_whatsapp_catalogs_owner_select
on public.dabbir_whatsapp_catalogs for select to authenticated
using (
  dabbir_private.is_active_member(business_id)
  and exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_whatsapp_catalogs.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(array['owner'::text,'admin'::text])
  )
);

drop policy if exists dabbir_whatsapp_catalog_items_owner_select on public.dabbir_whatsapp_catalog_items;
create policy dabbir_whatsapp_catalog_items_owner_select
on public.dabbir_whatsapp_catalog_items for select to authenticated
using (
  dabbir_private.is_active_member(business_id)
  and exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_whatsapp_catalog_items.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(array['owner'::text,'admin'::text])
  )
);

create or replace function public.dabbir_whatsapp_catalog_apply_sync(
  p_business_id uuid,
  p_connection_id uuid,
  p_meta_catalog_id text,
  p_catalog_name text,
  p_items jsonb,
  p_make_primary boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private
as $$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_catalog_id uuid;
  v_item jsonb;
  v_retailer text;
  v_item_name text;
  v_service_id uuid;
  v_candidate uuid;
  v_candidates uuid[];
  v_match_source text;
  v_seen int := 0;
  v_mapped int := 0;
  v_sync_at timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_business_id is null or p_connection_id is null or coalesce(trim(p_meta_catalog_id),'') !~ '^[0-9]{5,40}$' then
    raise exception 'WHATSAPP_CATALOG_SYNC_CONTEXT_INVALID';
  end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb)) > 500 then
    raise exception 'WHATSAPP_CATALOG_SYNC_ITEMS_INVALID';
  end if;

  select * into v_connection
  from public.dabbir_whatsapp_connections
  where id = p_connection_id and business_id = p_business_id and status = 'connected'
  limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  if p_make_primary then
    update public.dabbir_whatsapp_catalogs
       set is_primary = false, updated_at = v_sync_at
     where connection_id = p_connection_id and is_primary;
  end if;

  insert into public.dabbir_whatsapp_catalogs(
    business_id, branch_id, connection_id, meta_catalog_id, name,
    status, is_primary, last_synced_at, last_error, updated_at
  ) values (
    p_business_id, v_connection.branch_id, p_connection_id, trim(p_meta_catalog_id), left(nullif(trim(p_catalog_name),''),300),
    'connected', coalesce(p_make_primary,false), v_sync_at, null, v_sync_at
  )
  on conflict (connection_id, meta_catalog_id) do update set
    business_id = excluded.business_id,
    branch_id = excluded.branch_id,
    name = excluded.name,
    status = 'connected',
    is_primary = case when p_make_primary then true else public.dabbir_whatsapp_catalogs.is_primary end,
    last_synced_at = excluded.last_synced_at,
    last_error = null,
    updated_at = excluded.updated_at
  returning id into v_catalog_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_retailer := left(trim(coalesce(v_item->>'product_retailer_id','')),255);
    if v_retailer = '' then continue; end if;
    v_item_name := left(trim(coalesce(v_item->>'name','')),300);
    v_service_id := null;
    v_match_source := 'none';

    if v_retailer ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_candidate := v_retailer::uuid;
      if exists (
        select 1 from public.dabbir_services s
        where s.id = v_candidate and s.business_id = p_business_id and s.active
          and (
            v_connection.branch_id is null
            or exists (
              select 1 from public.dabbir_branch_services bs
              where bs.business_id = p_business_id
                and bs.branch_id = v_connection.branch_id
                and bs.service_id = s.id
                and bs.active
            )
          )
      ) then
        v_service_id := v_candidate;
        v_match_source := 'retailer_service_id';
      end if;
    end if;

    if v_service_id is null and v_item_name <> '' then
      select array_agg(s.id order by s.id)
        into v_candidates
      from public.dabbir_services s
      where s.business_id = p_business_id
        and s.active
        and lower(regexp_replace(trim(coalesce(nullif(s.name_ar,''),nullif(s.name,''),nullif(s.name_en,''),'')), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(v_item_name, '[[:space:]]+', ' ', 'g'))
        and (
          v_connection.branch_id is null
          or exists (
            select 1 from public.dabbir_branch_services bs
            where bs.business_id = p_business_id
              and bs.branch_id = v_connection.branch_id
              and bs.service_id = s.id
              and bs.active
          )
        );
      if coalesce(array_length(v_candidates,1),0) = 1 then
        v_service_id := v_candidates[1];
        v_match_source := 'exact_name';
      end if;
    end if;

    insert into public.dabbir_whatsapp_catalog_items(
      catalog_id,business_id,branch_id,connection_id,meta_product_id,product_retailer_id,
      service_id,name,description,price_text,currency,image_url,availability,visibility,
      match_source,active,raw_payload,last_seen_at,updated_at
    ) values (
      v_catalog_id,p_business_id,v_connection.branch_id,p_connection_id,
      left(nullif(trim(v_item->>'meta_product_id'),''),255),v_retailer,
      v_service_id,nullif(v_item_name,''),left(nullif(trim(v_item->>'description'),''),2000),
      left(nullif(trim(v_item->>'price'),''),120),left(nullif(trim(v_item->>'currency'),''),12),
      left(nullif(trim(v_item->>'image_url'),''),2000),left(nullif(trim(v_item->>'availability'),''),80),
      left(nullif(trim(v_item->>'visibility'),''),80),v_match_source,true,v_item,v_sync_at,v_sync_at
    )
    on conflict (catalog_id,product_retailer_id) do update set
      business_id = excluded.business_id,
      branch_id = excluded.branch_id,
      connection_id = excluded.connection_id,
      meta_product_id = excluded.meta_product_id,
      service_id = coalesce(excluded.service_id, public.dabbir_whatsapp_catalog_items.service_id),
      name = excluded.name,
      description = excluded.description,
      price_text = excluded.price_text,
      currency = excluded.currency,
      image_url = excluded.image_url,
      availability = excluded.availability,
      visibility = excluded.visibility,
      match_source = case
        when public.dabbir_whatsapp_catalog_items.match_source = 'manual' and public.dabbir_whatsapp_catalog_items.service_id is not null
          then 'manual'
        when excluded.service_id is not null then excluded.match_source
        else public.dabbir_whatsapp_catalog_items.match_source
      end,
      active = true,
      raw_payload = excluded.raw_payload,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at;

    v_seen := v_seen + 1;
    if v_service_id is not null then v_mapped := v_mapped + 1; end if;
  end loop;

  update public.dabbir_whatsapp_catalog_items
     set active = false, updated_at = v_sync_at
   where catalog_id = v_catalog_id and last_seen_at < v_sync_at;

  return jsonb_build_object(
    'catalog_row_id',v_catalog_id,
    'catalog_id',trim(p_meta_catalog_id),
    'items_seen',v_seen,
    'items_mapped',v_mapped,
    'items_unmapped',greatest(v_seen-v_mapped,0),
    'branch_id',v_connection.branch_id,
    'primary',coalesce(p_make_primary,false),
    'synced_at',v_sync_at
  );
end;
$$;

revoke all on function public.dabbir_whatsapp_catalog_apply_sync(uuid,uuid,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_catalog_apply_sync(uuid,uuid,text,text,jsonb,boolean) to service_role;

create or replace function public.dabbir_whatsapp_catalog_menu(
  p_business_id uuid,
  p_connection_id uuid,
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private
as $$
declare
  v_conversation public.dabbir_conversations%rowtype;
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_result jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;

  select * into v_conversation from public.dabbir_conversations
   where id = p_conversation_id and business_id = p_business_id limit 1;
  if not found then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections
   where id = p_connection_id and business_id = p_business_id and status = 'connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;
  if v_connection.branch_id is not null and v_connection.branch_id is distinct from v_conversation.branch_id then
    raise exception 'WHATSAPP_CONVERSATION_BRANCH_SCOPE_MISMATCH';
  end if;

  select jsonb_build_object(
    'catalog_id',c.meta_catalog_id,
    'catalog_name',c.name,
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'product_retailer_id',i.product_retailer_id,
      'service_id',i.service_id,
      'name',coalesce(i.name,s.name_ar,s.name,s.name_en)
    ) order by coalesce(i.name,s.name_ar,s.name,s.name_en)) filter (where i.id is not null),'[]'::jsonb)
  ) into v_result
  from public.dabbir_whatsapp_catalogs c
  left join public.dabbir_whatsapp_catalog_items i
    on i.catalog_id = c.id and i.active and i.service_id is not null
  left join public.dabbir_services s
    on s.id = i.service_id and s.business_id = p_business_id and s.active
  where c.business_id = p_business_id
    and c.connection_id = p_connection_id
    and c.status = 'connected'
    and c.is_primary
    and (
      i.id is null
      or v_conversation.branch_id is null
      or exists (
        select 1 from public.dabbir_branch_services bs
        where bs.business_id = p_business_id
          and bs.branch_id = v_conversation.branch_id
          and bs.service_id = i.service_id
          and bs.active
      )
    )
  group by c.id,c.meta_catalog_id,c.name
  limit 1;

  return coalesce(v_result,jsonb_build_object('items','[]'::jsonb));
end;
$$;

revoke all on function public.dabbir_whatsapp_catalog_menu(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_catalog_menu(uuid,uuid,uuid) to service_role;

create or replace function public.dabbir_whatsapp_catalog_resolve_service(
  p_business_id uuid,
  p_conversation_id uuid,
  p_meta_catalog_id text,
  p_product_retailer_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private
as $$
declare
  v_branch_id uuid;
  v_row record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;

  select branch_id into v_branch_id
  from public.dabbir_conversations
  where id = p_conversation_id and business_id = p_business_id
  limit 1;
  if not found then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;

  select
    s.id as service_id,
    coalesce(nullif(s.name_ar,''),nullif(s.name,''),nullif(s.name_en,'')) as service_name,
    s.duration_minutes,
    coalesce(s.price_amount,s.price_aed) as price,
    i.product_retailer_id,
    c.meta_catalog_id,
    i.match_source
  into v_row
  from public.dabbir_whatsapp_catalogs c
  join public.dabbir_whatsapp_catalog_items i on i.catalog_id = c.id
  join public.dabbir_whatsapp_connections wc on wc.id = c.connection_id
  join public.dabbir_services s on s.id = i.service_id
  where c.business_id = p_business_id
    and c.status = 'connected'
    and c.meta_catalog_id = trim(p_meta_catalog_id)
    and i.business_id = p_business_id
    and i.active
    and i.product_retailer_id = trim(p_product_retailer_id)
    and wc.business_id = p_business_id
    and wc.status = 'connected'
    and (wc.branch_id is null or wc.branch_id is not distinct from v_branch_id)
    and s.business_id = p_business_id
    and s.active
    and (
      v_branch_id is null
      or exists (
        select 1 from public.dabbir_branch_services bs
        where bs.business_id = p_business_id
          and bs.branch_id = v_branch_id
          and bs.service_id = s.id
          and bs.active
      )
    )
  order by (wc.branch_id is not distinct from v_branch_id) desc, c.is_primary desc, c.updated_at desc
  limit 1;

  if not found then return null; end if;
  return jsonb_build_object(
    'service_id',v_row.service_id,
    'service_name',v_row.service_name,
    'duration_minutes',v_row.duration_minutes,
    'price',v_row.price,
    'product_retailer_id',v_row.product_retailer_id,
    'catalog_id',v_row.meta_catalog_id,
    'match_source',v_row.match_source
  );
end;
$$;

revoke all on function public.dabbir_whatsapp_catalog_resolve_service(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_catalog_resolve_service(uuid,uuid,text,text) to service_role;
