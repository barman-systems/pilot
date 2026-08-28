import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withServerReadTimeout } from '../api/_server-read-timeout.js';
import { getBillingAccount, requireBillingOwner } from '../api/_billing-core.js';
import { loadBusinessConnection, ownerContext } from '../api/_whatsapp-embedded-core.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const BUSINESS_ID = '00000000-0000-4000-8000-000000000111';
const ACCESS_TOKEN = 'test-access-token';
const requestWithToken = () => ({ headers: { cookie: `__Host-dabbir_access=${ACCESS_TOKEN}` } });

const billingCore = await read('api/_billing-core.js');
const billingStatus = await read('api/billing/status.js');
const billingCheckout = await read('api/billing/checkout.js');
const billingPortal = await read('api/billing/portal.js');
const whatsappEmbedded = await read('api/_whatsapp-embedded-core.js');
const whatsappLive = await read('api/_whatsapp-live-core.js');
const whatsappStatus = await read('api/dabbir-whatsapp-status.js');
const whatsappReply = await read('api/dabbir-whatsapp-reply.js');

function hangingFetch(_url, options = {}) {
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

test('shared server-read timeout fails closed even when an operation never settles', async () => {
  const started = Date.now();
  await assert.rejects(
    withServerReadTimeout(() => new Promise(() => {}), { label: 'TEST_READ', timeoutMs: 5 }),
    error => {
      assert.equal(error.status, 504);
      assert.equal(error.code, 504);
      assert.equal(error.safeCode, 'TEST_READ_TIMEOUT');
      assert.equal(error.failureClass, 'TIMEOUT');
      return true;
    },
  );
  assert.ok(Date.now() - started < 500, 'timeout helper must not wait for the underlying hung operation');
});

test('shared server-read timeout propagates an AbortSignal to cooperative fetches', async () => {
  let receivedSignal = null;
  await assert.rejects(
    withServerReadTimeout(signal => new Promise((resolve, reject) => {
      receivedSignal = signal;
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }), { label: 'COOPERATIVE_READ', timeoutMs: 5 }),
    error => error?.status === 504 && error?.safeCode === 'COOPERATIVE_READ_TIMEOUT',
  );
  assert.equal(receivedSignal?.aborted, true);
});

test('critical Billing and WhatsApp core functions return explicit 504 on stalled prerequisite reads', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = hangingFetch;

  await assert.rejects(
    requireBillingOwner(requestWithToken(), BUSINESS_ID, { timeoutMs: 5 }),
    error => error?.status === 504 && error?.safeCode === 'BILLING_AUTH_DATA_TIMEOUT' && error?.timeout === true,
  );
  await assert.rejects(
    getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 5 }),
    error => error?.status === 504 && error?.safeCode === 'BILLING_STATUS_TIMEOUT' && error?.timeout === true,
  );
  await assert.rejects(
    ownerContext(requestWithToken(), BUSINESS_ID, { timeoutMs: 5 }),
    error => error?.status === 504 && error?.safeCode === 'WHATSAPP_AUTH_DATA_TIMEOUT' && error?.timeout === true,
  );
  await assert.rejects(
    loadBusinessConnection(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 5 }),
    error => error?.status === 504 && error?.safeCode === 'WHATSAPP_CONNECTION_READ_TIMEOUT' && error?.timeout === true,
  );
});

test('WhatsApp connection storage failure is not converted into an unlinked tenant', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'temporary database failure' }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });

  await assert.rejects(
    loadBusinessConnection(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 25 }),
    error => error?.status === 502
      && error?.message === 'WHATSAPP_CONNECTION_READ_FAILED'
      && error?.providerStatus === 503,
  );
});

test('real authentication rejection remains auth failure instead of being relabeled timeout', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });

  await assert.rejects(
    requireBillingOwner(requestWithToken(), BUSINESS_ID, { timeoutMs: 25 }),
    error => error?.code === 401 && error?.timeout !== true,
  );
});

test('billing auth and account reads are bounded without weakening bearer RLS', () => {
  assert.match(billingCore, /withServerReadTimeout/);
  assert.match(billingCore, /getVerifiedUser\(accessToken,\{signal\}\)/);
  assert.match(billingCore, /getBusinessMemberships\(accessToken,\{signal\}\)/);
  assert.match(billingCore, /supabaseRest\(`dabbir_billing_accounts[\s\S]*accessToken,\{signal\}\)/);
  assert.doesNotMatch(billingCore, /getBusinessMemberships\(accessToken\)\.catch\(\(\)=>\[\]\)/);
  assert.match(billingStatus, /503,504/);
  assert.match(billingCheckout, /503,504/);
  assert.match(billingPortal, /503,504/);
});

test('WhatsApp owner, connection and service-role persistence reads are bounded', () => {
  assert.match(whatsappEmbedded, /withServerReadTimeout/);
  assert.match(whatsappEmbedded, /getVerifiedUser\(accessToken, \{ signal \}\)/);
  assert.match(whatsappEmbedded, /getBusinessMemberships\(accessToken, \{ signal \}\)/);
  for (const label of [
    'WHATSAPP_OWNER_CONTEXT_READ',
    'WHATSAPP_CONNECTION_ROTATION_WRITE',
    'WHATSAPP_CONNECTION_READ',
    'WHATSAPP_CONNECTION_STORE',
    'WHATSAPP_CONNECTION_DELETE',
  ]) assert.match(whatsappEmbedded, new RegExp(label));
  assert.match(whatsappLive, /WHATSAPP_SERVER_RPC/);
  assert.match(whatsappLive, /signal => fetch/);
  assert.doesNotMatch(whatsappEmbedded, /getVerifiedUser\(accessToken\)\.catch\(\(\) => null\)/);
  assert.doesNotMatch(whatsappEmbedded, /getBusinessMemberships\(accessToken\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(whatsappEmbedded, /if \(!response\.ok\) return null/);
});

test('WhatsApp status and provider-accepted readback preserve timeout truth', () => {
  assert.match(whatsappStatus, /WHATSAPP_STATUS_AUTH_READ/);
  assert.match(whatsappStatus, /WHATSAPP_STATUS_MEMBERSHIP_READ/);
  assert.match(whatsappStatus, /getVerifiedUser\(accessToken, \{ signal \}\)/);
  assert.match(whatsappStatus, /getBusinessMemberships\(accessToken, \{ signal \}\)/);
  assert.doesNotMatch(whatsappStatus, /getVerifiedUser\(accessToken\)\.catch\(\(\) => null\)/);
  assert.match(whatsappReply, /WHATSAPP_REPLY_READBACK/);
  assert.match(whatsappReply, /supabaseRest\([\s\S]*\{ signal \}/);
  assert.match(whatsappReply, /502, 503, 504/);
  assert.match(whatsappReply, /AMBIGUOUS_NO_AUTOMATIC_RESEND/);
});
