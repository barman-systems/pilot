import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260829141000_dabbir_qa_cleanup_inventory_movements.sql', import.meta.url), 'utf8');

test('QA business cleanup removes inventory movements before products', () => {
  const movementsDelete = migration.indexOf('delete from public.dabbir_inventory_movements where business_id = p_business_id;');
  const inventoryDelete = migration.indexOf('delete from public.dabbir_inventory where business_id = p_business_id;');
  const productsDelete = migration.indexOf('delete from public.dabbir_products where business_id = p_business_id;');

  assert.ok(movementsDelete >= 0, 'QA cleanup must delete inventory movements');
  assert.ok(inventoryDelete > movementsDelete, 'inventory rows must be deleted after inventory movements');
  assert.ok(productsDelete > movementsDelete, 'products must be deleted after inventory movements');
});

test('QA cleanup migration preserves the QA-only scope guard', () => {
  assert.match(migration, /if v_name not like 'DABBIR AI QA %'/);
  assert.match(migration, /QA_CLEANUP_SCOPE_DENIED/);
  assert.match(migration, /grant execute on function public\.dabbir_qa_cleanup_business\(uuid\) to service_role/);
});
