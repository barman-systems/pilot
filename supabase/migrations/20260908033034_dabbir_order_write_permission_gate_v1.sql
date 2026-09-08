-- Direct Data API writes must honor the same operation permission as the
-- dabbir_owner_update_order_status / dabbir_owner_complete_sale RPCs.
-- The existing permissive member policy and restrictive branch policy remain
-- in force. A viewer may read an allowed branch, but cannot change its orders.
-- No existing rows, grants, or read policies are changed.

drop policy if exists dabbir_orders_insert_permission_gate on public.dabbir_orders;
create policy dabbir_orders_insert_permission_gate
on public.dabbir_orders as restrictive for insert to authenticated
with check (dabbir_private.has_permission(business_id,'manage_store_operations'));

drop policy if exists dabbir_orders_update_permission_gate on public.dabbir_orders;
create policy dabbir_orders_update_permission_gate
on public.dabbir_orders as restrictive for update to authenticated
using (dabbir_private.has_permission(business_id,'manage_store_operations'))
with check (dabbir_private.has_permission(business_id,'manage_store_operations'));

drop policy if exists dabbir_orders_delete_permission_gate on public.dabbir_orders;
create policy dabbir_orders_delete_permission_gate
on public.dabbir_orders as restrictive for delete to authenticated
using (dabbir_private.has_permission(business_id,'manage_store_operations'));
