-- Store-first returns: partial/full sale returns with auditable inventory movements.

create table if not exists public.dabbir_order_returns(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  order_id uuid not null references public.dabbir_orders(id) on delete restrict,
  order_item_id uuid not null references public.dabbir_order_items(id) on delete restrict,
  product_id uuid not null references public.dabbir_products(id) on delete restrict,
  quantity integer not null check(quantity > 0 and quantity <= 100000),
  refund_aed numeric(12,2) not null check(refund_aed >= 0),
  reason text not null default '' check(char_length(reason) <= 240),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists dabbir_order_returns_order_idx on public.dabbir_order_returns(business_id,order_id,created_at desc);
create index if not exists dabbir_order_returns_item_idx on public.dabbir_order_returns(business_id,order_item_id);

alter table public.dabbir_order_returns enable row level security;
alter table public.dabbir_order_returns force row level security;
revoke all on table public.dabbir_order_returns from public, anon;
grant select, insert on table public.dabbir_order_returns to authenticated;

drop policy if exists dabbir_order_returns_member_select on public.dabbir_order_returns;
create policy dabbir_order_returns_member_select on public.dabbir_order_returns
  for select to authenticated using (dabbir_private.is_active_member(business_id));

drop policy if exists dabbir_order_returns_management_insert on public.dabbir_order_returns;
create policy dabbir_order_returns_management_insert on public.dabbir_order_returns
  for insert to authenticated with check (dabbir_private.has_permission(business_id,'manage_business') and created_by = auth.uid());

create or replace function public.dabbir_owner_return_sale(
  p_business_id uuid,
  p_order_id uuid,
  p_items jsonb,
  p_reason text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  v_item jsonb;
  v_order_item public.dabbir_order_items%rowtype;
  v_order public.dabbir_orders%rowtype;
  v_inventory_quantity integer;
  v_reserved integer;
  v_returned integer;
  v_quantity integer;
  v_remaining integer;
  v_refund numeric(12,2);
  v_total_refund numeric(12,2):=0;
  v_count integer:=0;
  v_product_id uuid;
  v_order_item_id uuid;
  v_reason text:=left(coalesce(trim(p_reason),''),240);
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_business') then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_orders o where o.id=p_order_id and o.business_id=p_business_id) then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_order from public.dabbir_orders where id=p_order_id and business_id=p_business_id for update;
  if lower(coalesce(v_order.status,'')) not in ('completed','confirmed') then raise exception 'ORDER_NOT_RETURNABLE'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then raise exception 'INVALID_RETURN_ITEMS'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_count:=v_count+1;
    begin v_order_item_id:=(v_item->>'order_item_id')::uuid; exception when others then raise exception 'INVALID_ORDER_ITEM_ID'; end;
    v_quantity:=case when coalesce(v_item->>'quantity','') ~ '^[1-9][0-9]{0,4}$' then (v_item->>'quantity')::integer else 0 end;
    if v_quantity < 1 or v_quantity > 100000 then raise exception 'INVALID_RETURN_QUANTITY'; end if;

    select * into v_order_item from public.dabbir_order_items
    where id=v_order_item_id and order_id=p_order_id and business_id=p_business_id
    for update;
    if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;

    select coalesce(sum(quantity),0) into v_returned from public.dabbir_order_returns
    where order_item_id=v_order_item.id and business_id=p_business_id;
    v_remaining:=v_order_item.quantity-v_returned;
    if v_quantity > v_remaining then raise exception 'RETURN_QUANTITY_EXCEEDS_SOLD'; end if;

    v_product_id:=v_order_item.product_id;
    select quantity,reserved into v_inventory_quantity,v_reserved from public.dabbir_inventory
    where business_id=p_business_id and product_id=v_product_id for update;
    if not found then
      v_inventory_quantity:=0;
      v_reserved:=0;
      insert into public.dabbir_inventory(business_id,product_id,quantity,reserved) values(p_business_id,v_product_id,0,0);
    end if;

    v_refund:=round(v_order_item.unit_price_aed*v_quantity,2);
    insert into public.dabbir_order_returns(business_id,order_id,order_item_id,product_id,quantity,refund_aed,reason)
    values(p_business_id,p_order_id,v_order_item.id,v_product_id,v_quantity,v_refund,v_reason);
    update public.dabbir_inventory set quantity=quantity+v_quantity,updated_at=now()
    where business_id=p_business_id and product_id=v_product_id;
    insert into public.dabbir_inventory_movements(business_id,product_id,order_id,movement_type,quantity_delta,quantity_after,reference_note)
    values(p_business_id,v_product_id,p_order_id,'RETURN',v_quantity,v_inventory_quantity+v_quantity,left(coalesce(v_reason,'Sale return'),240));
    v_total_refund:=v_total_refund+v_refund;
  end loop;

  if v_count=0 then raise exception 'INVALID_RETURN_ITEMS'; end if;
  return jsonb_build_object('order_id',p_order_id,'items_count',v_count,'refund_aed',v_total_refund,'status','recorded');
end;
$$;

revoke all on function public.dabbir_owner_return_sale(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.dabbir_owner_return_sale(uuid,uuid,jsonb,text) to authenticated;
