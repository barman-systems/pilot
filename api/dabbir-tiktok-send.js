import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { tiktokOwnerContext } from './_tiktok-pilot-core.js';
import { sendTikTokText } from './_tiktok-messaging-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });
  try {
    const body = await readJsonBody(req, 16384);
    const businessId = String(body?.business_id || '').trim();
    const conversationId = String(body?.conversation_id || '').trim().slice(0, 1600);
    const message = String(body?.message || '').trim().slice(0, 6000);
    if (!UUID_RE.test(businessId)) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    if (!conversationId) return json(res, 400, { ok: false, error: 'CONVERSATION_REQUIRED' });
    if (!message) return json(res, 400, { ok: false, error: 'MESSAGE_REQUIRED' });
    await tiktokOwnerContext(req, businessId);
    const sent = await sendTikTokText(req, businessId, conversationId, message);
    return json(res, 200, { ok: true, provider: 'tiktok', sent: true, ...sent });
  } catch (error) {
    const status = Number(error?.status || error?.code || 500);
    return json(res, [400,401,403,409,413,502,503,504].includes(status) ? status : 500, {
      ok: false,
      error: String(error?.message || 'TIKTOK_SEND_FAILED').slice(0,160),
      provider_code: error?.providerCode ?? undefined,
    });
  }
}
