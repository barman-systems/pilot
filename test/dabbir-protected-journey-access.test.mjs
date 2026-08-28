import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isProtectedJourneyUrl,
  mergeProtectedHeaders,
  protectedAccessHeaders,
} from './support/dabbir-protected-journey-access.mjs';

const ORIGIN = 'https://dabbir.example.invalid';

test('protected journey prefers Vercel automation bypass and requests bypass cookie', () => {
  assert.deepEqual(protectedAccessHeaders({ bypass: 'qa-secret', trustedOidc: 'oidc-token' }), {
    'x-vercel-protection-bypass': 'qa-secret',
    'x-vercel-set-bypass-cookie': 'true',
  });
});

test('protected journey can use trusted Vercel OIDC when no bypass exists', () => {
  assert.deepEqual(protectedAccessHeaders({ trustedOidc: 'oidc-token' }), {
    'x-vercel-trusted-oidc-idp-token': 'oidc-token',
  });
  assert.throws(() => protectedAccessHeaders(), /VERCEL_PROTECTED_ACCESS_REQUIRED/);
});

test('protected headers are injected only into the canonical protected production origin', () => {
  assert.equal(isProtectedJourneyUrl(ORIGIN, ORIGIN), true);
  assert.equal(isProtectedJourneyUrl(`${ORIGIN}/api/runtime`, ORIGIN), true);
  assert.equal(isProtectedJourneyUrl(`${ORIGIN}?probe=1`, ORIGIN), true);
  assert.equal(isProtectedJourneyUrl('https://spohjzrsymsmzsseygtw.supabase.co/functions/v1/test', ORIGIN), false);
  assert.equal(isProtectedJourneyUrl('https://dabbir.example.invalid.attacker.test/', ORIGIN), false);
});

test('protection headers override caller values without deleting ordinary request headers', () => {
  const merged = mergeProtectedHeaders(
    { accept: 'application/json', 'x-vercel-protection-bypass': 'wrong' },
    { 'x-vercel-protection-bypass': 'right', 'x-vercel-set-bypass-cookie': 'true' },
  );
  assert.equal(merged.accept, 'application/json');
  assert.equal(merged['x-vercel-protection-bypass'], 'right');
  assert.equal(merged['x-vercel-set-bypass-cookie'], 'true');
});
