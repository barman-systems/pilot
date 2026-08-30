import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260830133500_dabbir_qa_cleanup_fk_graph_v2.sql', import.meta.url), 'utf8');

test('QA business cleanup follows the commerce RESTRICT dependency order', () => {
  const returnsDelete = migration.indexOf('delete from public.dabbir_order_returns where business_id = p_business_id;');
  const movementsDelete = migration.indexOf('delete from public.dabbir_inventory_movements where business_id = p_business_id;');
  const itemsDelete = migration.indexOf('delete from public.dabbir_order_items where business_id = p_business_id;');
  const ordersDelete = migration.indexOf('delete from public.dabbir_orders where business_id = p_business_id;');
  const inventoryDelete = migration.indexOf('delete from public.dabbir_inventory where business_id = p_business_id;');
  const productsDelete = migration.indexOf('delete from public.dabbir_products where business_id = p_business_id;');

  assert.ok(returnsDelete >= 0, 'QA cleanup must delete order returns');
  assert.ok(movementsDelete >= 0, 'QA cleanup must delete inventory movements');
  assert.ok(itemsDelete >= 0, 'QA cleanup must delete order items');
  assert.ok(ordersDelete > returnsDelete, 'orders must be deleted after order returns');
  assert.ok(ordersDelete > movementsDelete, 'orders must be deleted after inventory movements');
  assert.ok(ordersDelete > itemsDelete, 'orders must be deleted after order items');
  assert.ok(productsDelete > returnsDelete, 'products must be deleted after order returns');
  assert.ok(productsDelete > movementsDelete, 'products must be deleted after inventory movements');
  assert.ok(productsDelete > itemsDelete, 'products must be deleted after order items');
  assert.ok(inventoryDelete > movementsDelete, 'inventory rows must be deleted after inventory movements');
});

test('QA cleanup migration preserves its scope and business-level RESTRICT guards', () => {
  const platformAuditDelete = migration.indexOf('delete from public.dabbir_platform_owner_audit where business_id = p_business_id;');
  const businessDelete = migration.indexOf('delete from public.dabbir_businesses where id = p_business_id;');

  assert.match(migration, /if v_name not like 'DABBIR AI QA %'/);
  assert.match(migration, /QA_CLEANUP_SCOPE_DENIED/);
  assert.ok(platformAuditDelete >= 0, 'QA cleanup must remove platform owner audit rows');
  assert.ok(businessDelete > platformAuditDelete, 'the business must be deleted after platform owner audit rows');
  assert.match(migration, /grant execute on function public\.dabbir_qa_cleanup_business\(uuid\) to service_role/);
});
