import test from 'node:test';
import assert from 'node:assert/strict';
import { getBillingAccount } from '../api/_billing-core.js';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000111';
const OTHER_BUSINESS_ID = '00000000-0000-4000-8000-000000000222';
const ACCESS_TOKEN = 'test-access-token';

function responseText(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  };
}

async function expectInvalid(payload) {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => responseText(JSON.stringify(payload), 200);
    await assert.rejects(getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 50 }), error => {
      assert.equal(error?.message, 'BILLING_STATUS_INVALID_RESPONSE');
      assert.equal(error?.code, 502);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('malformed successful Billing account JSON fails closed instead of becoming not_subscribed', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => responseText('not-json', 200);

  await assert.rejects(getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 50 }), error => {
    assert.equal(error?.message, 'BILLING_STATUS_UNAVAILABLE_INVALID_RESPONSE');
    assert.equal(error?.code, 502);
    return true;
  });
});

test('successful Billing account payload must be an array', async () => {
  await expectInvalid({ status: 'active' });
});

test('nonempty Billing arrays reject null rows and wrong-business rows', async () => {
  await expectInvalid([null]);
  await expectInvalid([{ business_id: OTHER_BUSINESS_ID, status: 'active' }]);
});

test('empty successful Billing account array remains the only not-subscribed shape', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => responseText('[]', 200);

  const account = await getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 50 });
  assert.equal(account, null);
});

test('one matching Billing account object is accepted', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const expected = { business_id: BUSINESS_ID, status: 'active' };
  globalThis.fetch = async () => responseText(JSON.stringify([expected]), 200);

  const account = await getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 50 });
  assert.deepEqual(account, expected);
});
