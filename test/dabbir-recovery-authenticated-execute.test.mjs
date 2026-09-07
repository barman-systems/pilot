import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260907013217_restore_recovery_is_active_authenticated_execute.sql','utf8');

test('authenticated DML retains recovery trigger helper while anon stays blocked',()=>{
  assert.match(migration,/revoke execute on function dabbir_private\.recovery_is_active\(\) from public, anon/i);
  assert.match(migration,/grant execute on function dabbir_private\.recovery_is_active\(\) to authenticated, service_role/i);
  assert.match(migration,/has_function_privilege\('authenticated','dabbir_private\.recovery_is_active\(\)','EXECUTE'\)/i);
  assert.match(migration,/has_function_privilege\('anon','dabbir_private\.recovery_is_active\(\)','EXECUTE'\)/i);
  assert.match(migration,/RECOVERY_IS_ACTIVE_AUTHENTICATED_EXECUTE_MISSING/);
  assert.match(migration,/RECOVERY_IS_ACTIVE_ANON_EXECUTE_MUST_BE_REVOKED/);
});
