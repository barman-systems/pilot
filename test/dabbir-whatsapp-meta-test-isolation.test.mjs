import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const core=fs.readFileSync(path.join(root,'api/_whatsapp-meta-test-core.js'),'utf8');
const webhook=fs.readFileSync(path.join(root,'api/dabbir-whatsapp-meta-test-webhook.js'),'utf8');

test('Meta test sender uses only explicit test-number credentials',()=>{
  assert.match(core,/accessToken:\s*firstEnv\('DABBIR_WHATSAPP_TEST_ACCESS_TOKEN'\)/);
  assert.match(core,/phoneNumberId:\s*firstEnv\('DABBIR_WHATSAPP_TEST_PHONE_NUMBER_ID'\)/);
  for(const forbidden of [
    'DABBIR_WHATSAPP_ACCESS_TOKEN',
    'PILOT_WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_ACCESS_TOKEN',
    'META_WHATSAPP_ACCESS_TOKEN',
    'DABBIR_WHATSAPP_PHONE_NUMBER_ID',
    'PILOT_WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_PHONE_NUMBER_ID',
    'META_WHATSAPP_PHONE_NUMBER_ID',
  ]) assert.equal(core.includes(forbidden),false,`test harness must not fall back to ${forbidden}`);
});

test('Meta test mode is DABBIR-only and fail-closed',()=>{
  assert.match(core,/firstEnv\('DABBIR_WHATSAPP_META_TEST_MODE'\)/);
  assert.equal(core.includes('PILOT_WHATSAPP_META_TEST_MODE'),false);
  assert.match(core,/TEST_CREDENTIALS_NOT_CONFIGURED/);
  assert.match(core,/PHONE_NUMBER_ID_MISMATCH/);
});

test('Meta test webhook still requires signed Meta payloads',()=>{
  assert.match(webhook,/verifyMetaSignature/);
  assert.match(webhook,/invalid_meta_signature/);
  assert.match(webhook,/payload\.object !== 'whatsapp_business_account'/);
  assert.match(webhook,/META_TEST_MODE_DISABLED/);
});
