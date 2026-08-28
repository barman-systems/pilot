import { accessTokenFromRequest, getVerifiedUser, json, supabaseRest } from '../../_auth-core.js';
import { requireNativeBearer } from '../_native-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  if (!requireNativeBearer(req, res)) return;

  try {
    const token = accessTokenFromRequest(req);
    const user = token ? await getVerifiedUser(token).catch(() => null) : null;
    if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

    const response = await supabaseRest(
      `dabbir_apple_entitlements?select=product_id,status,environment,expires_at,verified_at,updated_at&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      token,
    );
    if (!response.ok) return json(res, 503, { ok: false, error: 'APPLE_ENTITLEMENT_STATUS_UNAVAILABLE' });
    const rows = await response.json().catch(() => null);
    const row = Array.isArray(rows) ? rows[0] || null : null;
    const entitled = Boolean(row?.status === 'active' && row?.expires_at && new Date(row.expires_at).getTime() > Date.now());

    return json(res, 200, {
      ok: true,
      entitled,
      source: 'SERVER_VERIFIED_APPLE_ENTITLEMENT',
      entitlement: row ? {
        product_id: row.product_id,
        status: row.status,
        environment: row.environment,
        expires_at: row.expires_at,
        verified_at: row.verified_at,
        updated_at: row.updated_at,
      } : null,
    });
  } catch {
    return json(res, 503, { ok: false, error: 'APPLE_ENTITLEMENT_STATUS_UNAVAILABLE' });
  }
}
