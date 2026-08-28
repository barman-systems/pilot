import { accessTokenFromRequest, getVerifiedUser, json, readJsonBody } from '../../_auth-core.js';
import { persistAppleEntitlement, verifyAppleTransaction } from '../../_apple-iap-core.js';
import { persistGoogleEntitlement, verifyGoogleSubscription } from '../../_google-play-iap-core.js';
import { requireNativeBearer } from '../_native-core.js';

function applePurchaseJws(purchase) {
  const candidate = purchase?.purchaseToken || purchase?.jwsRepresentationIos || purchase?.transactionJws || null;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function googlePurchaseToken(purchase) {
  const candidate = purchase?.purchaseToken || purchase?.purchaseTokenAndroid || null;
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
    const platform = String(body?.platform || 'ios').trim().toLowerCase();

    if (platform === 'android') {
      const purchaseToken = googlePurchaseToken(body?.purchase);
      if (!purchaseToken) return json(res, 400, { ok: false, verified: false, entitled: false, error: 'GOOGLE_PLAY_PURCHASE_TOKEN_REQUIRED' });

      const entitlement = await verifyGoogleSubscription(purchaseToken, user.id);
      const persisted = await persistGoogleEntitlement(entitlement);
      return json(res, 200, {
        ok: true,
        verified: true,
        entitled: persisted.entitled === true,
        source: 'GOOGLE_PLAY_DEVELOPER_API',
        product_id: persisted.product_id,
        environment: persisted.environment,
        status: persisted.status,
        expires_at: persisted.expires_at,
        order_id: persisted.order_id,
        acknowledgement_state: persisted.acknowledgement_state,
      });
    }

    if (platform !== 'ios') return json(res, 400, { ok: false, verified: false, entitled: false, error: 'UNSUPPORTED_PURCHASE_PLATFORM' });

    const jws = applePurchaseJws(body?.purchase);
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
      error: String(error?.message || 'STORE_PURCHASE_VERIFICATION_UNAVAILABLE').slice(0, 120),
    });
  }
}
