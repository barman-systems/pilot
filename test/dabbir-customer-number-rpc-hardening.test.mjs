import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260827190000_dabbir_customer_number_rpc_hardening_v1.sql', import.meta.url), 'utf8');

test('customer-number lookup runs as caller under FORCE RLS', () => {
  assert.match(migration, /alter table public\.dabbir_user_numbers force row level security/i);
  assert.match(migration, /create or replace function public\.dabbir_my_customer_no\(\)[\s\S]*security invoker/i);
  assert.match(migration, /where n\.user_id = auth\.uid\(\)/i);
});

test('customer-number RPC is not callable anonymously', () => {
  assert.match(migration, /revoke all on function public\.dabbir_my_customer_no\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.dabbir_my_customer_no\(\) to authenticated, service_role/i);
  assert.doesNotMatch(migration, /^\s*grant execute[^\n]*anon/im);
});
