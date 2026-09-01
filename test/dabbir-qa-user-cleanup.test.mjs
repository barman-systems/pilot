import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase/functions/barman-qa-suite-runner/index.ts', import.meta.url), 'utf8');

test('QA auth deletion follows scope check -> tombstone -> product row -> auth identity', () => {
  const verify = source.indexOf('await getQaUser(userId,runId)');
  const tombstone = source.indexOf("db.from('account_access_state').upsert");
  const productDelete = source.indexOf("db.from('dabbir_user_accounts').delete().eq('user_id',userId)");
  const authDelete = source.indexOf('db.auth.admin.deleteUser(userId)');

  assert.ok(verify >= 0, 'QA metadata/run scope verification must remain');
  assert.ok(tombstone > verify, 'QA tombstone must follow scope verification');
  assert.ok(productDelete > tombstone, 'DABBIR product-account delete requires the deleted tombstone first');
  assert.ok(authDelete > productDelete, 'auth.users deletion must happen only after the product RESTRICT row is removed');
  assert.match(source, /status:'deleted'/);
  assert.match(source, /reason:'DABBIR_QA_CLEANUP'/);
  assert.match(source, /QA_USER_TOMBSTONE_FAILED/);
  assert.match(source, /QA_USER_ACCOUNT_DELETE_FAILED/);
});

test('QA cleanup never bulk-deletes DABBIR product accounts', () => {
  assert.doesNotMatch(source, /from\('dabbir_user_accounts'\)\.delete\(\)(?!\.eq\('user_id',userId\))/);
});

const functionConfig = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');

test('QA runner disables gateway JWT validation because it verifies GitHub OIDC itself', () => {
  assert.match(source, /async function verifyGitHubOidc/);
  assert.match(source, /OIDC_SIGNATURE_INVALID/);
  assert.match(functionConfig, /\[functions\.barman-qa-suite-runner\][\s\S]*verify_jwt\s*=\s*false/);
});
