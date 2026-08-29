-- Separate cashier operation permission from store configuration management.

create or replace function dabbir_private.valid_permissions(p_permissions text[])
returns boolean language sql immutable set search_path=public,pg_temp as $$
 select coalesce(bool_and(p=any(array['view_business','manage_business','manage_store_operations','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','manage_billing','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])),true)
 from unnest(coalesce(p_permissions,'{}'::text[])) p;
$$;

create or replace function dabbir_private.has_permission(p_business_id uuid,p_permission text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select (select auth.uid()) is not null and exists(
 select 1 from public.dabbir_memberships m
 where m.business_id=p_business_id and m.user_id=(select auth.uid()) and m.status='active' and (
   (cardinality(m.permissions)>0 and p_permission=any(m.permissions)) or
   (cardinality(m.permissions)=0 and case m.role
    when 'owner' then p_permission=any(array['view_business','manage_business','manage_store_operations','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','manage_billing','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
    when 'admin' then p_permission=any(array['view_business','manage_business','manage_store_operations','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
    when 'manager' then p_permission=any(array['view_business','manage_store_operations','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
    when 'employee' then p_permission=any(array['view_business','manage_store_operations','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
    when 'staff' then p_permission=any(array['view_business','manage_store_operations','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
    when 'agent' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
    when 'viewer' then p_permission=any(array['view_business','view_conversations','view_appointments','view_analytics','view_services','view_knowledge','view_quality'])
    else false end)
  )
);
$$;
revoke all on function dabbir_private.valid_permissions(text[]) from public,anon;
grant execute on function dabbir_private.valid_permissions(text[]) to authenticated,service_role;
revoke all on function dabbir_private.has_permission(uuid,text) from public,anon;
grant execute on function dabbir_private.has_permission(uuid,text) to authenticated,service_role;

-- Managers/staff can operate the register; product and inventory administration remains manage_business.
create or replace function public.dabbir_owner_update_order_status(p_business_id uuid,p_order_id uuid,p_status text)
returns jsonb language plpgsql security invoker set search_path to 'public','pg_temp' as $$
declare v_status text:=lower(trim(coalesce(p_status,'')));
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not dabbir_private.has_permission(p_business_id,'manage_store_operations') then raise exception 'STORE_OPERATIONS_REQUIRED'; end if;
 if v_status not in ('draft','reserved','confirmed','cancelled','completed') then raise exception 'INVALID_ORDER_STATUS'; end if;
 update public.dabbir_orders set status=v_status where id=p_order_id and business_id=p_business_id;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 return jsonb_build_object('order_id',p_order_id,'status',v_status);
end;
$$;
revoke all on function public.dabbir_owner_update_order_status(uuid,uuid,text) from public,anon;
grant execute on function public.dabbir_owner_update_order_status(uuid,uuid,text) to authenticated;

create or replace function public.dabbir_owner_complete_sale(
  p_business_id uuid,p_items jsonb,p_payment_method text default 'cash',p_customer_id uuid default null,p_note text default ''
)
returns jsonb language plpgsql security invoker set search_path to 'public','pg_temp' as $$
declare v_order_id uuid; v_item jsonb; v_product_id uuid; v_quantity integer; v_product public.dabbir_products%rowtype; v_inventory_quantity integer; v_reserved integer; v_available integer; v_after integer; v_line_total numeric(12,2); v_total numeric(12,2):=0; v_count integer:=0; v_payment_method text:=lower(trim(coalesce(p_payment_method,'cash')));
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not dabbir_private.has_permission(p_business_id,'manage_store_operations') then raise exception 'STORE_OPERATIONS_REQUIRED'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'INVALID_SALE_ITEMS'; end if;
 if v_payment_method not in ('cash','card','transfer','credit','other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
 if p_customer_id is not null and not exists(select 1 from public.dabbir_customers c where c.id=p_customer_id and c.business_id=p_business_id) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
 insert into public.dabbir_orders(business_id,customer_id,status,total_aed,simulated,payment_method,paid_aed,note,completed_at) values(p_business_id,p_customer_id,'draft',0,false,v_payment_method,0,left(coalesce(trim(p_note),''),240),now()) returning id into v_order_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_count:=v_count+1;
  if coalesce(v_item->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_PRODUCT_ID'; end if;
  if coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]{0,4}$' then raise exception 'INVALID_SALE_QUANTITY'; end if;
  v_product_id:=(v_item->>'product_id')::uuid; v_quantity:=(v_item->>'quantity')::integer;
  select * into v_product from public.dabbir_products where id=v_product_id and business_id=p_business_id and active=true for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  select quantity,reserved into v_inventory_quantity,v_reserved from public.dabbir_inventory where business_id=p_business_id and product_id=v_product_id for update;
  if not found then raise exception 'INVENTORY_NOT_FOUND'; end if;
  v_available:=v_inventory_quantity-v_reserved; if v_available<v_quantity then raise exception 'INSUFFICIENT_AVAILABLE_INVENTORY'; end if;
  v_after:=v_inventory_quantity-v_quantity; v_line_total:=round(v_product.price_aed*v_quantity,2);
  insert into public.dabbir_order_items(business_id,order_id,product_id,product_name,sku,unit_price_aed,quantity,line_total_aed) values(p_business_id,v_order_id,v_product.id,v_product.name,v_product.sku,v_product.price_aed,v_quantity,v_line_total);
  update public.dabbir_inventory set quantity=v_after,updated_at=now() where business_id=p_business_id and product_id=v_product.id;
  insert into public.dabbir_inventory_movements(business_id,product_id,order_id,movement_type,quantity_delta,quantity_after,reference_note) values(p_business_id,v_product.id,v_order_id,'SALE',-v_quantity,v_after,'Completed sale');
  v_total:=v_total+v_line_total;
 end loop;
 update public.dabbir_orders set status='completed',total_aed=v_total,paid_aed=case when v_payment_method='credit' then 0 else v_total end,completed_at=now() where id=v_order_id and business_id=p_business_id;
 return jsonb_build_object('order_id',v_order_id,'total_aed',v_total,'paid_aed',case when v_payment_method='credit' then 0 else v_total end,'payment_method',v_payment_method,'items_count',v_count,'status','completed');
end;
$$;

revoke all on function public.dabbir_owner_complete_sale(uuid,jsonb,text,uuid,text) from public,anon;
grant execute on function public.dabbir_owner_complete_sale(uuid,jsonb,text,uuid,text) to authenticated;
