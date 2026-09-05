import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('api/appointment-management.js','utf8');
const ui=fs.readFileSync('api/car-wash-booking-edit-ui.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260903131500_dabbir_historical_appointment_correction_v1.sql','utf8');

test('appointment management does not rewrite an unchanged historical timestamp',()=>{
  assert.match(api,/function validStart\(value\)/);
  assert.match(api,/const currentStart=validStart\(current\.starts_at\)/);
  assert.match(api,/start\.getTime\(\)!==currentStart\.getTime\(\)/);
  assert.match(api,/patch\.starts_at=start\.toISOString\(\)/);
  assert.match(api,/state:'NO_CHANGE'/);
});

test('database guard allows correction of an already historical appointment but blocks new past bookings',()=>{
  assert.match(migration,/tg_op = 'UPDATE'/i);
  assert.match(migration,/old\.starts_at < v_now_minute/);
  assert.match(migration,/APPOINTMENT_TIME_IN_PAST/);
  assert.match(migration,/before insert or update of starts_at/);
});

test('car-wash historical editor repairs every historical edit control and wins click races',()=>{
  assert.match(ui,/#dabbirApptManage \[data-appt-edit\]/);
  assert.match(ui,/isHistorical\(row\)/);
  assert.match(ui,/if\(button\.disabled\)button\.disabled=false/);
  assert.match(ui,/dataset\.dabbirHistoricalEdit/);
  assert.match(ui,/closest\?\.\('\[data-appt-edit\],\[data-calendar-appt\]'\)/);
  assert.match(ui,/event\.stopImmediatePropagation\(\)/);
});

test('past calendar events open the same historical editor',()=>{
  assert.match(ui,/\[data-calendar-appt\]/);
  assert.match(ui,/button\.dataset\.apptEdit\|\|button\.dataset\.calendarAppt/);
  assert.match(ui,/isHistorical\(row\)/);
  assert.match(ui,/openEditor\(id\)/);
});

test('car-wash historical editor persists date and status through the canonical appointment API',()=>{
  assert.match(ui,/\/api\/appointment-management/);
  assert.match(ui,/action:'update'/);
  assert.match(ui,/starts_at:start,status:nextStatus/);
  assert.match(ui,/data\?\.detail\|\|data\?\.error/);
  assert.doesNotMatch(ui,/location\.reload\(\)/);
  assert.match(ui,/renderSavedAppointment\(w\.business\.id,id,data\.appointment\)/);
});

test('historical booking editor follows the selected GCC business timezone authority',()=>{
  assert.match(ui,/function businessTimezone\(\)/);
  assert.match(ui,/business\.timezone\|\|document\.documentElement\.dataset\.dabbirTimezone\|\|window\.__dabbirTimeZone/);
  assert.match(ui,/window\.dabbirLocalTimeToIso/);
  assert.match(ui,/function offsetMinutesAt\(/);
  assert.match(ui,/businessLocalMinute\(row\.starts_at\)/);
  assert.match(ui,/isoFromBusinessLocal/);
  assert.doesNotMatch(ui,/timeZone:'Asia\/Dubai'/);
  assert.doesNotMatch(ui,/\+04:00/);
});

test('historical booking editor is event-driven without a continuous interval',()=>{
  assert.match(ui,/new MutationObserver\(repairButtons\)/);
  assert.doesNotMatch(ui,/setInterval\(/);
});
