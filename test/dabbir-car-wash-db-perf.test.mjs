import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationPath='supabase/migrations/20260831195000_dabbir_car_wash_rls_fk_perf_v1.sql';
const cleanupPath='supabase/migrations/20260831195500_dabbir_car_wash_duplicate_index_cleanup_v1.sql';
const reconcilePath='supabase/migrations/20260831200000_dabbir_car_wash_perf_reconcile_v2.sql';
const source=readFileSync(migrationPath,'utf8');
const cleanup=readFileSync(cleanupPath,'utf8');
const reconcile=readFileSync(reconcilePath,'utf8');

test('car wash RLS policies use statement-stable auth uid lookup',()=>{
  const directAuthUid=(source.match(/m\.user_id\s*=\s*auth\.uid\(\)/g)||[]).length;
  const stableAuthUid=(source.match(/m\.user_id\s*=\s*\(select auth\.uid\(\)\)/g)||[]).length;
  assert.equal(directAuthUid,0);
  assert.ok(stableAuthUid>=8);
  for(const policy of [
    'dabbir_car_wash_booking_operations_update',
    'dabbir_car_wash_vehicles_member',
    'dabbir_car_wash_history_member',
    'dabbir_car_wash_history_write',
    'dabbir_car_wash_photos_member',
    'dabbir_car_wash_recurring_member'
  ]) assert.match(source,new RegExp(`create policy ${policy}`));
});

test('car wash foreign keys have covering indexes',()=>{
  for(const indexName of [
    'dabbir_car_wash_booking_requests_customer_fk_idx',
    'dabbir_car_wash_booking_requests_vehicle_fk_idx',
    'dabbir_car_wash_history_business_fk_idx',
    'dabbir_car_wash_history_changed_by_fk_idx',
    'dabbir_car_wash_photos_business_fk_idx',
    'dabbir_car_wash_photos_vehicle_fk_idx',
    'dabbir_car_wash_photos_created_by_fk_idx',
    'dabbir_car_wash_recurring_customer_fk_idx',
    'dabbir_car_wash_recurring_vehicle_fk_idx',
    'dabbir_car_wash_recurring_offer_fk_idx'
  ]) assert.match(source,new RegExp(`create index if not exists ${indexName}`));
});

test('final reconciliation restores canonical full indexes and removes only exact aliases',()=>{
  for(const indexName of [
    'dabbir_car_wash_photos_business_fk_idx',
    'dabbir_car_wash_history_business_fk_idx',
    'dabbir_car_wash_recurring_offer_fk_idx',
    'dabbir_car_wash_recurring_vehicle_fk_idx'
  ]) {
    assert.match(cleanup,new RegExp(`drop index if exists public\\.${indexName}`));
    assert.match(reconcile,new RegExp(`create index if not exists ${indexName}`));
  }

  for(const alias of [
    'dabbir_car_wash_booking_photos_business_idx',
    'dabbir_car_wash_history_business_idx',
    'dabbir_car_wash_recurring_offer_idx',
    'dabbir_car_wash_recurring_vehicle_idx'
  ]) assert.match(reconcile,new RegExp(`drop index if exists public\\.${alias}`));
});

test('authenticated access is removed from anonymous public booking RPCs',()=>{
  for(const fn of [
    'dabbir_public_car_wash_book',
    'dabbir_public_car_wash_catalog',
    'dabbir_public_car_wash_slots'
  ]) assert.match(reconcile,new RegExp(`revoke execute on function public\\.${fn}\\(`));
  assert.doesNotMatch(reconcile,/from anon\s*;/i);
});
