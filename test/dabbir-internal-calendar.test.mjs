import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../api/internal-calendar-ui.js',import.meta.url),'utf8');

test('internal calendar exposes day week month views',()=>{
  assert.match(source,/data-cal-view=\\"day\\"/);
  assert.match(source,/data-cal-view=\\"week\\"/);
  assert.match(source,/data-cal-view=\\"month\\"/);
});

test('internal calendar filters cancelled bookings and respects GCC timezone fallback',()=>{
  assert.match(source,/toLowerCase\(\)!==\\'cancelled\\'/);
  assert.match(source,/Asia\/Dubai/);
  assert.match(source,/Asia\/Riyadh/);
  assert.match(source,/Asia\/Kuwait/);
  assert.match(source,/Asia\/Qatar/);
  assert.match(source,/Asia\/Bahrain/);
  assert.match(source,/Asia\/Muscat/);
});

test('internal calendar corrects today appointments metric',()=>{
  assert.match(source,/function correctTodayMetric\(\)/);
  assert.match(source,/dayKey\(a\.starts_at\)===todayKey\(\)/);
});
