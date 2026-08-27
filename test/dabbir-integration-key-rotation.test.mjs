import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openAccessToken,
  sealAccessToken,
  tokenNeedsRotation,
} from '../api/_whatsapp-embedded-core.js';

const businessId='13863744-4655-440f-bf9a-12b2e0e40e94';

test('stored WhatsApp tokens can move from previous key version to current without plaintext persistence',()=>{
  const oldConfig={
    encryptionSecret:'old-secret-material-for-test-only',
    encryptionKeyVersion:'whatsapp_v1',
    previousEncryptionSecret:'',
    previousEncryptionKeyVersion:'',
  };
  const oldRow={business_id:businessId,...sealAccessToken('meta-token-value',oldConfig,businessId)};
  assert.equal(oldRow.token_key_version,'whatsapp_v1');
  assert.equal(openAccessToken(oldRow,oldConfig,businessId),'meta-token-value');

  const rotatingConfig={
    encryptionSecret:'new-secret-material-for-test-only',
    encryptionKeyVersion:'whatsapp_v2',
    previousEncryptionSecret:'old-secret-material-for-test-only',
    previousEncryptionKeyVersion:'whatsapp_v1',
    rotationReady:true,
  };
  assert.equal(tokenNeedsRotation(oldRow,rotatingConfig),true);
  assert.equal(openAccessToken(oldRow,rotatingConfig,businessId),'meta-token-value');

  const currentRow={business_id:businessId,...sealAccessToken('meta-token-value',rotatingConfig,businessId)};
  assert.equal(currentRow.token_key_version,'whatsapp_v2');
  assert.equal(tokenNeedsRotation(currentRow,rotatingConfig),false);
  assert.equal(openAccessToken(currentRow,rotatingConfig,businessId),'meta-token-value');
  assert.notEqual(currentRow.access_token_ciphertext,oldRow.access_token_ciphertext);
});

test('old ciphertext fails closed when its previous key version is unavailable',()=>{
  const oldConfig={encryptionSecret:'old-key',encryptionKeyVersion:'whatsapp_v1'};
  const oldRow={business_id:businessId,...sealAccessToken('secret',oldConfig,businessId)};
  const currentOnly={encryptionSecret:'new-key',encryptionKeyVersion:'whatsapp_v2'};
  assert.throws(
    ()=>openAccessToken(oldRow,currentOnly,businessId),
    /INTEGRATION_ENCRYPTION_KEY_VERSION_UNAVAILABLE/,
  );
});