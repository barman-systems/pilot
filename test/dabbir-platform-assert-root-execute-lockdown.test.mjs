import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260903200922_dabbir_platform_assert_root_execute_lockdown_v1.sql'),'utf8');

test('ROOT_OWNER assertion helper is never directly executable by browser-facing roles',()=>{
  assert.match(migration,/revoke execute on function dabbir_private\.platform_assert_root\(uuid\) from public;/i);
  assert.match(migration,/revoke execute on function dabbir_private\.platform_assert_root\(uuid\) from anon;/i);
  assert.match(migration,/revoke execute on function dabbir_private\.platform_assert_root\(uuid\) from authenticated;/i);
  assert.match(migration,/grant execute on function dabbir_private\.platform_assert_root\(uuid\) to service_role;/i);
});
