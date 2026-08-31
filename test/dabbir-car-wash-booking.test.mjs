import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('car wash is an accepted activity with appointment and service capabilities',()=>{
  const source=read('api/activity-tasks.js');
  assert.match(source,/car_wash:\{name_ar:'غسيل سيارات متنقل'/);
  assert.match(source,/car_wash:[^\n]+show_appointments:true/);
  assert.match(source,/car_wash:[^\n]+show_services:true/);
});

test('setup exposes mobile car wash in both languages',()=>{
  const source=read('index.html');
  assert.match(source,/option value="car_wash"/);
  assert.match(source,/car_wash:'غسيل سيارات متنقل'/);
  assert.match(source,/car_wash:'Mobile car wash'/);
});

test('public booking page implements the required four-step customer flow',()=>{
  const source=read('booking.html');
  for(const marker of ['نوع السيارة','اختر العرض','الوقت الفارغ','إرسال موقعي الحالي','location_lat','location_lng','public-car-wash'])assert.match(source,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(source,/data-vehicle="saloon"/);
  assert.match(source,/data-vehicle="station"/);
  assert.match(source,/function setLocation\(\)/);
  assert.match(source,/getCurrentPosition/);
});

test('car wash owner UI limits the catalog to six offers and manages slot settings',()=>{
  const source=read('api/car-wash-booking-ui.js');
  assert.match(source,/offers\.length<6/);
  assert.match(source,/action:'save_offer'/);
  assert.match(source,/action:'save_settings'/);
  assert.match(source,/slot_interval_minutes/);
  assert.match(source,/working_days/);
  assert.match(source,/data\.bookings/);
});

test('public booking API and owner API are fail-closed and bounded',()=>{
  const publicApi=read('api/public-car-wash.js');
  const adminApi=read('api/car-wash-admin.js');
  assert.match(publicApi,/if\(!sameOrigin\(req\)\)return json\(res,403/);
  assert.match(publicApi,/readBody\(req,max=12000\)/);
  assert.match(publicApi,/\['saloon','station'\]/);
  assert.match(publicApi,/VALID_LOCATION_REQUIRED|location_lat/);
  assert.match(adminApi,/if\(!requireSameOrigin\(req\)\)return json\(res,403/);
  assert.match(adminApi,/sortOrder<1\|\|sortOrder>6/);
  assert.match(adminApi,/ownerMembership/);
});

test('booking migration has owner RLS, public functions, collision checks, and both vehicle prices',()=>{
  const source=read('supabase/migrations/20260830133000_dabbir_car_wash_booking_v1.sql');
  for(const marker of ['dabbir_car_wash_settings','dabbir_car_wash_offers','dabbir_car_wash_booking_requests','saloon_price_aed','station_price_aed','dabbir_public_car_wash_catalog','dabbir_public_car_wash_slots','dabbir_public_car_wash_book','dabbir_car_wash_booking_owner_read','tstzrange','grant execute'])assert.match(source,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(source,/sort_order integer not null check \(sort_order between 1 and 6\)/);
  assert.match(source,/location_lat numeric\(9,6\)/);
  assert.match(source,/location_lng numeric\(9,6\)/);
});

test('Vercel exposes the shareable booking route and activity-scoped car wash UI loader',()=>{
  const vercel=JSON.parse(read('vercel.json'));
  const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));
  const loader=read('api/car-wash-loader-ui.js');
  assert.ok(vercel.routes.some(route=>route.src==='^/book/?$'&&route.dest==='/api/car-wash-booking'));
  assert.ok(vercel.rewrites.some(route=>route.source==='/book'&&route.destination==='/api/car-wash-booking'));
  assert.ok(manifest.deferred.includes('/api/car-wash-loader-ui'));
  assert.ok(!manifest.deferred.includes('/api/car-wash-booking-ui'));
  assert.match(loader,/\/api\/car-wash-booking-ui/);
});
