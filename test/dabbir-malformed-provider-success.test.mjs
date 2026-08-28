import test from 'node:test';
import assert from 'node:assert/strict';
import { getBillingAccount } from '../api/_billing-core.js';
import { loadBusinessConnection, upsertBusinessConnection } from '../api/_whatsapp-embedded-core.js';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000111';
const OTHER_BUSINESS_ID = '00000000-0000-4000-8000-000000000222';
const ACCESS_TOKEN = 'test-access-token';

function jsonResponse(body) {
  return Promise.resolve(new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
}

function malformedSuccess() {
  return jsonResponse('{not-valid-json');
}

async function withFetch(t, fetchImpl, operation) {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = fetchImpl;
  return operation();
}

test('Billing malformed HTTP 200 cannot masquerade as not_subscribed', async t => {
  await withFetch(t, malformedSuccess, async () => {
    await assert.rejects(
      getBillingAccount(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 100 }),
      error => {
        assert.equal(error?.code, 502);
        assert.equal(error?.message, 'BILLING_STATUS_UNAVAILABLE_INVALID_RESPONSE');
        return true;
      },
    );
  });
});

test('WhatsApp malformed HTTP 200 cannot masquerade as an unlinked tenant', async t => {
  await withFetch(t, malformedSuccess, async () => {
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
});

test('WhatsApp empty HTTP 200 body cannot masquerade as an unlinked tenant', async t => {
  await withFetch(t, () => jsonResponse(''), async () => {
    await assert.rejects(
      loadBusinessConnection(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 100 }),
      error => error?.status === 502 && error?.message === 'WHATSAPP_CONNECTION_RESPONSE_MALFORMED',
    );
  });
});

test('WhatsApp [] remains the only valid unlinked storage shape', async t => {
  await withFetch(t, () => jsonResponse('[]'), async () => {
    const connection = await loadBusinessConnection(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 100 });
    assert.equal(connection, null);
  });
});

test('WhatsApp connection read rejects null, multiple or wrong-tenant rows', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = () => jsonResponse('[null]');
  await assert.rejects(
    loadBusinessConnection(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 100 }),
    error => error?.message === 'WHATSAPP_CONNECTION_RESPONSE_MALFORMED',
  );

  globalThis.fetch = () => jsonResponse(JSON.stringify([
    { business_id: BUSINESS_ID, status: 'connected' },
    { business_id: BUSINESS_ID, status: 'connected' },
  ]));
  await assert.rejects(
    loadBusinessConnection(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 100 }),
    error => error?.message === 'WHATSAPP_CONNECTION_RESPONSE_MALFORMED',
  );

  globalThis.fetch = () => jsonResponse(JSON.stringify([
    { business_id: OTHER_BUSINESS_ID, status: 'connected' },
  ]));
  await assert.rejects(
    loadBusinessConnection(ACCESS_TOKEN, BUSINESS_ID, { timeoutMs: 100 }),
    error => error?.message === 'WHATSAPP_CONNECTION_RESPONSE_MALFORMED',
  );
});

test('WhatsApp store requires one valid matching returned row proving the tenant write', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  for (const payload of [
    '[]',
    '[null]',
    JSON.stringify([{ business_id: OTHER_BUSINESS_ID, status: 'connected' }]),
  ]) {
    globalThis.fetch = () => jsonResponse(payload);
    await assert.rejects(
      upsertBusinessConnection(ACCESS_TOKEN, { business_id: BUSINESS_ID, status: 'connected' }, { timeoutMs: 100 }),
      error => error?.status === 502 && error?.message === 'WHATSAPP_CONNECTION_STORE_RESPONSE_MALFORMED',
    );
  }
});
