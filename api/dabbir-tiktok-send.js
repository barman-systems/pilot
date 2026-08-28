import { json, requireSameOrigin } from './_auth-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });

  return json(res, 409, {
    ok: false,
    provider: 'tiktok',
    state: 'SAFETY_BLOCKED',
    error: 'TIKTOK_SEND_SAFETY_GATE_REQUIRED',
    live_send_enabled: false,
    external_side_effects: false,
  });
}
