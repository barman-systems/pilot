import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync('api/appointment-management-ui.js','utf8');
const performance=fs.readFileSync('api/calendar-performance-ui.js','utf8');
const index=fs.readFileSync('index.html','utf8');

test('generic service bookings render a real day week month calendar over the canonical appointment screen',()=>{
  assert.match(ui,/dabbirGenericCalendar/);
  assert.match(ui,/calendarView.*'week'/);
  assert.match(ui,/renderDayCalendar/);
  assert.match(ui,/renderWeekCalendar/);
  assert.match(ui,/renderMonthCalendar/);
  assert.match(ui,/data-calendar-view="day"/);
  assert.match(ui,/data-calendar-view="week"/);
  assert.match(ui,/data-calendar-view="month"/);
  assert.match(ui,/ws\(\)\?\.appointments/);
  assert.match(index,/id="screen-appointments"/);
  assert.match(index,/id="appointmentsTable"/);
});

test('generic calendar does not create a parallel booking model and keeps Salon as its richer owner',()=>{
  assert.doesNotMatch(ui,/fetch\(['"]\/api\/generic-calendar/);
  assert.match(ui,/!\['store','creator','real_estate','salon'\]\.includes\(businessType\(\)\)/);
  assert.match(ui,/\/api\/appointment-management/);
  assert.doesNotMatch(ui,/create_appointment/);
});

test('calendar events edit the same persisted appointment and cancelled items stay out of active calendar',()=>{
  assert.match(ui,/data-calendar-appt/);
  assert.match(ui,/openEdit\(btn\.dataset\.calendarAppt\)/);
  assert.match(ui,/action:'update'.*appointment_id:editingId/);
  assert.match(ui,/action:'delete'.*appointment_id:id/);
  assert.match(ui,/!\['cancelled','canceled'\]\.includes/);
});

test('event-scoped performance wrapper remains the only shipped calendar bundle and patches business timezone',()=>{
  assert.match(performance,/import calendarLiveHandler from '\.\/calendar-live-ui\.js'/);
  assert.match(performance,/appointment-management-business-timezone/);
  assert.match(performance,/appointment-management-global-observer-and-poll/);
  assert.match(ui,/appointment-management-v3-direct-record/);
});
