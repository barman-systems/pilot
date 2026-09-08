import test from 'node:test';
import assert from 'node:assert/strict';
import { openAccessToken, sealAccessToken } from '../api/_whatsapp-embedded-core.js';

const config = {
  encryptionSecret: 'dabbir-transfer-test-secret',
  encryptionKeyVersion: 'whatsapp_v1',
};
const sourceBusinessId = '4057c7bb-668f-422d-a6c5-07e991f5351c';
const targetBusinessId = 'e2cea503-3316-4952-ba12-7a01f7ff43f1';

test('sealed WhatsApp token carries its crypto context across business reassignment', () => {
  const sealed = sealAccessToken('meta-access-token-test', config, sourceBusinessId);
  assert.match(sealed.access_token_tag, new RegExp(`^ctx1\\.${sourceBusinessId}\\.`));
  assert.equal(openAccessToken(sealed, config, targetBusinessId), 'meta-access-token-test');
});

test('legacy plain tag can use stored token_context_id after business reassignment', () => {
  const sealed = sealAccessToken('meta-access-token-test', config, sourceBusinessId);
  const legacyTag = sealed.access_token_tag.split('.').at(-1);
  const legacy = {
    ...sealed,
    access_token_tag: legacyTag,
    token_context_id: sourceBusinessId,
  };
  assert.equal(openAccessToken(legacy, config, targetBusinessId), 'meta-access-token-test');
});

test('legacy token without preserved context fails closed under the wrong business', () => {
  const sealed = sealAccessToken('meta-access-token-test', config, sourceBusinessId);
  const legacy = {
    ...sealed,
    access_token_tag: sealed.access_token_tag.split('.').at(-1),
  };
  assert.throws(() => openAccessToken(legacy, config, targetBusinessId));
});
