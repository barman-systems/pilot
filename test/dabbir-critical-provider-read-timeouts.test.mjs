import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withServerReadTimeout } from '../api/_server-read-timeout.js';
import { getBillingAccount, requireBillingOwner } from '../api/_billing-core.js';
import { loadBusinessConnection, ownerContext } from '../api/_whatsapp-embedded-core.js';
import { serviceRpc } from '../api/_whatsapp-live-core.js';
import { readPersistedMessage } from '../api/dabbir-whatsapp-reply.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const BUSINESS_ID = '00000000-0000-4000-8000-000000000111';
const MESSAGE_ID = '00000000-0000-4000-8000-000000000222';
const ACCESS_TOKEN = 'test-access-token';
const SERVICE_ROLE_ENV = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_');
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

function headersThenStalledBody() {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => new Promise(() => {}),
    json: () => new Promise(() => {}),
  });
}

function assertTimeout(error, code) {
  assert.equal(error?.message, code);
  assert.equal(error?.status, 504);
  assert.equal(error?.code, 504);
  assert.equal(error?.safeCode, code);
  assert.equal(error?.errorCode, code);
  assert.equal(error?.failureClass, 'TIMEOUT');
  assert.equal(error?.timeout, true);
  return true;
}

test('shared server-read timeout is a hard wall-clock guard even when operation never settles', async () => {
  const started = Date.now();
  await assert.rejects(
    withServerReadTimeout(() => new Promise(() => {}), { errorCode: 'HARD_WALL_TIMEOUT', timeoutMs: 5 }),
    error => assertTimeout(error, 'HARD_WALL_TIMEOUT'),
  );
  assert.ok(Date.now() - started < 500, 'timeout helper must not wait for the underlying hung operation');
});

test('shared server-read timeout propagates an AbortSignal to cooperative fetches', async () => {
  let receivedSignal = null;
  await assert.rejects(
    withServerReadTimeout(signal => new Promise((_resolve, reject) => {
      receivedSignal = signal;
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }), { errorCode: 'COOPERATIVE_READ_TIMEOUT', timeoutMs: 5 }),
    error => assertTimeout(error, 'COOPERATIVE_READ_TIMEOUT'),
  );
  assert.equal(receivedSignal?.aborted, true);
});

test('an unrelated AbortError is not falsely relabeled as DABBIR timeout', async () => {
  await assert.rejects(
    withServerReadTimeout(() => Promise.reject(Object.assign(new Error('UPSTREAM_ABORT'), { name: 'AbortError' })), {
      errorCode: 'SHOULD_NOT_APPEAR', timeoutMs: 100,
    }),
    error => {
      assert.equal(error?.message, 'UPSTREAM_ABORT');
      assert.notEqual(error?.status, 504);
      return true;
    },
  );
});

test('critical Billing and WhatsApp core functions return explicit 504 on stalled prerequisite reads', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = hangingFetch;

  await assert.rejects(
    requireBillingOwner(requestWithToken(), BUSINESS_ID, { timeoutMs: 5 }),
    error => assertTimeout(error, 'BILLING_AUTH_DATA_TIMEOUT'),
  );
  await assert.rejects(
    getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 5 }),
    error => assertTimeout(error, 'BILLING_STATUS_TIMEOUT'),
  );
  await assert.rejects(
    ownerContext(requestWithToken(), BUSINESS_ID, { timeoutMs: 5 }),
    error => assertTimeout(error, 'WHATSAPP_AUTH_DATA_TIMEOUT'),
  );
  await assert.rejects(
    loadBusinessConnection(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 5 }),
    error => assertTimeout(error, 'WHATSAPP_CONNECTION_READ_TIMEOUT'),
  );
});

test('deadlines remain active after headers while Billing and WhatsApp bodies are still pending', async t => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env[SERVICE_ROLE_ENV];
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env[SERVICE_ROLE_ENV];
    else process.env[SERVICE_ROLE_ENV] = originalKey;
  });
  process.env[SERVICE_ROLE_ENV] = 'test-service-role-key';
  globalThis.fetch = headersThenStalledBody;

  await assert.rejects(
    getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 5 }),
    error => assertTimeout(error, 'BILLING_STATUS_TIMEOUT'),
  );
  await assert.rejects(
    serviceRpc('dabbir_whatsapp_operational_evidence', { p_business_id: BUSINESS_ID }, { timeoutMs: 5 }),
    error => assertTimeout(error, 'WHATSAPP_SERVER_DATA_TIMEOUT'),
  );
  await assert.rejects(
    readPersistedMessage(ACCESS_TOKEN, BUSINESS_ID, MESSAGE_ID, { timeoutMs: 5 }),
    error => assertTimeout(error, 'WHATSAPP_REPLY_READBACK_TIMEOUT'),
  );
});

test('WhatsApp service-role persistence RPC reports explicit 504 timeout without changing server authority', async t => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env[SERVICE_ROLE_ENV];
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env[SERVICE_ROLE_ENV];
    else process.env[SERVICE_ROLE_ENV] = originalKey;
  });
  process.env[SERVICE_ROLE_ENV] = 'test-service-role-key';
  globalThis.fetch = hangingFetch;

  await assert.rejects(
    serviceRpc('dabbir_whatsapp_operational_evidence', { p_business_id: BUSINESS_ID }, { timeoutMs: 5 }),
    error => assertTimeout(error, 'WHATSAPP_SERVER_DATA_TIMEOUT'),
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
  assert.match(whatsappLive, /WHATSAPP_SERVER_DATA_TIMEOUT/);
  assert.match(whatsappLive, /authorization: `Bearer \$\{key\}`/);
  assert.match(whatsappLive, /async signal =>/);
  assert.match(whatsappLive, /return readResponse\(response, 'WHATSAPP_SERVER_RPC_FAILED'\)/);
  assert.doesNotMatch(whatsappEmbedded, /getVerifiedUser\(accessToken\)\.catch\(\(\) => null\)/);
  assert.doesNotMatch(whatsappEmbedded, /getBusinessMemberships\(accessToken\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(whatsappEmbedded, /if \(!response\.ok\) return null/);
});

test('WhatsApp status and provider-accepted replay preserve timeout truth and no-resend semantics', () => {
  assert.match(whatsappStatus, /WHATSAPP_STATUS_AUTH_READ/);
  assert.match(whatsappStatus, /WHATSAPP_STATUS_MEMBERSHIP_READ/);
  assert.match(whatsappStatus, /getVerifiedUser\(accessToken, \{ signal \}\)/);
  assert.match(whatsappStatus, /getBusinessMemberships\(accessToken, \{ signal \}\)/);
  assert.doesNotMatch(whatsappStatus, /getVerifiedUser\(accessToken\)\.catch\(\(\) => null\)/);
  assert.match(whatsappReply, /WHATSAPP_REPLY_READBACK_TIMEOUT/);
  assert.match(whatsappReply, /async signal =>/);
  assert.match(whatsappReply, /providerAccepted = true;[\s\S]*readPersistedMessage/);
  assert.match(whatsappReply, /error\.providerAccepted = true;[\s\S]*error\.ambiguous = true/);
  assert.match(whatsappReply, /retry_safe_with_same_key: true/);
  assert.match(whatsappReply, /AMBIGUOUS_NO_AUTOMATIC_RESEND/);
  assert.match(whatsappReply, /reserveOutboundReply/);
  assert.match(whatsappReply, /sendMetaText/);
  assert.match(whatsappReply, /finalizeOutboundReply/);
  assert.match(whatsappReply, /automatic_resend_blocked/);
});
