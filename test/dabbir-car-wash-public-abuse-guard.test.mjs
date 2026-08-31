import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260831185000_dabbir_car_wash_public_booking_abuse_guard_v1.sql'),'utf8');

test('public car wash booking path has bounded per-phone request windows',()=>{
  assert.match(migration,/source\s+is\s+distinct\s+from\s+'public_booking'/i);
  assert.match(migration,/interval '10 minutes'/i);
  assert.match(migration,/v_recent_count\s*>=\s*5/i);
  assert.match(migration,/interval '24 hours'/i);
  assert.match(migration,/v_daily_count\s*>=\s*20/i);
  assert.match(migration,/BOOKING_RATE_LIMITED/);
});

test('rate limiter serializes concurrent attempts and remains trigger-only',()=>{
  assert.match(migration,/pg_advisory_xact_lock/i);
  assert.match(migration,/before insert on public\.dabbir_car_wash_booking_requests/i);
  assert.match(migration,/revoke all on function public\.dabbir_car_wash_public_booking_abuse_guard\(\) from public, anon, authenticated/i);
});
