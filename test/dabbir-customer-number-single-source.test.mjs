import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('customer number cleanup preserves the authoritative registry and removes the duplicate', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260827144500_dabbir_customer_number_single_source_v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /dabbir_user_accounts/);
  assert.match(sql, /full join public\.dabbir_user_numbers/i);
  assert.match(sql, /customer_no is distinct from n\.customer_no/i);
  assert.match(sql, /REGISTRY_MISMATCH/);
  assert.match(sql, /drop table if exists public\.dabbir_user_numbers/i);
  assert.match(sql, /AUTHORITATIVE DABBIR visible account-number registry/i);
});
