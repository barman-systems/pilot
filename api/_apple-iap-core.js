import { Environment, SignedDataVerifier } from '@apple/app-store-server-library';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWS_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function appleError(message, code = 503) {
  return Object.assign(new Error(message), { code });
}

function requiredText(name, max = 4096) {
  const value = String(process.env[name] || '').trim();
  if (!value || value.length > max) throw appleError(`${name}_NOT_CONFIGURED`, 503);
  return value;
}

function serviceRoleKey() {
  const value = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!value || value.startsWith('sb_publishable_')) throw appleError('APPLE_IAP_STORAGE_NOT_CONFIGURED', 503);
  return value;
}

function rootCertificates() {
  const raw = requiredText('APPLE_ROOT_CERTIFICATES_BASE64', 65536);
  const values = raw.split(',').map(value => value.trim()).filter(Boolean);
  if (values.length < 2 || values.length > 6) throw appleError('APPLE_ROOT_CERTIFICATES_INVALID', 503);
  const certificates = values.map(value => Buffer.from(value, 'base64'));
  if (certificates.some(value => value.length < 300 || value.length > 8192)) throw appleError('APPLE_ROOT_CERTIFICATES_INVALID', 503);
  return certificates;
}

function productionAppAppleId() {
  const raw = String(process.env.DABBIR_IOS_APP_APPLE_ID || '').trim();
  if (!/^\d{5,20}$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function msDate(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedEnvironment(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'sandbox') return 'Sandbox';
  if (text === 'production') return 'Production';
  return null;
}

function validateJws(value, code = 'APPLE_IAP_JWS_INVALID') {
  const jws = String(value || '').trim();
  if (jws.length < 100 || jws.length > 65536 || !JWS_RE.test(jws)) throw appleError(code, 400);
  return jws;
}

function assertTransaction(decoded, userId, expectedProductId, expectedBundleId, now = new Date()) {
  const appAccountToken = String(decoded?.appAccountToken || '').trim();
  const productId = String(decoded?.productId || '').trim();
  const bundleId = String(decoded?.bundleId || '').trim();
  const transactionId = String(decoded?.transactionId || '').trim();
  const originalTransactionId = String(decoded?.originalTransactionId || '').trim();
  const environment = normalizedEnvironment(decoded?.environment);
  const expiresAt = msDate(decoded?.expiresDate);
  const purchasedAt = msDate(decoded?.purchaseDate);
  const revokedAt = msDate(decoded?.revocationDate);
  const signedAt = msDate(decoded?.signedDate);

  if (!UUID_RE.test(userId) || appAccountToken.toLowerCase() !== userId.toLowerCase()) throw appleError('APPLE_IAP_ACCOUNT_MISMATCH', 403);
  if (productId !== expectedProductId) throw appleError('APPLE_IAP_PRODUCT_MISMATCH', 409);
  if (bundleId !== expectedBundleId) throw appleError('APPLE_IAP_BUNDLE_MISMATCH', 409);
  if (!transactionId || transactionId.length > 128 || !originalTransactionId || originalTransactionId.length > 128) throw appleError('APPLE_IAP_TRANSACTION_ID_INVALID', 409);
  if (!environment) throw appleError('APPLE_IAP_ENVIRONMENT_INVALID', 409);
  if (!expiresAt) throw appleError('APPLE_IAP_SUBSCRIPTION_EXPIRY_MISSING', 409);

  const status = revokedAt ? 'revoked' : expiresAt.getTime() > now.getTime() ? 'active' : 'expired';
  return {
    user_id: userId,
    app_account_token: appAccountToken,
    bundle_id: bundleId,
    product_id: productId,
    original_transaction_id: originalTransactionId,
    latest_transaction_id: transactionId,
    environment,
    status,
    purchased_at: purchasedAt?.toISOString() || null,
    expires_at: expiresAt.toISOString(),
    revoked_at: revokedAt?.toISOString() || null,
    signed_at: signedAt?.toISOString() || null,
    storefront: decoded?.storefront ? String(decoded.storefront).slice(0, 16) : null,
    ownership_type: decoded?.inAppOwnershipType ? String(decoded.inAppOwnershipType).slice(0, 64) : null,
    transaction_reason: decoded?.transactionReason ? String(decoded.transactionReason).slice(0, 64) : null,
    verified_at: new Date().toISOString(),
  };
}

function verifierFor(environment, roots, bundleId) {
  const enableOnlineChecks = String(process.env.APPLE_IAP_ONLINE_CERT_CHECKS || 'true').toLowerCase() !== 'false';
  const appAppleId = environment === Environment.PRODUCTION ? productionAppAppleId() : undefined;
  if (environment === Environment.PRODUCTION && !appAppleId) throw appleError('DABBIR_IOS_APP_APPLE_ID_NOT_CONFIGURED', 503);
  return new SignedDataVerifier(roots, enableOnlineChecks, environment, bundleId, appAppleId);
}

async function verifyAcrossEnvironments(jws, method) {
  const bundleId = requiredText('DABBIR_IOS_BUNDLE_ID', 255);
  const roots = rootCertificates();
  let sandboxError = null;

  try {
    const verifier = verifierFor(Environment.SANDBOX, roots, bundleId);
    return await verifier[method](jws);
  } catch (error) {
    sandboxError = error;
  }

  try {
    const verifier = verifierFor(Environment.PRODUCTION, roots, bundleId);
    return await verifier[method](jws);
  } catch (error) {
    if (error?.message === 'DABBIR_IOS_APP_APPLE_ID_NOT_CONFIGURED') throw error;
    const result = appleError('APPLE_IAP_SIGNATURE_VERIFICATION_FAILED', 409);
    result.cause = error || sandboxError;
    throw result;
  }
}

async function verifiedTransactionPayload(jwsValue) {
  const jws = validateJws(jwsValue);
  return verifyAcrossEnvironments(jws, 'verifyAndDecodeTransaction');
}

export async function verifyAppleTransaction(jwsValue, userId) {
  if (!UUID_RE.test(String(userId || ''))) throw appleError('APPLE_IAP_USER_INVALID', 400);
  const decoded = await verifiedTransactionPayload(jwsValue);
  const bundleId = requiredText('DABBIR_IOS_BUNDLE_ID', 255);
  const productId = requiredText('DABBIR_IOS_SUBSCRIPTION_PRODUCT_ID', 255);
  return assertTransaction(decoded, String(userId), productId, bundleId);
}

export async function verifyAppleNotification(signedPayloadValue) {
  const signedPayload = validateJws(signedPayloadValue, 'APPLE_NOTIFICATION_JWS_INVALID');
  return verifyAcrossEnvironments(signedPayload, 'verifyAndDecodeNotification');
}

export async function entitlementFromVerifiedNotification(notification) {
  const transactionJws = notification?.data?.signedTransactionInfo;
  if (!transactionJws) return null;
  const decoded = await verifiedTransactionPayload(transactionJws);
  const userId = String(decoded?.appAccountToken || '').trim();
  if (!UUID_RE.test(userId)) throw appleError('APPLE_NOTIFICATION_ACCOUNT_TOKEN_INVALID', 409);
  const bundleId = requiredText('DABBIR_IOS_BUNDLE_ID', 255);
  const productId = requiredText('DABBIR_IOS_SUBSCRIPTION_PRODUCT_ID', 255);
  return assertTransaction(decoded, userId, productId, bundleId);
}

export async function persistAppleEntitlement(entitlement) {
  const key = serviceRoleKey();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/dabbir_apple_entitlements?on_conflict=user_id`, {
    method: 'POST',
    headers: supabaseKeyHeaders(key, {
      'content-type': 'application/json',
      accept: 'application/json',
      prefer: 'resolution=merge-duplicates,return=representation',
    }),
    body: JSON.stringify(entitlement),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let rows = null;
  try { rows = text ? JSON.parse(text) : null; } catch { rows = null; }
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!response.ok || !row?.user_id || row.user_id !== entitlement.user_id || row.latest_transaction_id !== entitlement.latest_transaction_id) {
    throw appleError('APPLE_IAP_ENTITLEMENT_PERSIST_FAILED', 503);
  }
  return row;
}
