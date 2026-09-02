import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../api/internal-calendar-ui.js',import.meta.url),'utf8');
const calendarBundle=await readFile(new URL('../api/calendar-live-ui.js',import.meta.url),'utf8');
const performanceBundle=await readFile(new URL('../api/calendar-performance-ui.js',import.meta.url),'utf8');
const manifest=JSON.parse(await readFile(new URL('../config/dabbir-ui-bundles.json',import.meta.url),'utf8'));

test('internal calendar exposes day week month views',()=>{
  assert.ok(source.includes('data-cal-view="day"'));
  assert.ok(source.includes('data-cal-view="week"'));
  assert.ok(source.includes('data-cal-view="month"'));
});

test('internal calendar filters cancelled bookings and respects GCC timezone fallback',()=>{
  assert.ok(source.includes("toLowerCase()!=='cancelled'"));
  for(const zone of ['Asia/Dubai','Asia/Riyadh','Asia/Kuwait','Asia/Qatar','Asia/Bahrain','Asia/Muscat']) assert.ok(source.includes(zone));
});

test('today metric only writes when value changes',()=>{
  assert.ok(source.includes('dayKey(a.starts_at)===todayKey()'));
  assert.ok(source.includes('strong&&strong.textContent!==next'));
});

test('calendar events open existing booking editor',()=>{
  assert.ok(source.includes("qa('[data-appt-edit]').find"));
  assert.ok(source.includes("e.key==='Enter'||e.key===' '"));
});

test('generic calendar is event-scoped and salon keeps specialized calendar',()=>{
  assert.ok(source.includes("businessType()==='salon'"));
  assert.ok(source.includes("calendarObserver.observe(calendarScreen"));
  assert.ok(source.includes("dashboardObserver.observe(dashboard"));
  assert.equal(source.includes('observe(document.body'),false);
  assert.equal(/setInterval\s*\(/.test(source),false);
});

test('internal calendar ships through existing calendar owner and performance adapter',()=>{
  assert.ok(calendarBundle.includes("import internalCalendarUiHandler from './internal-calendar-ui.js'"));
  assert.ok(calendarBundle.includes("managementCaptured.body+'\\n'+salonCaptured.body+'\\n'+internalCalendarCaptured.body"));
  assert.ok(performanceBundle.includes("import calendarLiveHandler from './calendar-live-ui.js'"));
  assert.ok(manifest.deferred.includes('/api/calendar-performance-ui'));
  assert.equal(manifest.deferred.includes('/api/internal-calendar-ui'),false);
});
