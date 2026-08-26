import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import {
  embeddedPlatformConfig,
  loadBusinessConnection,
  openAccessToken,
  ownerContext,
  removeBusinessConnection,
  unsubscribeWaba,
} from './_whatsapp-embedded-core.js';

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

    await removeBusinessConnection(owner.accessToken, businessId);
    return json(res, 200, {
      ok: true,
      connected: false,
      remote_unsubscribed: remoteUnsubscribed,
      secrets_exposed: false,
    });
  } catch (error) {
    return json(res, Number(error?.status || 500), { ok: false, error: error?.message || 'WHATSAPP_DISCONNECT_FAILED' });
  }
}
