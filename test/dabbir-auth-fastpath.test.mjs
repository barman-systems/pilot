import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getBusinessMemberships, userClaimsFromValidatedAccessToken } from '../api/_auth-core.js';

const root = new URL('../', import.meta.url);
const runtimeSource = await readFile(new URL('api/dabbir-runtime-fast.js', root), 'utf8');
const authSource = await readFile(new URL('api/_auth-core.js', root), 'utf8');

const now = 1_800_000_000;
const userId = '11111111-1111-4111-8111-111111111111';

function token(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.test-signature`;
}

function validPayload(overrides = {}) {
  return {
    iss: 'https://spohjzrsymsmzsseygtw.supabase.co/auth/v1',
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    email: 'owner@example.test',
    exp: now + 3600,
    ...overrides,
  };
}

test('validated Supabase token claims are read without a second Auth request', () => {
  assert.deepEqual(userClaimsFromValidatedAccessToken(token(validPayload()), now), {
    id: userId,
    email: 'owner@example.test',
    aud: 'authenticated',
  });
});

test('validated-token claims fail closed for wrong issuer, role, audience, expiry, nbf or subject', () => {
  assert.equal(userClaimsFromValidatedAccessToken(token(validPayload({ iss: 'https://example.test/auth/v1' })), now), null);
  assert.equal(userClaimsFromValidatedAccessToken(token(validPayload({ role: 'anon' })), now), null);
  assert.equal(userClaimsFromValidatedAccessToken(token(validPayload({ aud: 'anon' })), now), null);
  assert.equal(userClaimsFromValidatedAccessToken(token(validPayload({ aud: ['anon', 'service_role'] })), now), null);
  assert.equal(userClaimsFromValidatedAccessToken(token(validPayload({ exp: now })), now), null);
  assert.equal(userClaimsFromValidatedAccessToken(token(validPayload({ nbf: now + 30 })), now), null);
  assert.equal(userClaimsFromValidatedAccessToken(token(validPayload({ sub: 'not-a-uuid' })), now), null);
  assert.equal(userClaimsFromValidatedAccessToken('not-a-jwt', now), null);
});

test('membership lookup is self-scoped and receives a default abort deadline', async () => {
  const previousFetch = globalThis.fetch;
  let seenUrl = '';
  let seenSignal = null;
  globalThis.fetch = async (url, options = {}) => {
    seenUrl = String(url);
    seenSignal = options.signal || null;
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    await getBusinessMemberships(token(validPayload()));
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.match(seenUrl, new RegExp(`user_id=eq\\.${userId}`));
  assert.ok(seenSignal instanceof AbortSignal, 'Supabase request must have a bounded signal');
  assert.match(authSource, /DABBIR_SUPABASE_TIMEOUT_MS/);
});

test('Supabase endpoint remains cutover-ready through environment configuration', () => {
  assert.match(authSource, /process\.env\.SUPABASE_URL/);
  assert.match(authSource, /process\.env\.SUPABASE_PUBLISHABLE_KEY/);
});

test('fast runtime validates membership before trusting decoded claims and retains fallback verification', () => {
  const membershipLookup = runtimeSource.indexOf('signal => getBusinessMemberships(accessToken, { signal })');
  const claimsRead = runtimeSource.indexOf('userClaimsFromValidatedAccessToken(accessToken)');
  const fallback = runtimeSource.indexOf('signal => getVerifiedUser(accessToken, { signal })');
  assert.ok(membershipLookup >= 0, 'abort-bounded membership validation must exist');
  assert.ok(claimsRead > membershipLookup, 'claims may only be trusted after Supabase Data API accepts the token');
  assert.ok(fallback > claimsRead, 'legacy/unexpected token shapes must retain abort-bounded server verification fallback');
  assert.match(runtimeSource, /AUTH_VERIFICATION_UNAVAILABLE/);
  assert.match(runtimeSource, /const DABBIR_FAST_RUNTIME_VERSION = 'fast-v7-timeout-guarded'/);
  assert.match(runtimeSource, /x-dabbir-runtime', DABBIR_FAST_RUNTIME_VERSION/);
});

test('fast runtime parses query parameters with WHATWG URL instead of legacy req.query', () => {
  assert.match(runtimeSource, /new URL\(String\(req\?\.url \|\| '\/'\), 'https:\/\/dabbir\.invalid'\)/);
  assert.match(runtimeSource, /url\.searchParams\.getAll\(name\)/);
  assert.doesNotMatch(runtimeSource, /req\.query/);
  assert.match(runtimeSource, /singleQueryValue\(req, 'business_id'\)/);
  assert.match(runtimeSource, /singleQueryValue\(req, 'conversation_id'\)/);
  assert.match(runtimeSource, /singleQueryValue\(req, 'summary'\)/);
});
