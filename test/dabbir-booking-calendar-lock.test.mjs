import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260902073500_dabbir_booking_calendar_transaction_lock_v1.sql',import.meta.url),'utf8');

const requiredTables=[
  'public.dabbir_appointments',
  'public.dabbir_calendar_busy_blocks',
  'public.dabbir_worker_schedules',
  'public.dabbir_worker_time_off',
];

test('booking calendar writes are serialized per business with a transaction lock',()=>{
  assert.match(migration,/pg_advisory_xact_lock\(hashtextextended\('dabbir:booking-calendar:' \|\|/);
  assert.match(migration,/create or replace function dabbir_private\.lock_booking_calendar_business\(\)/);
  assert.match(migration,/revoke all on function dabbir_private\.lock_booking_calendar_business\(\) from public,anon,authenticated/);
});

test('all scheduling truth surfaces share the same lock trigger',()=>{
  for(const table of requiredTables){
    assert.match(migration,new RegExp(`create trigger dabbir_00_booking_calendar_lock[\\s\\S]+?on ${table.replaceAll('.','\\.')}[\\s\\S]+?lock_booking_calendar_business\\(\\)`));
  }
});

test('lock trigger sorts before the appointment conflict guard',()=>{
  assert.ok('dabbir_00_booking_calendar_lock'.localeCompare('dabbir_appointment_calendar_conflict_guard') < 0);
});
