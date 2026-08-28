import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/auth/mfa-status.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOTP_FACTOR_ID = '22222222-2222-4222-8222-222222222222';
const PHONE_FACTOR_ID = '33333333-3333-4333-8333-333333333333';

function token(aal = 'aal1') {
  const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({
    sub: USER_ID,
    email: 'qa@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    iss: 'https://spohjzrsymsmzsseygtw.supabase.co/auth/v1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    aal,
  })}.signature`;
}

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function invoke(accessToken, method = 'GET') {
  const headers = new Map();
  let text = '';
  const res = {
    statusCode: 0,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    end(value = '') { text = String(value); },
  };
  return Promise.resolve(handler({ method, headers: { cookie: `__Host-dabbir_access=${encodeURIComponent(accessToken)}` } }, res))
    .then(() => ({ status: res.statusCode, headers, body: JSON.parse(text) }));
}

function installFetch({ factors = [], accountAccess = [] } = {}) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    calls.push({ url: value, method: String(options.method || 'GET') });
    if (value.endsWith('/auth/v1/user')) {
      return response(200, { id: USER_ID, email: 'qa@example.com', aud: 'authenticated', factors });
    }
    if (value.includes('/rest/v1/account_access_state?')) return response(200, accountAccess);
    throw new Error(`UNEXPECTED_FETCH:${value}`);
  };
  return { calls, restore() { global.fetch = original; } };
}

test('aal1 session with verified TOTP requires MFA and exposes only safe factor metadata', async () => {
  const mock = installFetch({
    factors: [{ id: TOTP_FACTOR_ID, factor_type: 'totp', status: 'verified', friendly_name: 'DABBIR Authenticator', secret: 'MUST_NOT_LEAK' }],
  });
  try {
    const result = await invoke(token('aal1'));
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.current_level, 'aal1');
    assert.equal(result.body.next_level, 'aal2');
    assert.equal(result.body.mfa_required, true);
    assert.equal(result.body.factor_id, TOTP_FACTOR_ID);
    assert.equal(result.body.factor_type, 'totp');
    assert.deepEqual(result.body.factors, [{ id: TOTP_FACTOR_ID, factor_type: 'totp', friendly_name: 'DABBIR Authenticator' }]);
    assert.equal(JSON.stringify(result.body).includes('MUST_NOT_LEAK'), false);
    assert.equal(mock.calls.filter(call => call.url.endsWith('/auth/v1/user')).length, 2);
  } finally {
    mock.restore();
  }
});

test('TOTP is preferred over phone factor for browser continuation', async () => {
  const mock = installFetch({
    factors: [
      { id: PHONE_FACTOR_ID, factor_type: 'phone', status: 'verified', friendly_name: 'Phone' },
      { id: TOTP_FACTOR_ID, factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator' },
    ],
  });
  try {
    const result = await invoke(token('aal1'));
    assert.equal(result.status, 200);
    assert.equal(result.body.mfa_required, true);
    assert.equal(result.body.factor_id, TOTP_FACTOR_ID);
    assert.equal(result.body.factor_type, 'totp');
  } finally {
    mock.restore();
  }
});

test('aal2 session does not request another MFA challenge', async () => {
  const mock = installFetch({
    factors: [{ id: TOTP_FACTOR_ID, factor_type: 'totp', status: 'verified', friendly_name: 'DABBIR Authenticator' }],
  });
  try {
    const result = await invoke(token('aal2'));
    assert.equal(result.status, 200);
    assert.equal(result.body.current_level, 'aal2');
    assert.equal(result.body.next_level, 'aal2');
    assert.equal(result.body.mfa_required, false);
    assert.equal(result.body.factor_id, null);
    assert.equal(result.body.factor_type, null);
  } finally {
    mock.restore();
  }
});

test('unverified factors never force an MFA continuation', async () => {
  const mock = installFetch({
    factors: [{ id: TOTP_FACTOR_ID, factor_type: 'totp', status: 'unverified', friendly_name: 'Pending' }],
  });
  try {
    const result = await invoke(token('aal1'));
    assert.equal(result.status, 200);
    assert.equal(result.body.mfa_required, false);
    assert.equal(result.body.next_level, 'aal1');
    assert.deepEqual(result.body.factors, []);
  } finally {
    mock.restore();
  }
});

test('suspended DABBIR account cannot use MFA status as an authentication oracle', async () => {
  const mock = installFetch({ accountAccess: [{ status: 'suspended', reason: 'test', suspended_at: new Date().toISOString() }] });
  try {
    const result = await invoke(token('aal1'));
    assert.equal(result.status, 401);
    assert.deepEqual(result.body, { ok: false, error: 'AUTH_REQUIRED' });
  } finally {
    mock.restore();
  }
});

test('MFA status is read-only', async () => {
  const mock = installFetch();
  try {
    const result = await invoke(token('aal1'), 'POST');
    assert.equal(result.status, 405);
    assert.equal(result.body.error, 'METHOD_NOT_ALLOWED');
  } finally {
    mock.restore();
  }
});
