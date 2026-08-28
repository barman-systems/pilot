import test from 'node:test';
import assert from 'node:assert/strict';
import { getBillingAccount } from '../api/_billing-core.js';
import { loadBusinessConnection } from '../api/_whatsapp-embedded-core.js';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000111';
const ACCESS_TOKEN = 'test-access-token';

function malformedSuccess() {
  return Promise.resolve(new Response('{not-valid-json', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
}

test('Billing malformed HTTP 200 cannot masquerade as not_subscribed', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = malformedSuccess;

  await assert.rejects(
    getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 100 }),
    error => {
      assert.equal(error?.code, 502);
      assert.equal(error?.message, 'BILLING_STATUS_UNAVAILABLE_INVALID_RESPONSE');
      return true;
    },
  );
});

test('WhatsApp malformed HTTP 200 cannot masquerade as an unlinked tenant', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = malformedSuccess;

  await assert.rejects(
    loadBusinessConnection(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 100 }),
    error => {
      assert.equal(error?.status, 502);
      assert.equal(error?.message, 'WHATSAPP_CONNECTION_RESPONSE_MALFORMED');
      assert.equal(error?.providerStatus, 200);
      return true;
    },
  );
});
