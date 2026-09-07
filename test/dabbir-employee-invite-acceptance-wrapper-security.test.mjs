import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20260907130500_dabbir_employee_invitation_accept_wrapper_security_v12.sql', import.meta.url),
  'utf8',
);

test('employee invitation acceptance keeps a public security-invoker boundary', () => {
  assert.match(
    migration,
    /alter function public\.dabbir_accept_employee_invitation\(text\)\s+security invoker/i,
  );
  assert.doesNotMatch(migration, /security definer/i);
});

test('authenticated invitees receive only the bounded acceptance execution grant', () => {
  assert.match(
    migration,
    /revoke all on function dabbir_private\.dabbir_accept_employee_invitation\(text\)\s+from public, anon/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.dabbir_accept_employee_invitation\(text\)\s+to authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function dabbir_private\.dabbir_accept_employee_invitation\(text\)\s+to authenticated, service_role/i,
  );
});
