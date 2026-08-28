import test from 'node:test';
import assert from 'node:assert/strict';
import { getBusinessMemberships, getVerifiedUser } from '../api/_auth-core.js';

const VALID_USER_ID = '00000000-0000-4000-8000-000000000001';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('membership lookup forwards the caller AbortSignal to the Supabase Data API fetch', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const controller = new AbortController();
  let observedSignal = null;
  globalThis.fetch = async (_url, options = {}) => {
    observedSignal = options.signal || null;
    return jsonResponse([]);
  };

  const memberships = await getBusinessMemberships('test-access-token', { signal: controller.signal });
  assert.deepEqual(memberships, []);
  assert.equal(observedSignal, controller.signal);
});

test('verified-user fallback forwards one AbortSignal through Auth and access-state reads', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const controller = new AbortController();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), signal: options.signal || null });
    if (String(url).includes('/auth/v1/user')) {
      return jsonResponse({ id: VALID_USER_ID, email: 'qa@example.invalid', aud: 'authenticated' });
    }
    if (String(url).includes('/rest/v1/account_access_state')) return jsonResponse([]);
    throw new Error(`UNEXPECTED_FETCH:${String(url)}`);
  };

  const user = await getVerifiedUser('test-access-token', { signal: controller.signal });
  assert.equal(user?.id, VALID_USER_ID);
  assert.equal(user?.dabbir_access, 'active');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.includes('/auth/v1/user'));
  assert.ok(calls[1].url.includes('/rest/v1/account_access_state'));
  assert.equal(calls[0].signal, controller.signal);
  assert.equal(calls[1].signal, controller.signal);
});

test('an aborted membership request rejects instead of becoming a successful empty result', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const controller = new AbortController();
  globalThis.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
    const rejectAbort = () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      reject(error);
    };
    if (options.signal?.aborted) return rejectAbort();
    options.signal?.addEventListener('abort', rejectAbort, { once: true });
  });

  const request = getBusinessMemberships('test-access-token', { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, error => error?.name === 'AbortError');
});
