import { json, readJsonBody } from '../_auth-core.js';
import {
  entitlementFromVerifiedNotification,
  persistAppleEntitlement,
  verifyAppleNotification,
} from '../_apple-iap-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });

  try {
    const body = await readJsonBody(req, 131072);
    const signedPayload = typeof body?.signedPayload === 'string' ? body.signedPayload.trim() : '';
    if (!signedPayload) return json(res, 400, { ok: false, error: 'APPLE_NOTIFICATION_SIGNED_PAYLOAD_REQUIRED' });

    const notification = await verifyAppleNotification(signedPayload);
    const entitlement = await entitlementFromVerifiedNotification(notification);
    const persisted = entitlement ? await persistAppleEntitlement(entitlement) : null;

    return json(res, 200, {
      ok: true,
      verified: true,
      processed: Boolean(persisted),
      notification_type: notification?.notificationType || null,
      subtype: notification?.subtype || null,
      environment: notification?.data?.environment || null,
      entitlement_status: persisted?.status || null,
    });
  } catch (error) {
    const status = Number(error?.code || error?.status || 503);
    const safeStatus = [400, 409, 413, 429, 503].includes(status) ? status : 503;
    return json(res, safeStatus, {
      ok: false,
      verified: false,
      error: String(error?.message || 'APPLE_NOTIFICATION_VERIFICATION_FAILED').slice(0, 120),
    });
  }
}
