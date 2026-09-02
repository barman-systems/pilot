import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20260902075523_dabbir_customer_number_sequence_ledger_guard_v1.sql', import.meta.url),
  'utf8',
);

test('customer number sequence is advanced beyond both immutable ledger and active accounts', () => {
  assert.match(migration, /select\s+setval\s*\(/i);
  assert.match(migration, /select\s+last_value\s+from\s+dabbir_private\.dabbir_customer_number_seq/i);
  assert.match(migration, /from\s+dabbir_private\.dabbir_customer_number_ledger/i);
  assert.match(migration, /from\s+public\.dabbir_user_accounts/i);
  assert.match(migration, /greatest\s*\(/i);
});

test('customer number allocator refuses numbers already reserved in either source of truth', () => {
  assert.match(migration, /create\s+or\s+replace\s+function\s+dabbir_private\.next_customer_number\(\)/i);
  assert.match(migration, /nextval\('dabbir_private\.dabbir_customer_number_seq'\)/i);
  assert.match(migration, /where\s+l\.customer_no\s*=\s*v_candidate/i);
  assert.match(migration, /where\s+a\.customer_no\s*=\s*v_candidate/i);
  assert.match(migration, /return\s+v_candidate/i);
});
