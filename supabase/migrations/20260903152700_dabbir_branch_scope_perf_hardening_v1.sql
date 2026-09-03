begin;

-- Cover composite FKs in their declared column order.
create index if not exists dabbir_appointments_branch_business_fk_idx on public.dabbir_appointments(branch_id,business_id);
create index if not exists dabbir_orders_branch_business_fk_idx on public.dabbir_orders(branch_id,business_id);
create index if not exists dabbir_inventory_movements_branch_business_fk_idx on public.dabbir_inventory_movements(branch_id,business_id);
create index if not exists dabbir_conversations_branch_business_fk_idx on public.dabbir_conversations(branch_id,business_id);
create index if not exists dabbir_membership_branches_branch_business_idx on public.dabbir_membership_branches(branch_id,business_id);

create index if not exists dabbir_branch_services_branch_business_idx on public.dabbir_branch_services(branch_id,business_id);
create index if not exists dabbir_branch_services_business_service_idx on public.dabbir_branch_services(business_id,service_id);
create index if not exists dabbir_branch_products_branch_business_idx on public.dabbir_branch_products(branch_id,business_id);
create index if not exists dabbir_branch_products_business_product_idx on public.dabbir_branch_products(business_id,product_id);
create index if not exists dabbir_worker_branches_branch_business_idx on public.dabbir_worker_branches(branch_id,business_id);
create index if not exists dabbir_worker_branches_business_worker_idx on public.dabbir_worker_branches(business_id,worker_id);
create index if not exists dabbir_branch_inventory_branch_business_idx on public.dabbir_branch_inventory(branch_id,business_id);
create index if not exists dabbir_branch_inventory_business_product_idx on public.dabbir_branch_inventory(business_id,product_id);

-- Split mutation policies so SELECT has exactly one permissive policy per table.
drop policy if exists dabbir_membership_branches_manage on public.dabbir_membership_branches;
create policy dabbir_membership_branches_insert on public.dabbir_membership_branches for insert to authenticated
with check (dabbir_private.has_permission(business_id,'manage_team'));
create policy dabbir_membership_branches_update on public.dabbir_membership_branches for update to authenticated
using (dabbir_private.has_permission(business_id,'manage_team'))
with check (dabbir_private.has_permission(business_id,'manage_team'));
create policy dabbir_membership_branches_delete on public.dabbir_membership_branches for delete to authenticated
using (dabbir_private.has_permission(business_id,'manage_team'));

drop policy if exists dabbir_branch_services_manage on public.dabbir_branch_services;
create policy dabbir_branch_services_insert on public.dabbir_branch_services for insert to authenticated
with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_services'));
create policy dabbir_branch_services_update on public.dabbir_branch_services for update to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_services'))
with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_services'));
create policy dabbir_branch_services_delete on public.dabbir_branch_services for delete to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_services'));

drop policy if exists dabbir_branch_products_manage on public.dabbir_branch_products;
create policy dabbir_branch_products_insert on public.dabbir_branch_products for insert to authenticated
with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));
create policy dabbir_branch_products_update on public.dabbir_branch_products for update to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'))
with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));
create policy dabbir_branch_products_delete on public.dabbir_branch_products for delete to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));

drop policy if exists dabbir_worker_branches_manage on public.dabbir_worker_branches;
create policy dabbir_worker_branches_insert on public.dabbir_worker_branches for insert to authenticated
with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_team'));
create policy dabbir_worker_branches_update on public.dabbir_worker_branches for update to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_team'))
with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_team'));
create policy dabbir_worker_branches_delete on public.dabbir_worker_branches for delete to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_team'));

drop policy if exists dabbir_branch_inventory_manage on public.dabbir_branch_inventory;
create policy dabbir_branch_inventory_insert on public.dabbir_branch_inventory for insert to authenticated
with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));
create policy dabbir_branch_inventory_update on public.dabbir_branch_inventory for update to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'))
with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));
create policy dabbir_branch_inventory_delete on public.dabbir_branch_inventory for delete to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));

commit;
