import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20260907131000_dabbir_team_wrapper_execution_contract_v13.sql', import.meta.url),
  'utf8',
);

const signatures = [
  ['dabbir_list_team', 'uuid'],
  ['dabbir_update_employee_access', 'uuid,uuid,text,text\\[\\]'],
  ['dabbir_set_employee_status', 'uuid,uuid,text'],
];

for (const [name, signature] of signatures) {
  test(name + ' keeps the public wrapper invoker-only and denies anonymous execution', () => {
    assert.match(migration, new RegExp('alter function public\\.' + name + '\\(' + signature + '\\)\\s+security invoker', 'i'));
    assert.match(migration, new RegExp('revoke all on function dabbir_private\\.' + name + '\\(' + signature + '\\) from public, anon', 'i'));
    assert.match(migration, new RegExp('revoke all on function public\\.' + name + '\\(' + signature + '\\) from public, anon', 'i'));
  });

  test(name + ' restores bounded authenticated and service-role execution', () => {
    assert.match(migration, new RegExp('grant execute on function dabbir_private\\.' + name + '\\(' + signature + '\\) to authenticated, service_role', 'i'));
    assert.match(migration, new RegExp('grant execute on function public\\.' + name + '\\(' + signature + '\\) to authenticated, service_role', 'i'));
  });
}

test('team wrapper contract never upgrades a public wrapper to security definer', () => {
  assert.doesNotMatch(migration, /security definer/i);
});
