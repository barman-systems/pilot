import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import {
  buildAuthorizeUrl,
  newOauthState,
  stageTikTokOAuth,
  tiktokOwnerContext,
  tiktokConfig,
} from './_tiktok-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req, 4096);
    const businessId = String(body?.business_id || '').trim();
    if (!UUID_RE.test(businessId)) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });

    const config = tiktokConfig(req);
    if (!config.ready) {
      return json(res, 503, {
        ok: false,
        state: 'NOT_CONFIGURED',
        error: 'TIKTOK_APP_NOT_CONFIGURED',
        required_environment: ['DABBIR_TIKTOK_APP_ID', 'DABBIR_TIKTOK_APP_SECRET'],
      });
    }

    const { user } = await tiktokOwnerContext(req, businessId);
    const state = newOauthState();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await stageTikTokOAuth({ businessId, userId: user.id, state, expiresAt });

    return json(res, 200, {
      ok: true,
      state: 'AUTHORIZATION_REQUIRED',
      authorize_url: buildAuthorizeUrl(config, state),
      expires_at: expiresAt,
      requested_scopes: config.scopes,
    });
  } catch (error) {
    const status = Number(error?.status || error?.code || 500);
    const safeStatus = [400, 401, 403, 409, 413, 502, 503, 504].includes(status) ? status : 500;
    return json(res, safeStatus, {
      ok: false,
      state: 'FAILED_OR_UNVERIFIED',
      error: String(error?.message || 'TIKTOK_CONNECT_FAILED').slice(0, 160),
    });
  }
}
