import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  requireSameOrigin,
  supabaseAuth,
} from '../_auth-core.js';

function clean(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  const accessToken = accessTokenFromRequest(req);
  const user = await getVerifiedUser(accessToken);
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  try {
    const response = await supabaseAuth('/auth/v1/factors', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ factor_type: 'totp', friendly_name: 'DABBIR Authenticator' }),
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok) {
      return json(res, response.status === 429 ? 429 : 400, {
        ok: false,
        error: 'MFA_ENROLL_FAILED',
        detail: clean(payload?.error_code || payload?.code || payload?.msg || payload?.message || '', 120) || undefined,
      });
    }
    const factorId = clean(payload?.id, 80);
    const secret = clean(payload?.totp?.secret, 160);
    const uri = String(payload?.totp?.uri || '').slice(0, 2048);
    const qrCode = String(payload?.totp?.qr_code || '').slice(0, 250000);
    if (!factorId || !secret) return json(res, 502, { ok: false, error: 'MFA_FACTOR_MISSING' });
    return json(res, 200, {
      ok: true,
      factor_id: factorId,
      factor_type: 'totp',
      totp: { secret, uri: uri || null, qr_code: qrCode || null },
      verified: false,
    });
  } catch (error) {
    console.error('dabbir_mfa_enroll_failed', { error: clean(error?.message || 'MFA_ENROLL_FAILED', 120) });
    return json(res, 500, { ok: false, error: 'MFA_ENROLL_UNAVAILABLE' });
  }
}
