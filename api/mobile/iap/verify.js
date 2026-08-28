import { accessTokenFromRequest, getVerifiedUser, json, readJsonBody } from '../../_auth-core.js';
import { persistAppleEntitlement, verifyAppleTransaction } from '../../_apple-iap-core.js';
import { requireNativeBearer } from '../_native-core.js';

function purchaseJws(purchase) {
  const candidate = purchase?.purchaseToken || purchase?.jwsRepresentationIos || purchase?.transactionJws || null;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireNativeBearer(req, res)) return;

  try {
    const token = accessTokenFromRequest(req);
    const user = token ? await getVerifiedUser(token).catch(() => null) : null;
    if (!user) return json(res, 401, { ok: false, verified: false, entitled: false, error: 'AUTH_REQUIRED' });

    const body = await readJsonBody(req, 65536);
    const jws = purchaseJws(body?.purchase);
    if (!jws) return json(res, 400, { ok: false, verified: false, entitled: false, error: 'APPLE_IAP_JWS_REQUIRED' });

    const entitlement = await verifyAppleTransaction(jws, user.id);
    const persisted = await persistAppleEntitlement(entitlement);
    const entitled = persisted.status === 'active' && new Date(persisted.expires_at).getTime() > Date.now();

    return json(res, 200, {
      ok: true,
      verified: true,
      entitled,
      source: 'APPLE_SIGNED_TRANSACTION_JWS',
      product_id: persisted.product_id,
      environment: persisted.environment,
      status: persisted.status,
      expires_at: persisted.expires_at,
      transaction_id: persisted.latest_transaction_id,
    });
  } catch (error) {
    const status = Number(error?.code || error?.status || 503);
    const safeStatus = [400, 401, 403, 409, 413, 429, 503].includes(status) ? status : 503;
    return json(res, safeStatus, {
      ok: false,
      verified: false,
      entitled: false,
      error: String(error?.message || 'APPLE_IAP_VERIFICATION_UNAVAILABLE').slice(0, 120),
    });
  }
}
