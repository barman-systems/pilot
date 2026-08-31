import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'supabase/migrations/20260831193000_dabbir_car_wash_security_performance_v1.sql'),'utf8');

test('car wash foreign keys have covering indexes',()=>{
  for(const marker of [
    'dabbir_car_wash_booking_photos_business_idx',
    'dabbir_car_wash_booking_photos_created_by_idx',
    'dabbir_car_wash_booking_photos_vehicle_idx',
    'dabbir_car_wash_booking_customer_fk_idx',
    'dabbir_car_wash_booking_vehicle_fk_idx',
    'dabbir_car_wash_history_business_idx',
    'dabbir_car_wash_history_changed_by_idx',
    'dabbir_car_wash_recurring_customer_fk_idx',
    'dabbir_car_wash_recurring_offer_idx',
    'dabbir_car_wash_recurring_vehicle_idx',
  ]) assert.match(source,new RegExp(marker));
});

test('car wash RLS caches auth.uid once per statement',()=>{
  const directAuthUid=(source.match(/m\.user_id\s*=\s*auth\.uid\(\)/g)||[]).length;
  const selectedAuthUid=(source.match(/m\.user_id\s*=\s*\(select auth\.uid\(\)\)/g)||[]).length;
  assert.equal(directAuthUid,0);
  assert.ok(selectedAuthUid>=8);
});

test('signed-in users cannot directly execute public booking RPCs',()=>{
  for(const fn of ['dabbir_public_car_wash_book','dabbir_public_car_wash_catalog','dabbir_public_car_wash_slots']){
    assert.match(source,new RegExp(`revoke execute on function public\\.${fn}\\(`,'i'));
  }
  assert.match(source,/from authenticated/i);
  assert.doesNotMatch(source,/revoke execute[^;]+from anon/i);
});
