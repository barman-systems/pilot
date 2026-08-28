import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withServerReadTimeout } from '../api/_bounded-server-read.js';
import { getBillingAccount, requireBillingOwner } from '../api/_billing-core.js';
import { loadBusinessConnection, ownerContext } from '../api/_whatsapp-embedded-core.js';
import { serviceRpc } from '../api/_whatsapp-live-core.js';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000111';
const COOKIE = '__Host-dabbir_access=test-access-token';

function request() {
  return { headers: { cookie: COOKIE, host: 'dabbir.example.invalid' } };
}

function abortableStall(_url, options = {}) {
  return new Promise((_resolve, reject) => {
    const rejectAbort = () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      reject(error);
    };
    if (options.signal?.aborted) return rejectAbort();
    options.signal?.addEventListener('abort', rejectAbort, { once: true });
  });
}

function assertTimeout(error, message) {
  assert.equal(error?.message, message);
  assert.equal(error?.status, 504);
  assert.equal(error?.code, 504);
  assert.equal(error?.timeout, true);
  return true;
}

test('bounded server-read contract aborts the actual operation and emits explicit 504 timeout truth', async () => {
  let signal = null;
  await assert.rejects(
    withServerReadTimeout(activeSignal => {
      signal = activeSignal;
      return abortableStall('https://example.invalid', { signal: activeSignal });
    }, { timeoutMs: 10, errorCode: 'TEST_DATA_TIMEOUT' }),
    error => assertTimeout(error, 'TEST_DATA_TIMEOUT'),
  );
  assert.equal(signal?.aborted, true);
});

test('billing owner Auth and membership prerequisites cannot hang or become a fake access denial', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = abortableStall;
  await assert.rejects(
    requireBillingOwner(request(), BUSINESS_ID, { timeoutMs: 12 }),
    error => assertTimeout(error, 'BILLING_AUTH_DATA_TIMEOUT'),
  );
});

test('billing account read is signal-bounded and reports BILLING_STATUS_TIMEOUT', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = abortableStall;
  await assert.rejects(
    getBillingAccount('test-access-token', BUSINESS_ID, { timeoutMs: 12 }),
    error => assertTimeout(error, 'BILLING_STATUS_TIMEOUT'),
  );
});

test('WhatsApp owner Auth and membership prerequisites report 504 instead of AUTH_REQUIRED', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = abortableStall;
  await assert.rejects(
    ownerContext(request(), BUSINESS_ID, { timeoutMs: 12 }),
    error => assertTimeout(error, 'WHATSAPP_AUTH_DATA_TIMEOUT'),
  );
});

test('WhatsApp tenant connection read reports timeout instead of returning unconfigured null', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = abortableStall;
  await assert.rejects(
    loadBusinessConnection('test-access-token', BUSINESS_ID, { timeoutMs: 12 }),
    error => assertTimeout(error, 'WHATSAPP_CONNECTION_READ_TIMEOUT'),
  );
});

test('WhatsApp service-role RPC is signal-bounded without changing RPC identity or data authority', async t => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  globalThis.fetch = abortableStall;
  await assert.rejects(
    serviceRpc('dabbir_whatsapp_operational_evidence', { p_business_id: BUSINESS_ID }, { timeoutMs: 12 }),
    error => assertTimeout(error, 'WHATSAPP_SERVER_DATA_TIMEOUT'),
  );
});

test('ordinary authorization failure remains authorization failure and is not remapped to timeout', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(
    requireBillingOwner(request(), BUSINESS_ID, { timeoutMs: 100 }),
    error => {
      assert.notEqual(error?.code, 504);
      assert.equal(error?.code, 401);
      return true;
    },
  );
});

test('billing HTTP surfaces preserve 504 and WhatsApp status no longer catch-collapses initial Auth read', () => {
  for (const path of ['api/billing/status.js', 'api/billing/checkout.js', 'api/billing/portal.js']) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /504/);
  }
  const statusSource = fs.readFileSync('api/dabbir-whatsapp-status.js', 'utf8');
  assert.match(statusSource, /withServerReadTimeout/);
  assert.doesNotMatch(statusSource, /getVerifiedUser\(accessToken\)\.catch\(\(\)\s*=>\s*null\)/);
});
