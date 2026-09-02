import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260902075523_dabbir_customer_number_sequence_ledger_guard_v1.sql', import.meta.url), 'utf8');

test('customer number sequence is advanced beyond both immutable ledger and active accounts', () => {
  assert.match(sql, /select\s+setval\s*\(/i);
  assert.match(sql, /greatest\s*\(/i);
  assert.match(sql, /dabbir_customer_number_ledger/i);
  assert.match(sql, /dabbir_user_accounts/i);
});

test('allocator refuses to return a number already present in ledger or accounts', () => {
  assert.match(sql, /create\s+or\s+replace\s+function\s+dabbir_private\.next_customer_number\s*\(\s*\)/i);
  assert.match(sql, /not\s+exists\s*\([\s\S]*dabbir_customer_number_ledger/i);
  assert.match(sql, /and\s+not\s+exists\s*\([\s\S]*dabbir_user_accounts/i);
  assert.match(sql, /nextval\s*\(\s*'dabbir_private\.dabbir_customer_number_seq'\s*\)/i);
});
