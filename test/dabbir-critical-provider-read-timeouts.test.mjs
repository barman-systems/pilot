import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withServerReadTimeout } from '../api/_server-read-timeout.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const billingCore = await read('api/_billing-core.js');
const billingStatus = await read('api/billing/status.js');
const billingCheckout = await read('api/billing/checkout.js');
const billingPortal = await read('api/billing/portal.js');
const whatsappEmbedded = await read('api/_whatsapp-embedded-core.js');
const whatsappLive = await read('api/_whatsapp-live-core.js');
const whatsappStatus = await read('api/dabbir-whatsapp-status.js');
const whatsappReply = await read('api/dabbir-whatsapp-reply.js');

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
