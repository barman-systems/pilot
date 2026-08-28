import { createSign } from 'node:crypto';

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/, '');
const CANONICAL_PACKAGE_NAME = 'com.barmansystems.dabbir';
const CANONICAL_PRODUCT_ID = 'com.barmansystems.dabbir.owner.subscription';
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedGoogleAccessToken = null;

function playError(message, code = 503) {
  return Object.assign(new Error(message), { code });
}

function packageName() {
  return String(process.env.DABBIR_ANDROID_PACKAGE || CANONICAL_PACKAGE_NAME).trim() || CANONICAL_PACKAGE_NAME;
}

function subscriptionProductId() {
  return String(process.env.DABBIR_ANDROID_SUBSCRIPTION_PRODUCT_ID || CANONICAL_PRODUCT_ID).trim() || CANONICAL_PRODUCT_ID;
}

function serviceRoleKey() {
  const value = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!value || value.startsWith('sb_publishable_')) throw playError('GOOGLE_PLAY_STORAGE_NOT_CONFIGURED', 503);
  return value;
}

function looksLikePrivateKey(value) {
  return String(value || '').includes(['BEGIN', 'PRIVATE', 'KEY'].join(' '));
}

function serviceAccountCredentials() {
  const base64 = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64 || '').trim();
  const plain = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  let raw = plain;
  if (base64) {
    try { raw = Buffer.from(base64, 'base64').toString('utf8'); }
    catch { throw playError('GOOGLE_PLAY_SERVICE_ACCOUNT_INVALID', 503); }
  }
  if (!raw) throw playError('GOOGLE_PLAY_SERVICE_ACCOUNT_NOT_CONFIGURED', 503);
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw playError('GOOGLE_PLAY_SERVICE_ACCOUNT_INVALID', 503); }
  const clientEmail = String(parsed?.client_email || '').trim();
  const privateKey = String(parsed?.private_key || '').trim();
  const tokenUri = String(parsed?.token_uri || 'https://oauth2.googleapis.com/token').trim();
  if (!clientEmail || !clientEmail.includes('@') || !looksLikePrivateKey(privateKey) || !/^https:\/\//i.test(tokenUri)) {
    throw playError('GOOGLE_PLAY_SERVICE_ACCOUNT_INVALID', 503);
  }
  return { clientEmail, privateKey, tokenUri };
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

