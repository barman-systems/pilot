import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import signup from '../api/auth/signup.js';
import { passwordHashRange } from '../api/_password-breach-check.js';

const INPUT = { email: 'activation@example.invalid', password: 'Falcon!47River' };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function attempt(t, upstream, { origin = 'https://dabbir.example.invalid', breach } = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    calls.push(path);
    if (path.startsWith('https://api.pwnedpasswords.com/range/')) {
      return breach || new Response('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\n');
    }
    assert.ok(path.endsWith('/auth/v1/signup'), 'only the signup endpoint may receive the credentials');
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).email, INPUT.email);
    return upstream();
  };

  const req = Readable.from([Buffer.from(JSON.stringify(INPUT))]);
  req.method = 'POST';
  req.headers = { origin, host: 'dabbir.example.invalid' };
  const headers = new Map();
  let body;
  const res = {
    statusCode: 0,
    setHeader(key, value) { headers.set(key.toLowerCase(), value); },
    end(value) { body = JSON.parse(value); },
  };
  try {
    await signup(req, res);
  } finally {
    globalThis.fetch = originalFetch;
  }
  return { status: res.statusCode, body, headers, calls };
}

for (const status of [500, 502, 503, 504]) {
  test(`signup upstream ${status} never claims an account or email was created`, async t => {
    const result = await attempt(t, () => jsonResponse({ message: 'private provider diagnostic' }, status));
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { ok: false, error: 'AUTH_TEMPORARILY_UNAVAILABLE', retryable: true });
    assert.equal(result.headers.has('set-cookie'), false);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.calls.filter(path => path.endsWith('/auth/v1/signup')).length, 1);
  });
}

test('signup rate limiting remains a recoverable failure without provider or account details', async t => {
  const result = await attempt(t, () => jsonResponse({ message: 'too many requests for activation@example.invalid' }, 429));
  assert.equal(result.status, 429);
  assert.deepEqual(result.body, { ok: false, error: 'AUTH_RATE_LIMITED', retryable: true });
  assert.equal(result.headers.has('set-cookie'), false);
});

test('an interrupted signup is unconfirmed and is never retried automatically', async t => {
  const result = await attempt(t, () => { throw new Error('connection lost after submission'); });
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { ok: false, error: 'AUTH_TEMPORARILY_UNAVAILABLE', retryable: true });
  assert.equal(result.calls.filter(path => path.endsWith('/auth/v1/signup')).length, 1);
  assert.equal(result.headers.has('set-cookie'), false);
});

test('pending verification and existing-account rejections are indistinguishable publicly', async t => {
  const results = [];
  for (const status of [200, 400, 422]) {
    results.push(await attempt(t, () => jsonResponse(status === 200
      ? { id: 'new-user-private-id', email: INPUT.email }
      : { code: 'user_already_exists', message: 'User already registered', email: INPUT.email }, status)));
  }
  for (const result of results) {
    assert.equal(result.status, 202);
    assert.deepEqual(result.body, { ok: true, authenticated: false, verification_required: true });
    assert.deepEqual([...result.headers], [...results[0].headers]);
    assert.equal(result.headers.has('set-cookie'), false);
  }
});

test('a proven immediate session stays in secure cookies and never enters the response body', async t => {
  const result = await attempt(t, () => jsonResponse({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 }));
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { ok: true, authenticated: true, verification_required: false });
  const cookies = result.headers.get('set-cookie');
  assert.equal(cookies.length, 2);
  assert.ok(cookies.every(cookie => cookie.includes('Secure; HttpOnly; SameSite=Lax')));
  assert.equal(JSON.stringify(result.body).includes('test-access'), false);
  assert.equal(JSON.stringify(result.body).includes('test-refresh'), false);
});

test('invalid provider JSON cannot become verification success', async t => {
  const result = await attempt(t, () => new Response('invalid json', { status: 200 }));
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.verification_required, undefined);
  assert.equal(result.headers.has('set-cookie'), false);
});

for (const payload of [{}, null, [], { user: {} }, { id: 'user-id', access_token: 'incomplete-session' }]) {
  test(`an incomplete provider response cannot claim verification: ${JSON.stringify(payload)}`, async t => {
    const result = await attempt(t, () => jsonResponse(payload));
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.verification_required, undefined);
    assert.equal(result.headers.has('set-cookie'), false);
  });
}

test('a nested Supabase user without a session supports pending email verification', async t => {
  const result = await attempt(t, () => jsonResponse({ user: { id: 'provider-user-id' }, session: null }));
  assert.equal(result.status, 202);
  assert.deepEqual(result.body, { ok: true, authenticated: false, verification_required: true });
});

test('signup still rejects a cross-origin request before any external work', async t => {
  const result = await attempt(t, () => assert.fail('signup must not be called'), { origin: 'https://other.example.invalid' });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'ORIGIN_REQUIRED');
  assert.deepEqual(result.calls, []);
});

test('signup still fails closed when password security verification is unavailable', async t => {
  const result = await attempt(t, () => assert.fail('signup must not be called'), { breach: new Response('unavailable', { status: 503 }) });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'PASSWORD_SECURITY_CHECK_UNAVAILABLE');
  assert.equal(result.body.verification_required, undefined);
  assert.equal(result.calls.length, 1);
});

test('a compromised password never reaches signup', async t => {
  const { suffix } = passwordHashRange(INPUT.password);
  const result = await attempt(t, () => assert.fail('signup must not be called'), { breach: new Response(`${suffix}:3\n`) });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'COMPROMISED_PASSWORD');
  assert.equal(result.calls.length, 1);
});
