import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Meta test bootstrap is exact-asset, production-only and one-time-token gated',async()=>{
  const api=await read('api/dabbir-whatsapp-test-bootstrap.js');
  const migration=await read('supabase/migrations/20260907023000_dabbir_whatsapp_test_number_bootstrap.sql');
  assert.match(api,/EXPECTED_TEST_WABA_ID='1510889861054603'/);
  assert.match(api,/EXPECTED_TEST_PHONE_NUMBER_ID='1324337064094613'/);
  assert.match(api,/VERCEL_ENV/);
  assert.match(api,/BOOTSTRAP_TOKEN_REQUIRED/);
  assert.match(api,/verifyEmbeddedAssets/);
  assert.match(api,/sealAccessToken/);
  assert.match(api,/dabbir_whatsapp_test_bootstrap_claim/);
  assert.match(api,/dabbir_whatsapp_test_bootstrap_store/);
  assert.match(migration,/auth\.role\(\).*service_role/);
  assert.match(migration,/status='REVOKED'/);
  assert.match(migration,/revoke all on function public\.dabbir_whatsapp_test_bootstrap_claim/);
  assert.match(migration,/grant execute on function public\.dabbir_whatsapp_test_bootstrap_store[\s\S]*service_role/);
});