async function googleAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleAccessToken?.token && cachedGoogleAccessToken.expiresAt > now + 60) return cachedGoogleAccessToken.token;

  const credentials = serviceAccountCredentials();
  const header = base64urlJson({ alg: 'RS256', typ: 'JWT' });
  const payload = base64urlJson({
    iss: credentials.clientEmail,
    scope: ANDROID_PUBLISHER_SCOPE,
    aud: credentials.tokenUri,
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = Buffer.from(signer.sign(credentials.privateKey)).toString('base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(credentials.tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const payloadResponse = await response.json().catch(() => null);
  const token = String(payloadResponse?.access_token || '').trim();
  const expiresIn = Number(payloadResponse?.expires_in || 0);
  if (!response.ok || !token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw playError('GOOGLE_PLAY_OAUTH_FAILED', 503);
  }
  cachedGoogleAccessToken = { token, expiresAt: now + Math.min(expiresIn, 3600) };
  return token;
}

function validPurchaseToken(value) {
  const token = String(value || '').trim();
  if (token.length < 16 || token.length > 8192 || /[\u0000-\u001f\u007f]/.test(token)) throw playError('GOOGLE_PLAY_PURCHASE_TOKEN_INVALID', 400);
  return token;
}

async function googlePublisher(path, options = {}) {
  const accessToken = await googleAccessToken();
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${accessToken}`);
  headers.set('accept', 'application/json');
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/${path}`, {
    ...options,
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const status = Number(response.status || 503);
    const permanent = status === 400 || status === 404 || status === 410;
    const error = playError(permanent ? 'GOOGLE_PLAY_PURCHASE_NOT_VERIFIED' : 'GOOGLE_PLAY_API_UNAVAILABLE', permanent ? 409 : 503);
    error.cause = text.slice(0, 500);
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function normalizeStatus(subscriptionState, expiresAt) {
  const future = expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now();
  const state = String(subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED');
  const statusMap = {
    SUBSCRIPTION_STATE_ACTIVE: 'active',
    SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
    SUBSCRIPTION_STATE_CANCELED: 'canceled',
    SUBSCRIPTION_STATE_PENDING: 'pending',
    SUBSCRIPTION_STATE_PAUSED: 'paused',
    SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
    SUBSCRIPTION_STATE_EXPIRED: 'expired',
    SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
  };
  const status = statusMap[state] || 'pending';
  const entitled = future && ['active', 'grace', 'canceled'].includes(status);
  return { status, entitled };
}

function parseSubscription(payload, purchaseToken, userId) {
  const expectedProductId = subscriptionProductId();
  const lineItems = Array.isArray(payload?.lineItems) ? payload.lineItems : [];
  const item = lineItems.find(value => String(value?.productId || '') === expectedProductId) || null;
  if (!item) throw playError('GOOGLE_PLAY_PRODUCT_MISMATCH', 409);

  const externalId = String(payload?.externalAccountIdentifiers?.obfuscatedExternalAccountId || '').trim();
  if (!UUID_RE.test(userId) || externalId.toLowerCase() !== userId.toLowerCase()) {
    throw playError('GOOGLE_PLAY_ACCOUNT_MISMATCH', 403);
  }

  const expiresAt = item?.expiryTime ? new Date(item.expiryTime) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) throw playError('GOOGLE_PLAY_EXPIRY_MISSING', 409);
  const { status, entitled } = normalizeStatus(payload?.subscriptionState, expiresAt);
  const autoRenewEnabled = Boolean(item?.autoRenewingPlan?.autoRenewEnabled);
  const acknowledgementState = String(payload?.acknowledgementState || 'ACKNOWLEDGEMENT_STATE_UNSPECIFIED');
  const environment = payload?.testPurchase ? 'Test' : 'Production';

  return {
    user_id: userId,
    package_name: packageName(),
    product_id: expectedProductId,
    purchase_token: purchaseToken,
    order_id: item?.latestSuccessfulOrderId ? String(item.latestSuccessfulOrderId).slice(0, 128) : null,
    subscription_state: String(payload?.subscriptionState || '').slice(0, 80),
    status,
    acknowledgement_state: acknowledgementState.slice(0, 80),
    auto_renew_enabled: autoRenewEnabled,
    start_at: payload?.startTime || null,
    expires_at: expiresAt.toISOString(),
    region_code: payload?.regionCode ? String(payload.regionCode).slice(0, 8) : null,
    environment,
    verified_at: new Date().toISOString(),
    entitled,
  };
}

export async function verifyGoogleSubscription(purchaseTokenValue, userId) {
  const purchaseToken = validPurchaseToken(purchaseTokenValue);
  if (!UUID_RE.test(String(userId || ''))) throw playError('GOOGLE_PLAY_USER_INVALID', 400);
  const payload = await googlePublisher(
    `applications/${encodeURIComponent(packageName())}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  );
  return parseSubscription(payload, purchaseToken, String(userId));
}

export async function persistGoogleEntitlement(entitlement) {
  const key = serviceRoleKey();
  const persisted = { ...entitlement };
  delete persisted.entitled;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/dabbir_google_entitlements?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json',
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(persisted),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let rows = null;
  try { rows = text ? JSON.parse(text) : null; } catch { rows = null; }
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!response.ok || !row?.user_id || row.user_id !== entitlement.user_id) throw playError('GOOGLE_PLAY_ENTITLEMENT_PERSIST_FAILED', 503);
  return { ...row, entitled: entitlement.entitled };
}

export async function loadGoogleEntitlement(userId, { refresh = true } = {}) {
  if (!UUID_RE.test(String(userId || ''))) throw playError('GOOGLE_PLAY_USER_INVALID', 400);
  const key = serviceRoleKey();
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/dabbir_google_entitlements?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    {
      headers: { apikey: key, authorization: `Bearer ${key}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw playError('GOOGLE_PLAY_ENTITLEMENT_STATUS_UNAVAILABLE', 503);
  const rows = await response.json().catch(() => null);
  const row = Array.isArray(rows) ? rows[0] || null : null;
  if (!row) return null;

  if (refresh && row.purchase_token) {
    try {
      const verified = await verifyGoogleSubscription(row.purchase_token, String(userId));
      return persistGoogleEntitlement(verified);
    } catch (error) {
      if (Number(error?.code || 0) !== 503) throw error;
      const verifiedAt = row.verified_at ? new Date(row.verified_at).getTime() : 0;
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
      const freshEnough = Number.isFinite(verifiedAt) && Date.now() - verifiedAt <= 6 * 60 * 60 * 1000;
      const cachedEntitled = freshEnough && expiresAt > Date.now() && ['active', 'grace', 'canceled'].includes(String(row.status || ''));
      if (!cachedEntitled) throw error;
      return { ...row, entitled: true, cached: true };
    }
  }

  const entitled = Boolean(row.expires_at && new Date(row.expires_at).getTime() > Date.now() && ['active', 'grace', 'canceled'].includes(String(row.status || '')));
  return { ...row, entitled };
}
