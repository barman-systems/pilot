import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const hardening = await readFile(new URL('supabase/migrations/20260828043800_dabbir_recovery_anon_execute_hardening_v1.sql', root), 'utf8');
const source = await readFile(new URL('supabase/migrations/20260827134844_dabbir_customer_recovery_vault_trigger_hardening_v1.sql', root), 'utf8');

test('private recovery context helper is no longer executable by anonymous clients', () => {
  assert.match(hardening, /revoke execute on function dabbir_private\.recovery_is_active\(\) from anon/i);
  assert.match(hardening, /has_function_privilege\('anon',[\s\S]*recovery_is_active\(\)[\s\S]*'EXECUTE'\)/i);
});

test('authenticated execution remains available because application DML trigger guards require it', () => {
  assert.match(hardening, /has_function_privilege\('authenticated',[\s\S]*recovery_is_active\(\)[\s\S]*'EXECUTE'\)/i);
  assert.match(source, /for each row when \(not dabbir_private\.recovery_is_active\(\)\)/i);
});
