import test from 'node:test';
import assert from 'node:assert/strict';

const original = {
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  tokenKey: process.env.DABBIR_CALENDAR_TOKEN_KEY,
  stateSecret: process.env.DABBIR_CALENDAR_STATE_SECRET,
};

process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_dabbir_calendar_test_service_role_0123456789abcdef';
delete process.env.DABBIR_CALENDAR_TOKEN_KEY;
delete process.env.DABBIR_CALENDAR_STATE_SECRET;

const {
  decryptTokenPayload,
  encryptTokenPayload,
  signOauthState,
  verifyOauthState,
} = await import('../api/_calendar-core.js?calendar-security-bootstrap-test');

test.after(() => {
  if (original.serviceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = original.serviceRole;
  if (original.tokenKey === undefined) delete process.env.DABBIR_CALENDAR_TOKEN_KEY;
  else process.env.DABBIR_CALENDAR_TOKEN_KEY = original.tokenKey;
  if (original.stateSecret === undefined) delete process.env.DABBIR_CALENDAR_STATE_SECRET;
  else process.env.DABBIR_CALENDAR_STATE_SECRET = original.stateSecret;
});

test('calendar tokens encrypt and decrypt using the server-only fallback secret', () => {
  const token = { access_token: 'access', refresh_token: 'refresh', expires_in: 3600 };
  const sealed = encryptTokenPayload(token);
  assert.equal(typeof sealed.ciphertext, 'string');
  assert.equal(typeof sealed.iv, 'string');
  assert.equal(typeof sealed.tag, 'string');
  assert.deepEqual(decryptTokenPayload({
    token_ciphertext: sealed.ciphertext,
    token_iv: sealed.iv,
    token_tag: sealed.tag,
  }), token);
});

test('oauth state signs and verifies using the server-only fallback secret', () => {
  const payload = {
    business_id: '11111111-1111-4111-8111-111111111111',
    provider: 'google',
    user_id: '22222222-2222-4222-8222-222222222222',
    exp: Date.now() + 60_000,
  };
  const state = signOauthState(payload);
  assert.deepEqual(verifyOauthState(state), payload);
  assert.throws(() => verifyOauthState(`${state}x`), /INVALID_CALENDAR_OAUTH_STATE/);
});
