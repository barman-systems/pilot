import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('car wash operations extend the existing booking request instead of creating a parallel booking model',()=>{
  const migration=read('supabase/migrations/20260831143000_dabbir_car_wash_operations_v1.sql');
  assert.match(migration,/alter table public\.dabbir_car_wash_booking_requests/);
  assert.match(migration,/customer_id uuid/);
  assert.match(migration,/vehicle_id uuid/);
  assert.match(migration,/maps_url text/);
  assert.doesNotMatch(migration,/create table[^;]*car_wash_operations/i);
});

test('the operations lifecycle contains every approved mobile-wash state and preserves status history',()=>{
  const api=read('api/car-wash-admin.js');
  const migration=read('supabase/migrations/20260831143000_dabbir_car_wash_operations_v1.sql');
  for(const status of ['new','confirmed','en_route','arrived','washing','completed','paid','cancelled'])assert.match(api,new RegExp(`'${status}'`));
  assert.match(api,/dabbir_car_wash_booking_status_history/);
  assert.match(api,/action==='update_booking_status'/);
  assert.match(migration,/from_status text/);
  assert.match(migration,/to_status text not null/);
});

test('vehicle evidence, location, WhatsApp drafts, repeat bookings, and recurring plans use the same car-wash surface',()=>{
  const api=read('api/car-wash-admin.js');
  const ui=read('api/car-wash-operations-ui.js');
  const bookingUi=read('api/car-wash-booking-ui.js');
  for(const marker of ['dabbir_car_wash_vehicles','dabbir_car_wash_booking_photos','dabbir_car_wash_recurring_plans','add_photo','repeat_booking','create_recurring_plan','supabaseStorage'])assert.match(api,new RegExp(marker));
  for(const marker of ['wa.me/','Open WhatsApp','data-cw-photo','data-cw-repeat','Directions','Before wash','After wash'])assert.match(ui,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(bookingUi,/import carWashOperationsUi from '.\/car-wash-operations-ui\.js'/);
});

test('operations stay role-aware and exclude advanced routing, GPS tracking, and alternate navigation',()=>{
  const api=read('api/car-wash-admin.js');
  const ui=read('api/car-wash-operations-ui.js');
  assert.match(api,/OPERATIONS_ROLES/);
  assert.match(api,/requireOperations/);
  assert.doesNotMatch(api,/action==='assign_worker'|route_optimization|gps_tracking/i);
  assert.match(api,/dabbir_car_wash_transition_job/);
  assert.match(api,/dabbir_car_wash_record_checkpoint/);
  assert.doesNotMatch(ui,/showScreen\('operations'\)|primary_navigation/i);
});
