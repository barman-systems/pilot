import test from 'node:test';
import assert from 'node:assert/strict';
import { getBillingAccount } from '../api/_billing-core.js';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000111';
const ACCESS_TOKEN = 'test-access-token';

function responseText(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  };
}

test('malformed successful Billing account JSON fails closed instead of becoming not_subscribed', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => responseText('not-json', 200);

  await assert.rejects(
    getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 50 }),
    error => {
      assert.equal(error?.message, 'BILLING_STATUS_UNAVAILABLE_INVALID_RESPONSE');
      assert.equal(error?.code, 502);
      return true;
    },
  );
});

test('successful Billing account payload must be an array', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => responseText(JSON.stringify({ status: 'active' }), 200);

  await assert.rejects(
    getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 50 }),
    error => {
      assert.equal(error?.message, 'BILLING_STATUS_INVALID_RESPONSE');
      assert.equal(error?.code, 502);
      return true;
    },
  );
});

test('empty successful Billing account array remains the only not-subscribed shape', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => responseText('[]', 200);

  const account = await getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 50 });
  assert.equal(account, null);
});
