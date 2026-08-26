-- DABBIR owner operations controls v1
-- Owner/admin-only product, inventory, and order mutations.

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
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_business') then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;
  if p_quantity < 0 then raise exception 'INVALID_QUANTITY'; end if;
  if not exists(select 1 from public.dabbir_products p where p.id=p_product_id and p.business_id=p_business_id) then raise exception 'PRODUCT_NOT_FOUND'; end if;

  select reserved into v_reserved
  from public.dabbir_inventory
  where business_id=p_business_id and product_id=p_product_id
  for update;

  if not found then
    insert into public.dabbir_inventory(business_id,product_id,quantity,reserved)
    values(p_business_id,p_product_id,p_quantity,0);
    v_reserved:=0;
  else
    if p_quantity < v_reserved then raise exception 'QUANTITY_BELOW_RESERVED'; end if;
    update public.dabbir_inventory set quantity=p_quantity,updated_at=now()
    where business_id=p_business_id and product_id=p_product_id;
  end if;

  return jsonb_build_object('product_id',p_product_id,'quantity',p_quantity,'reserved',coalesce(v_reserved,0),'available',p_quantity-coalesce(v_reserved,0));
end;
$$;

create or replace function public.dabbir_owner_update_order_status(
  p_business_id uuid,
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  v_status text:=lower(trim(coalesce(p_status,'')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_business') then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;
  if v_status not in ('draft','reserved','confirmed','cancelled','completed') then raise exception 'INVALID_ORDER_STATUS'; end if;

  update public.dabbir_orders set status=v_status where id=p_order_id and business_id=p_business_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  return jsonb_build_object('order_id',p_order_id,'status',v_status);
end;
$$;

revoke all on function public.dabbir_owner_create_product(uuid,text,text,numeric,integer) from public,anon;
revoke all on function public.dabbir_owner_set_inventory(uuid,uuid,integer) from public,anon;
revoke all on function public.dabbir_owner_update_order_status(uuid,uuid,text) from public,anon;
grant execute on function public.dabbir_owner_create_product(uuid,text,text,numeric,integer) to authenticated;
grant execute on function public.dabbir_owner_set_inventory(uuid,uuid,integer) to authenticated;
grant execute on function public.dabbir_owner_update_order_status(uuid,uuid,text) to authenticated;
