import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase/functions/barman-qa-suite-runner/index.ts', import.meta.url), 'utf8');

test('QA auth deletion removes only the scoped DABBIR product-account row first', () => {
  const verify = source.indexOf('await getQaUser(userId,runId)');
  const productDelete = source.indexOf("db.from('dabbir_user_accounts').delete().eq('user_id',userId)");
  const authDelete = source.indexOf('db.auth.admin.deleteUser(userId)');

  assert.ok(verify >= 0, 'QA metadata/run scope verification must remain');
  assert.ok(productDelete > verify, 'DABBIR product-account cleanup must follow QA scope verification');
  assert.ok(authDelete > productDelete, 'auth.users deletion must happen only after the RESTRICT row is removed');
  assert.match(source, /QA_USER_ACCOUNT_DELETE_FAILED/);
});

test('QA cleanup never bulk-deletes DABBIR product accounts', () => {
  assert.doesNotMatch(source, /from\('dabbir_user_accounts'\)\.delete\(\)(?!\.eq\('user_id',userId\))/);
});