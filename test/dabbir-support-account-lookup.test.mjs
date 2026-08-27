import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('support lookup resolves exact DAB/email/phone and stays service-only', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260827145000_dabbir_support_account_lookup_v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /dabbir_private\.resolve_account_lookup/);
  assert.match(sql, /customer_no/);
  assert.match(sql, /lower\(u\.email\)/i);
  assert.match(sql, /regexp_replace\(coalesce\(u\.phone/i);
  assert.match(sql, /matched_on/);
  assert.match(sql, /revoke all on function dabbir_private\.resolve_account_lookup\(text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function dabbir_private\.resolve_account_lookup\(text\) to service_role/i);
});
