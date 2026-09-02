import { json } from './_auth-core.js';
import {
  findTikTokConnection,
  safeTikTokStatus,
  tiktokOwnerContext,
  tiktokConfig,
} from './_tiktok-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEND_SAFETY_BLOCKER = 'TIKTOK_SEND_SAFETY_GATE_REQUIRED';

function businessIdFromRequest(req) {
  try {
    const url = new URL(String(req.url || '/'), 'https://dabbir.invalid');
    const value = String(url.searchParams.get('business_id') || '').trim();
    return UUID_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  try {
    const businessId = businessIdFromRequest(req);
    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    await tiktokOwnerContext(req, businessId);
    const config = tiktokConfig(req);
    const connection = await findTikTokConnection(businessId);
    const status = safeTikTokStatus(connection, config);
    return json(res, 200, {
      ok: true,
      provider: 'tiktok',
      ...status,
      messaging_send_scope: status.messaging_send === true,
      messaging_send: false,
      messaging_ready: false,
      live_send_enabled: false,
      send_blocker: SEND_SAFETY_BLOCKER,
    });
  } catch (error) {
    const status = Number(error?.status || error?.code || 500);
    const safeStatus = [400, 401, 403, 404, 409, 502, 503, 504].includes(status) ? status : 500;
    return json(res, safeStatus, {
      ok: false,
      state: 'FAILED_OR_UNVERIFIED',
      error: String(error?.message || 'TIKTOK_STATUS_FAILED').slice(0, 160),
    });
  }
}
