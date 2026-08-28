import { json } from './_auth-core.js';
import { tiktokOwnerContext } from './_tiktok-pilot-core.js';
import { listTikTokConversations } from './_tiktok-messaging-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function query(req, key, max = 1000) {
  try { return String(new URL(String(req.url || '/'), 'https://dabbir.invalid').searchParams.get(key) || '').trim().slice(0, max); }
  catch { return ''; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  try {
    const businessId = query(req, 'business_id', 80);
    if (!UUID_RE.test(businessId)) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    await tiktokOwnerContext(req, businessId);
    const conversations = await listTikTokConversations(req, businessId);
    return json(res, 200, { ok: true, provider: 'tiktok', conversations });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json(res, [400,401,403,409,502,503,504].includes(status) ? status : 500, {
      ok: false,
      error: String(error?.message || 'TIKTOK_CONVERSATIONS_FAILED').slice(0,160),
      provider_code: error?.providerCode ?? undefined,
    });
  }
}
