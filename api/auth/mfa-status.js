import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  supabaseAuth,
} from '../_auth-core.js';

const FACTOR_ID_RE = /^[0-9a-f-]{16,80}$/i;

function decodeJwtPayload(accessToken) {
  try {
    const parts = String(accessToken || '').split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function safeVerifiedFactors(user) {
  const rows = Array.isArray(user?.factors) ? user.factors : [];
  return rows
    .filter(factor => factor?.status === 'verified' && FACTOR_ID_RE.test(String(factor?.id || '')))
    .map(factor => ({
      id: String(factor.id),
      factor_type: String(factor.factor_type || factor.type || '').toLowerCase(),
      friendly_name: factor.friendly_name == null ? null : String(factor.friendly_name).slice(0, 120),
    }))
    .filter(factor => ['totp', 'phone'].includes(factor.factor_type));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });

  const accessToken = accessTokenFromRequest(req);
  const verifiedUser = await getVerifiedUser(accessToken).catch(() => null);
  if (!verifiedUser) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  try {
    const response = await supabaseAuth('/auth/v1/user', {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return json(res, 502, { ok: false, error: 'MFA_STATUS_UNAVAILABLE' });

    const authUser = await response.json().catch(() => null);
    if (!authUser || String(authUser.id || '') !== String(verifiedUser.id)) {
      return json(res, 502, { ok: false, error: 'MFA_STATUS_IDENTITY_MISMATCH' });
    }

    const factors = safeVerifiedFactors(authUser);
    const totp = factors.filter(factor => factor.factor_type === 'totp');
    const claims = decodeJwtPayload(accessToken);
    const currentLevel = claims?.aal === 'aal2' ? 'aal2' : 'aal1';
    const nextLevel = factors.length ? 'aal2' : currentLevel;
    const mfaRequired = currentLevel !== 'aal2' && totp.length > 0;

    return json(res, 200, {
      ok: true,
      authenticated: true,
      current_level: currentLevel,
      next_level: nextLevel,
      mfa_required: mfaRequired,
      factor_id: mfaRequired ? totp[0].id : null,
      factor_type: mfaRequired ? 'totp' : null,
      factors,
    });
  } catch {
    return json(res, 500, { ok: false, error: 'MFA_STATUS_UNAVAILABLE' });
  }
}
