import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'supabase/migrations/20260831194000_dabbir_car_wash_duplicate_index_cleanup_v1.sql'),'utf8');

test('duplicate cleanup removes only redundant aliases',()=>{
  for(const name of [
    'dabbir_car_wash_booking_photos_business_idx',
    'dabbir_car_wash_history_business_idx',
    'dabbir_car_wash_recurring_offer_idx',
    'dabbir_car_wash_recurring_vehicle_idx',
  ]) assert.match(source,new RegExp(`drop index if exists public\\.${name}`,'i'));
});

test('canonical FK indexes are retained',()=>{
  for(const name of [
    'dabbir_car_wash_photos_business_fk_idx',
    'dabbir_car_wash_history_business_fk_idx',
    'dabbir_car_wash_recurring_offer_fk_idx',
    'dabbir_car_wash_recurring_vehicle_fk_idx',
  ]) assert.doesNotMatch(source,new RegExp(`drop index if exists public\\.${name}`,'i'));
});
