import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import {
  embeddedPlatformConfig,
  loadBusinessConnection,
  openAccessToken,
  ownerContext,
  removeBusinessConnection,
  unsubscribeWaba,
} from './_whatsapp-embedded-core.js';

export function verifiedDeletion(rows, businessId) {
  return Array.isArray(rows)
    && rows.length === 1
    && rows[0]
    && typeof rows[0] === 'object'
    && !Array.isArray(rows[0])
    && String(rows[0].business_id || '') === String(businessId);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req, 4096);
    const businessId = String(body?.business_id || '').trim();
    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });

    const owner = await ownerContext(req, businessId);
    const row = await loadBusinessConnection(owner.accessToken, businessId);
    if (!row) return json(res, 200, { ok: true, connected: false, already_disconnected: true });

    const platform = embeddedPlatformConfig();
    let remoteUnsubscribed = false;
    if (platform.appSecret && platform.encryptionSecret) {
      try {
        const token = openAccessToken(row, platform, businessId);
        remoteUnsubscribed = await unsubscribeWaba(platform, token, row.waba_id);
      } catch {
        remoteUnsubscribed = false;
      }
    }

    const deleted = await removeBusinessConnection(owner.accessToken, businessId);
    if (!verifiedDeletion(deleted, businessId)) {
      throw Object.assign(new Error('WHATSAPP_CONNECTION_DELETE_UNVERIFIED'), { status: 502 });
    }
    return json(res, 200, {
      ok: true,
      connected: false,
      remote_unsubscribed: remoteUnsubscribed,
      secrets_exposed: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json(res, [400, 401, 403, 409, 413, 429, 502, 503, 504].includes(status) ? status : 500, {
      ok: false,
      error: error?.message || 'WHATSAPP_DISCONNECT_FAILED',
    });
  }
}
