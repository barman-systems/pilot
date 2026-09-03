import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('api/appointment-management.js','utf8');
const ui=fs.readFileSync('api/car-wash-booking-edit-ui.js','utf8');

test('appointment management accepts valid historical timestamps for correction',()=>{
  assert.match(api,/function validStart\(value\)/);
  assert.doesNotMatch(api,/PAST_APPOINTMENT_NOT_ALLOWED/);
  assert.doesNotMatch(api,/date\.getTime\(\)<Date\.now\(\)/);
  assert.match(api,/patch\.starts_at=start\.toISOString\(\)/);
});

test('car-wash historical editor repairs disabled edit controls instead of hiding them',()=>{
  assert.match(ui,/#dabbirApptManage \[data-appt-edit\]\[disabled\]/);
  assert.match(ui,/button\.disabled=false/);
  assert.match(ui,/data-dabbir-historical-edit/);
  assert.match(ui,/event\.stopImmediatePropagation\(\)/);
});

test('car-wash historical editor persists date and status through the canonical appointment API',()=>{
  assert.match(ui,/\/api\/appointment-management/);
  assert.match(ui,/action:'update'/);
  assert.match(ui,/starts_at:start,status:nextStatus/);
  assert.match(ui,/location\.reload\(\)/);
});

test('historical booking editor is event-driven without a continuous interval',()=>{
  assert.match(ui,/new MutationObserver\(repairButtons\)/);
  assert.doesNotMatch(ui,/setInterval\(/);
});
