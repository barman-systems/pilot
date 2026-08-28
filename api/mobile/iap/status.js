import { accessTokenFromRequest, getVerifiedUser, json, supabaseRest } from '../../_auth-core.js';
import { loadGoogleEntitlement } from '../../_google-play-iap-core.js';
import { requireNativeBearer } from '../_native-core.js';

function requestPlatform(req) {
  try {
    const url = new URL(req.url || '/', 'https://dabbir.invalid');
    return String(url.searchParams.get('platform') || 'ios').toLowerCase();
  } catch {
    return 'ios';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  if (!requireNativeBearer(req, res)) return;

  try {
    const token = accessTokenFromRequest(req);
    const user = token ? await getVerifiedUser(token).catch(() => null) : null;
    if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

    const platform = requestPlatform(req);
    if (platform === 'android') {
      const row = await loadGoogleEntitlement(user.id, { refresh: true });
      return json(res, 200, {
        ok: true,
        entitled: row?.entitled === true,
        source: row?.cached ? 'SERVER_VERIFIED_GOOGLE_PLAY_ENTITLEMENT_CACHE' : 'SERVER_VERIFIED_GOOGLE_PLAY_ENTITLEMENT',
        entitlement: row ? {
          product_id: row.product_id,
          status: row.status,
          environment: row.environment,
          expires_at: row.expires_at,
          acknowledgement_state: row.acknowledgement_state,
          auto_renew_enabled: row.auto_renew_enabled,
          verified_at: row.verified_at,
          updated_at: row.updated_at,
        } : null,
      });
    }

    if (platform !== 'ios') return json(res, 400, { ok: false, error: 'UNSUPPORTED_PURCHASE_PLATFORM' });

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
  } catch (error) {
    const message = String(error?.message || 'STORE_ENTITLEMENT_STATUS_UNAVAILABLE').slice(0, 120);
    return json(res, 503, { ok: false, error: message });
  }
}
