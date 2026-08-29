import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler from '../api/mobile/auth/provider.js';

function request(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.headers = {};
  return req;
}

function response() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
}

test('mobile social auth rejects unsupported providers before contacting Supabase', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not call upstream'); };
  try {
    const res = response();
    await handler(request({ provider: 'facebook', id_token: 'x'.repeat(40) }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'INVALID_PROVIDER_TOKEN_INPUT');
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mobile social auth exchanges a provider token and requires an active DABBIR account', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/auth/v1/token')) {
      return new Response(JSON.stringify({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600 }), { status: 200 });
    }
    if (String(url).includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com', aud: 'authenticated' }), { status: 200 });
    }
    if (String(url).includes('/rest/v1/account_access_state')) {
      return new Response(JSON.stringify([{ status: 'active' }]), { status: 200 });
    }
    throw new Error(`unexpected upstream URL: ${url}`);
  };
  try {
    const res = response();
    await handler(request({ provider: 'apple', id_token: 'x'.repeat(40), nonce: 'n'.repeat(32) }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.provider, 'apple');
    assert.deepEqual(res.body.session, { access_token: 'access-token', refresh_token: 'refresh-token', expires_at: res.body.session.expires_at });
    assert.equal(calls.length, 3);
    const tokenBody = JSON.parse(calls[0].options.body);
    assert.equal(tokenBody.provider, 'apple');
    assert.equal(tokenBody.id_token, 'x'.repeat(40));
    assert.equal(tokenBody.nonce, 'n'.repeat(32));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
