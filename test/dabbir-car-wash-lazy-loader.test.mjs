import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('universal deferred bundle carries only the car-wash loader',()=>{
  const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));
  assert.ok(manifest.deferred.includes('/api/car-wash-loader-ui'));
  assert.ok(!manifest.deferred.includes('/api/car-wash-booking-ui'));
});

test('car-wash loader fetches the operations surface only for car_wash businesses',()=>{
  const loader=read('api/car-wash-loader-ui.js');
  assert.match(loader,/business_type/);
  assert.match(loader,/===\s*'car_wash'/);
  assert.match(loader,/\/api\/car-wash-booking-ui/);
  assert.match(loader,/data-dabbir-car-wash-ui/);
});

test('car-wash workspace suppresses the duplicate generic booking calendar',()=>{
  const loader=read('api/car-wash-loader-ui.js');
  assert.match(loader,/function enforceSingleCalendar\(\)/);
  assert.match(loader,/#dabbirGenericCalendar/);
  assert.match(loader,/setProperty\('display','none','important'\)/);
  assert.match(loader,/dabbirCarWashDuplicate/);
  assert.match(loader,/v2-single-calendar/);
});
