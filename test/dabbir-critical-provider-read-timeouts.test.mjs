import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  requireBillingOwner,
  getBillingAccount,
} from '../api/_billing-core.js';
import {
  loadBusinessConnection,
  ownerContext,
} from '../api/_whatsapp-embedded-core.js';
import { serviceRpc } from '../api/_whatsapp-live-core.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [
  timeoutCore,
  billingCore,
  billingStatus,
  billingCheckout,
  billingPortal,
  whatsappEmbedded,
  whatsappLive,
  whatsappStatus,
  whatsappReply,
] = await Promise.all([
  read('api/_server-read-timeout.js'),
  read('api/_billing-core.js'),
  read('api/billing/status.js'),
  read('api/billing/checkout.js'),
  read('api/billing/portal.js'),
  read('api/_whatsapp-embedded-core.js'),
  read('api/_whatsapp-live-core.js'),
  read('api/dabbir-whatsapp-status.js'),
  read('api/dabbir-whatsapp-reply.js'),
]);

const BUSINESS_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_ROLE_ENV = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_');
const originalFetch = global.fetch;
const originalSupabaseKey = process.env[SERVICE_ROLE_ENV];

function response(body, init = {}) {
  const normalized = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(normalized, {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

function requestWithToken() {
  return { headers: { cookie: '__Host-dabbir_access=test-token' } };
}

function mockUserAndMemberships({ membershipDelay = 0, membershipResponse = [{ business_id: BUSINESS_ID, role: 'owner', status: 'active' }] } = {}) {
  global.fetch = async (url, options = {}) => {
    const text = String(url);
    if (text.includes('/auth/v1/user')) return response({ id: USER_ID, app_metadata: { product: 'DABBIR' } });
    if (text.includes('/rest/v1/account_access_state')) return response([{ user_id: USER_ID, status: 'active' }]);
    if (text.includes('/rest/v1/dabbir_memberships')) {
      if (membershipDelay) await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, membershipDelay);
        options.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
      });
      return response(membershipResponse);
    }
    throw new Error(`UNEXPECTED_FETCH:${text}`);
  };
}

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalSupabaseKey === undefined) delete process.env[SERVICE_ROLE_ENV];
  else process.env[SERVICE_ROLE_ENV] = originalSupabaseKey;
});

test('shared server-read timeout is a hard wall-clock guard even when operation never settles', async () => {
  const { withServerReadTimeout } = await import('../api/_server-read-timeout.js');
  const started = Date.now();
  await assert.rejects(
    withServerReadTimeout(() => new Promise(() => {}), { label: 'TEST', timeoutMs: 5 }),
    error => error?.code === 504 && error?.timeout === true,
  );
  assert.ok(Date.now() - started < 250);
});

test('shared server-read timeout propagates an AbortSignal to cooperative fetches', async () => {
  const { withServerReadTimeout } = await import('../api/_server-read-timeout.js');
  let seenSignal = null;
  await assert.rejects(
    withServerReadTimeout(signal => {
      seenSignal = signal;
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
    }, { label: 'TEST_ABORT', timeoutMs: 5 }),
    error => error?.code === 504 && error?.timeout === true,
  );
  assert.ok(seenSignal instanceof AbortSignal);
  assert.equal(seenSignal.aborted, true);
});

test('an unrelated AbortError is not falsely relabeled as DABBIR timeout', async () => {
  const { withServerReadTimeout } = await import('../api/_server-read-timeout.js');
  await assert.rejects(
    withServerReadTimeout(() => Promise.reject(new DOMException('caller aborted', 'AbortError')), { label: 'TEST_CALLER', timeoutMs: 50 }),
    error => error?.name === 'AbortError' && error?.timeout !== true,
  );
});

test('critical Billing and WhatsApp core functions return explicit 504 on stalled prerequisite reads', async () => {
  mockUserAndMemberships({ membershipDelay: 100 });
  await assert.rejects(
    requireBillingOwner(requestWithToken(), BUSINESS_ID, { timeoutMs: 5 }),
    error => error?.code === 504 && error?.timeout === true,
  );

  mockUserAndMemberships({ membershipDelay: 100 });
  await assert.rejects(
    ownerContext(requestWithToken(), BUSINESS_ID, { timeoutMs: 5 }),
    error => error?.code === 504 && error?.timeout === true,
  );
});

test('deadlines remain active after headers while Billing and WhatsApp bodies are still pending', async () => {
  mockUserAndMemberships();
  global.fetch = async (url, options = {}) => {
    const text = String(url);
    if (text.includes('/auth/v1/user')) return response({ id: USER_ID, app_metadata: { product: 'DABBIR' } });
    if (text.includes('/rest/v1/account_access_state')) return response([{ user_id: USER_ID, status: 'active' }]);
    if (text.includes('/rest/v1/dabbir_memberships')) return response([{ business_id: BUSINESS_ID, role: 'owner', status: 'active' }]);
    if (text.includes('/rest/v1/dabbir_billing_accounts') || text.includes('/rest/v1/dabbir_whatsapp_connections')) {
      return new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`UNEXPECTED_FETCH:${text}`);
  };
  await assert.rejects(getBillingAccount('test-token', BUSINESS_ID, { timeoutMs: 5 }), error => error?.code === 504 && error?.timeout === true);
  await assert.rejects(loadBusinessConnection('test-token', BUSINESS_ID, { timeoutMs: 5 }), error => error?.code === 504 && error?.timeout === true);
});

test('WhatsApp service-role persistence RPC reports explicit 504 timeout without changing server authority', async () => {
  process.env[SERVICE_ROLE_ENV] = ['sb', 'secret', 'test'].join('_');
  global.fetch = async (_url, options = {}) => new Promise((resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
  await assert.rejects(
    serviceRpc('dabbir_whatsapp_persist_inbound', {}, { timeoutMs: 5 }),
    error => error?.code === 504 && error?.timeout === true,
  );
});

test('WhatsApp connection storage failure is not converted into an unlinked tenant', async () => {
  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes('/rest/v1/dabbir_whatsapp_connections')) return response({ message: 'storage failed' }, { status: 503 });
    throw new Error(`UNEXPECTED_FETCH:${text}`);
  };
  await assert.rejects(
    loadBusinessConnection('token', BUSINESS_ID, { timeoutMs: 50 }),
    error => error?.status === 502 && error?.code === 'WHATSAPP_CONNECTION_READ_FAILED' && error?.message === 'WHATSAPP_CONNECTION_READ_FAILED',
  );
});

test('real authentication rejection remains auth failure instead of being relabeled timeout', async () => {
  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes('/auth/v1/user')) return response({ message: 'invalid token' }, { status: 401 });
    if (text.includes('/rest/v1/dabbir_memberships')) return response([{ business_id: BUSINESS_ID, role: 'owner', status: 'active' }]);
    throw new Error(`UNEXPECTED_FETCH:${text}`);
  };
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
  assert.match(whatsappLive, /supabaseKeyHeaders\(key/);
  assert.doesNotMatch(whatsappLive, /authorization: `Bearer \$\{key\}`/);
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
  assert.match(whatsappReply, /AMBIGUOUS_NO_AUTOMATIC_RESEND/);
});

test('timeout helper source owns one AbortController and one timer per operation', () => {
  assert.match(timeoutCore, /new AbortController\(\)/);
  assert.match(timeoutCore, /setTimeout/);
  assert.match(timeoutCore, /controller\.abort\(\)/);
});
