import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = 'com.barmansystems.dabbir.owner.subscription';
const PACKAGE_NAME = 'com.barmansystems.dabbir';

function responseJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: 'dabbir-play-test@example.iam.gserviceaccount.com',
  private_key: privateKeyPem,
  token_uri: 'https://oauth2.googleapis.com/token',
});
process.env.DABBIR_ANDROID_PACKAGE = PACKAGE_NAME;
process.env.DABBIR_ANDROID_SUBSCRIPTION_PRODUCT_ID = PRODUCT_ID;

const { verifyGoogleSubscription } = await import('../api/_google-play-iap-core.js');

function activeSubscription(accountId = USER_ID, productId = PRODUCT_ID) {
  return {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId },
    regionCode: 'AE',
    startTime: new Date(Date.now() - 60_000).toISOString(),
    lineItems: [{
      productId,
      expiryTime: new Date(Date.now() + 86_400_000).toISOString(),
      latestSuccessfulOrderId: 'GPA.TEST-ORDER',
      autoRenewingPlan: { autoRenewEnabled: true },
    }],
  };
}

test('Google Play subscription is verified server-side and bound to DABBIR UUID', async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), authorization: new Headers(options.headers || {}).get('authorization') });
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return responseJson({ access_token: 'server-test-access-token', expires_in: 3600 });
    }
    if (String(url).includes('/purchases/subscriptionsv2/tokens/')) {
      return responseJson(activeSubscription());
    }
    throw new Error(`UNEXPECTED_FETCH:${url}`);
  };

  const entitlement = await verifyGoogleSubscription('purchase-token-1234567890', USER_ID);
  assert.equal(entitlement.user_id, USER_ID);
  assert.equal(entitlement.package_name, PACKAGE_NAME);
  assert.equal(entitlement.product_id, PRODUCT_ID);
  assert.equal(entitlement.status, 'active');
  assert.equal(entitlement.entitled, true);
  assert.equal(entitlement.region_code, 'AE');
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, new RegExp(`/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/`));
  assert.equal(calls[1].authorization, 'Bearer server-test-access-token');
});

test('Google Play verification rejects purchase bound to a different DABBIR account', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/purchases/subscriptionsv2/tokens/')) return responseJson(activeSubscription(OTHER_USER_ID));
    throw new Error(`UNEXPECTED_FETCH:${url}`);
  };

  await assert.rejects(
    () => verifyGoogleSubscription('purchase-token-account-mismatch', USER_ID),
    error => error?.message === 'GOOGLE_PLAY_ACCOUNT_MISMATCH' && error?.code === 403,
  );
});

test('Google Play verification rejects a different subscription product', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/purchases/subscriptionsv2/tokens/')) return responseJson(activeSubscription(USER_ID, 'other.product'));
    throw new Error(`UNEXPECTED_FETCH:${url}`);
  };

  await assert.rejects(
    () => verifyGoogleSubscription('purchase-token-product-mismatch', USER_ID),
    error => error?.message === 'GOOGLE_PLAY_PRODUCT_MISMATCH' && error?.code === 409,
  );
});
