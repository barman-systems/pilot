-- Store-first sales loop: itemized sales, payment facts, and an auditable inventory ledger.

alter table public.dabbir_orders
  add column if not exists payment_method text not null default 'cash' check(payment_method in ('cash','card','transfer','credit','other')),
  add column if not exists paid_aed numeric(12,2) not null default 0 check(paid_aed >= 0),
  add column if not exists note text not null default '' check(char_length(note) <= 240),
  add column if not exists completed_at timestamptz;

create table if not exists public.dabbir_order_items(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  order_id uuid not null references public.dabbir_orders(id) on delete cascade,
  product_id uuid not null references public.dabbir_products(id) on delete restrict,
  product_name text not null check(char_length(product_name) between 1 and 160),
  sku text not null check(char_length(sku) between 1 and 80),
  unit_price_aed numeric(12,2) not null check(unit_price_aed >= 0),
  quantity integer not null check(quantity > 0 and quantity <= 100000),
  line_total_aed numeric(12,2) not null check(line_total_aed >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.dabbir_inventory_movements(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  product_id uuid not null references public.dabbir_products(id) on delete restrict,
  order_id uuid references public.dabbir_orders(id) on delete set null,
  movement_type text not null check(movement_type in ('OPENING_BALANCE','SALE','RETURN','RECEIPT','ADJUSTMENT')),
  quantity_delta integer not null check(quantity_delta <> 0),
  quantity_after integer not null check(quantity_after >= 0),
  reference_note text not null default '' check(char_length(reference_note) <= 240),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint dabbir_inventory_movements_direction_check check(
    (movement_type = 'SALE' and quantity_delta < 0)
    or (movement_type in ('RETURN','RECEIPT','OPENING_BALANCE') and quantity_delta > 0)
    or movement_type = 'ADJUSTMENT'
  )
);

create index if not exists dabbir_order_items_order_idx on public.dabbir_order_items(order_id, created_at asc);
create index if not exists dabbir_order_items_business_product_idx on public.dabbir_order_items(business_id, product_id);
create index if not exists dabbir_inventory_movements_product_created_idx on public.dabbir_inventory_movements(business_id, product_id, created_at desc);
create index if not exists dabbir_inventory_movements_order_idx on public.dabbir_inventory_movements(order_id) where order_id is not null;

alter table public.dabbir_order_items enable row level security;
alter table public.dabbir_order_items force row level security;
alter table public.dabbir_inventory_movements enable row level security;
alter table public.dabbir_inventory_movements force row level security;

revoke all on table public.dabbir_order_items from public, anon;
revoke all on table public.dabbir_inventory_movements from public, anon;
grant select, insert on table public.dabbir_order_items to authenticated;
grant select, insert on table public.dabbir_inventory_movements to authenticated;

drop policy if exists dabbir_order_items_member_select on public.dabbir_order_items;
create policy dabbir_order_items_member_select on public.dabbir_order_items
  for select to authenticated using (dabbir_private.is_active_member(business_id));

drop policy if exists dabbir_order_items_management_insert on public.dabbir_order_items;
create policy dabbir_order_items_management_insert on public.dabbir_order_items
  for insert to authenticated with check (dabbir_private.has_permission(business_id,'manage_business'));

drop policy if exists dabbir_inventory_movements_member_select on public.dabbir_inventory_movements;
create policy dabbir_inventory_movements_member_select on public.dabbir_inventory_movements
  for select to authenticated using (dabbir_private.is_active_member(business_id));

drop policy if exists dabbir_inventory_movements_management_insert on public.dabbir_inventory_movements;
create policy dabbir_inventory_movements_management_insert on public.dabbir_inventory_movements
  for insert to authenticated with check (dabbir_private.has_permission(business_id,'manage_business') and created_by = auth.uid());

create or replace function public.dabbir_owner_create_product(
  p_business_id uuid,
  p_sku text,
  p_name text,
  p_price_aed numeric,
  p_quantity integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  v_product public.dabbir_products%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_business') then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;
  if nullif(trim(p_sku),'') is null then raise exception 'SKU_REQUIRED'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'PRODUCT_NAME_REQUIRED'; end if;
  if coalesce(p_price_aed,0) < 0 then raise exception 'INVALID_PRICE'; end if;
  if coalesce(p_quantity,0) < 0 then raise exception 'INVALID_QUANTITY'; end if;

  insert into public.dabbir_products(business_id,sku,name,price_aed,active,metadata)
  values(p_business_id,left(trim(p_sku),80),left(trim(p_name),160),coalesce(p_price_aed,0),true,jsonb_build_object('source','dabbir_owner_operations'))
  returning * into v_product;

  insert into public.dabbir_inventory(business_id,product_id,quantity,reserved)
  values(p_business_id,v_product.id,coalesce(p_quantity,0),0);

  if coalesce(p_quantity,0) > 0 then
    insert into public.dabbir_inventory_movements(business_id,product_id,movement_type,quantity_delta,quantity_after,reference_note)
    values(p_business_id,v_product.id,'OPENING_BALANCE',p_quantity,p_quantity,'Initial product quantity');
  end if;

  return jsonb_build_object('id',v_product.id,'sku',v_product.sku,'name',v_product.name,'price_aed',v_product.price_aed,'quantity',coalesce(p_quantity,0));
end;
$$;

create or replace function public.dabbir_owner_set_inventory(
  p_business_id uuid,
  p_product_id uuid,
  p_quantity integer
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  v_reserved integer;
  v_previous integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_business') then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;
  if p_quantity < 0 then raise exception 'INVALID_QUANTITY'; end if;
  if not exists(select 1 from public.dabbir_products p where p.id=p_product_id and p.business_id=p_business_id) then raise exception 'PRODUCT_NOT_FOUND'; end if;

  select quantity,reserved into v_previous,v_reserved
  from public.dabbir_inventory
  where business_id=p_business_id and product_id=p_product_id
  for update;

  if not found then
    insert into public.dabbir_inventory(business_id,product_id,quantity,reserved)
    values(p_business_id,p_product_id,p_quantity,0);
    v_previous:=0;
    v_reserved:=0;
  else
    if p_quantity < v_reserved then raise exception 'QUANTITY_BELOW_RESERVED'; end if;
    update public.dabbir_inventory set quantity=p_quantity,updated_at=now()
    where business_id=p_business_id and product_id=p_product_id;
  end if;

  if p_quantity <> coalesce(v_previous,0) then
    insert into public.dabbir_inventory_movements(business_id,product_id,movement_type,quantity_delta,quantity_after,reference_note)
    values(p_business_id,p_product_id,'ADJUSTMENT',p_quantity-coalesce(v_previous,0),p_quantity,'Manual inventory count');
  end if;

  return jsonb_build_object('product_id',p_product_id,'quantity',p_quantity,'reserved',coalesce(v_reserved,0),'available',p_quantity-coalesce(v_reserved,0));
end;
$$;

create or replace function public.dabbir_owner_receive_stock(
  p_business_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_note text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  v_quantity integer;
  v_reserved integer;
  v_after integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_business') then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000 then raise exception 'INVALID_RECEIPT_QUANTITY'; end if;
  if not exists(select 1 from public.dabbir_products p where p.id=p_product_id and p.business_id=p_business_id and p.active=true) then raise exception 'PRODUCT_NOT_FOUND'; end if;

  select quantity,reserved into v_quantity,v_reserved
  from public.dabbir_inventory
  where business_id=p_business_id and product_id=p_product_id
  for update;

  if not found then
    v_quantity:=0;
    v_reserved:=0;
    insert into public.dabbir_inventory(business_id,product_id,quantity,reserved)
    values(p_business_id,p_product_id,p_quantity,0);
  else
    update public.dabbir_inventory set quantity=quantity+p_quantity,updated_at=now()
    where business_id=p_business_id and product_id=p_product_id;
  end if;

  v_after:=coalesce(v_quantity,0)+p_quantity;
  insert into public.dabbir_inventory_movements(business_id,product_id,movement_type,quantity_delta,quantity_after,reference_note)
  values(p_business_id,p_product_id,'RECEIPT',p_quantity,v_after,left(coalesce(trim(p_note),''),240));

  return jsonb_build_object('product_id',p_product_id,'quantity',v_after,'reserved',coalesce(v_reserved,0),'available',v_after-coalesce(v_reserved,0));
end;
$$;

create or replace function public.dabbir_owner_complete_sale(
  p_business_id uuid,
  p_items jsonb,
  p_payment_method text default 'cash',
  p_customer_id uuid default null,
  p_note text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_product public.dabbir_products%rowtype;
  v_inventory_quantity integer;
  v_reserved integer;
  v_available integer;
  v_after integer;
  v_total numeric(12,2):=0;
  v_line_total numeric(12,2);
  v_count integer:=0;
  v_payment_method text:=lower(trim(coalesce(p_payment_method,'cash')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_business') then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then raise exception 'INVALID_SALE_ITEMS'; end if;
  if v_payment_method not in ('cash','card','transfer','credit','other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_customer_id is not null and not exists(select 1 from public.dabbir_customers c where c.id=p_customer_id and c.business_id=p_business_id) then raise exception 'CUSTOMER_NOT_FOUND'; end if;

  insert into public.dabbir_orders(business_id,customer_id,status,total_aed,simulated,payment_method,paid_aed,note,completed_at)
  values(p_business_id,p_customer_id,'draft',0,false,v_payment_method,0,left(coalesce(trim(p_note),''),240),now())
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_count:=v_count+1;
    if coalesce(v_item->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_PRODUCT_ID'; end if;
    if coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]{0,4}$' then raise exception 'INVALID_SALE_QUANTITY'; end if;
    v_product_id:=(v_item->>'product_id')::uuid;
    v_quantity:=(v_item->>'quantity')::integer;

    select * into v_product
    from public.dabbir_products
    where id=v_product_id and business_id=p_business_id and active=true
    for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

    select quantity,reserved into v_inventory_quantity,v_reserved
    from public.dabbir_inventory
    where business_id=p_business_id and product_id=v_product_id
    for update;
    if not found then raise exception 'INVENTORY_NOT_FOUND'; end if;

    v_available:=v_inventory_quantity-v_reserved;
    if v_available < v_quantity then raise exception 'INSUFFICIENT_AVAILABLE_INVENTORY'; end if;
    v_after:=v_inventory_quantity-v_quantity;
    v_line_total:=round(v_product.price_aed*v_quantity,2);

    insert into public.dabbir_order_items(business_id,order_id,product_id,product_name,sku,unit_price_aed,quantity,line_total_aed)
    values(p_business_id,v_order_id,v_product.id,v_product.name,v_product.sku,v_product.price_aed,v_quantity,v_line_total);

    update public.dabbir_inventory set quantity=v_after,updated_at=now()
    where business_id=p_business_id and product_id=v_product.id;

    insert into public.dabbir_inventory_movements(business_id,product_id,order_id,movement_type,quantity_delta,quantity_after,reference_note)
    values(p_business_id,v_product.id,v_order_id,'SALE',-v_quantity,v_after,'Completed sale');

    v_total:=v_total+v_line_total;
  end loop;

  if v_count=0 then raise exception 'INVALID_SALE_ITEMS'; end if;
  update public.dabbir_orders
  set status='completed',total_aed=v_total,paid_aed=case when v_payment_method='credit' then 0 else v_total end,completed_at=now()
  where id=v_order_id and business_id=p_business_id;

  return jsonb_build_object('order_id',v_order_id,'total_aed',v_total,'paid_aed',case when v_payment_method='credit' then 0 else v_total end,'payment_method',v_payment_method,'items_count',v_count,'status','completed');
end;
$$;

revoke all on function public.dabbir_owner_create_product(uuid,text,text,numeric,integer) from public,anon;
revoke all on function public.dabbir_owner_set_inventory(uuid,uuid,integer) from public,anon;
revoke all on function public.dabbir_owner_receive_stock(uuid,uuid,integer,text) from public,anon;
revoke all on function public.dabbir_owner_complete_sale(uuid,jsonb,text,uuid,text) from public,anon;
grant execute on function public.dabbir_owner_create_product(uuid,text,text,numeric,integer) to authenticated;
grant execute on function public.dabbir_owner_set_inventory(uuid,uuid,integer) to authenticated;
grant execute on function public.dabbir_owner_receive_stock(uuid,uuid,integer,text) to authenticated;
grant execute on function public.dabbir_owner_complete_sale(uuid,jsonb,text,uuid,text) to authenticated;
