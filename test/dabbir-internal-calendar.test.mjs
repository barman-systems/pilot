import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../api/internal-calendar-ui.js',import.meta.url),'utf8');
const calendarBundle=await readFile(new URL('../api/calendar-live-ui.js',import.meta.url),'utf8');
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

test('internal calendar corrects today appointments metric',()=>{
  assert.ok(source.includes('function correctTodayMetric()'));
  assert.ok(source.includes('dayKey(a.starts_at)===todayKey()'));
});

test('internal calendar is aggregated through the existing calendar bundle',()=>{
  assert.ok(calendarBundle.includes("import internalCalendarUiHandler from './internal-calendar-ui.js'"));
  assert.ok(calendarBundle.includes('internalCalendarCaptured.body'));
  assert.equal(manifest.deferred.includes('/api/internal-calendar-ui'),false);
  assert.ok(manifest.deferred.includes('/api/calendar-live-ui'));
});
