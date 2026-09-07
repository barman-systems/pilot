import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20260907030000_dabbir_employee_invitation_wrapper_security_v11.sql', import.meta.url),
  'utf8',
);

test('employee invitation public RPC remains a security-invoker boundary', () => {
  assert.match(
    migration,
    /alter function public\.dabbir_create_employee_invitation\([^)]+\)\s+security invoker/i,
  );
  assert.doesNotMatch(migration, /security definer/i);
});

test('authenticated wrapper callers regain the bounded private execution grant', () => {
  assert.match(
    migration,
    /revoke all on function dabbir_private\.dabbir_create_employee_invitation\([^)]+\)\s+from public, anon/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.dabbir_create_employee_invitation\([^)]+\)\s+to authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function dabbir_private\.dabbir_create_employee_invitation\([^)]+\)\s+to authenticated, service_role/i,
  );
});
