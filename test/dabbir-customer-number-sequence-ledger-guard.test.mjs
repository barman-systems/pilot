import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260902081000_dabbir_customer_number_sequence_ledger_guard_v1.sql', import.meta.url),
  'utf8',
);

test('customer number sequence is realigned against immutable ledger and active accounts', () => {
  assert.match(migration, /select setval\(/);
  assert.match(migration, /dabbir_private\.dabbir_customer_number_seq/);
  assert.match(migration, /from dabbir_private\.dabbir_customer_number_ledger/);
  assert.match(migration, /from public\.dabbir_user_accounts/);
  assert.match(migration, /greatest\(/);
});

test('allocator skips any number already reserved in either truth surface', () => {
  assert.match(migration, /create or replace function dabbir_private\.next_customer_number\(\)/);
  assert.match(migration, /loop[\s\S]*nextval\('dabbir_private\.dabbir_customer_number_seq'\)/);
  assert.match(migration, /where l\.customer_no = v_candidate/);
  assert.match(migration, /where a\.customer_no = v_candidate/);
  assert.match(migration, /return v_candidate/);
});

test('allocator remains privileged and documents restore-drift protection', () => {
  assert.match(migration, /revoke all on function dabbir_private\.next_customer_number\(\) from public, anon, authenticated/);
  assert.match(migration, /immutable ledger or active accounts/);
  assert.match(migration, /sequence restore drift/);
});
