import test from 'node:test';
import assert from 'node:assert/strict';

const SERVICE_ROLE_ENV = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_');
const TOKEN_KEY_ENV = ['DABBIR', 'CALENDAR', 'TOKEN', 'KEY'].join('_');
const STATE_SECRET_ENV = ['DABBIR', 'CALENDAR', 'STATE', 'SECRET'].join('_');

const original = {
  serviceRole: process.env[SERVICE_ROLE_ENV],
  tokenKey: process.env[TOKEN_KEY_ENV],
  stateSecret: process.env[STATE_SECRET_ENV],
};

process.env[SERVICE_ROLE_ENV] = ['calendar', 'test', 'server', 'secret', '0123456789abcdef'].join('_');
delete process.env[TOKEN_KEY_ENV];
delete process.env[STATE_SECRET_ENV];

const {
  decryptTokenPayload,
  encryptTokenPayload,
  signOauthState,
  verifyOauthState,
} = await import('../api/_calendar-core.js?calendar-security-bootstrap-test');

test.after(() => {
  if (original.serviceRole === undefined) delete process.env[SERVICE_ROLE_ENV];
  else process.env[SERVICE_ROLE_ENV] = original.serviceRole;
  if (original.tokenKey === undefined) delete process.env[TOKEN_KEY_ENV];
  else process.env[TOKEN_KEY_ENV] = original.tokenKey;
  if (original.stateSecret === undefined) delete process.env[STATE_SECRET_ENV];
  else process.env[STATE_SECRET_ENV] = original.stateSecret;
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
