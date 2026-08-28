import { getVerifiedUser, json, readJsonBody, supabaseAuth } from '../../_auth-core.js';

async function revoke(accessToken) {
  await supabaseAuth('/auth/v1/logout', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    body: '{}',
  }).catch(() => null);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  try {
    const body = await readJsonBody(req, 8192);
    const refreshToken = String(body.refresh_token || '').trim();
    if (refreshToken.length < 20 || refreshToken.length > 8192) return json(res, 400, { ok: false, error: 'REFRESH_TOKEN_REQUIRED' });
    const response = await supabaseAuth('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
    if (!response.ok) return json(res, 401, { ok: false, error: 'SESSION_EXPIRED' });
    const payload = await response.json();
    if (!payload?.access_token || !payload?.refresh_token) return json(res, 503, { ok: false, error: 'AUTH_SESSION_UNAVAILABLE' });

    const dabbirUser = await getVerifiedUser(payload.access_token).catch(() => null);
    if (!dabbirUser) {
      await revoke(payload.access_token);
      return json(res, 403, { ok: false, error: 'DABBIR_ACCOUNT_UNAVAILABLE' });
    }

    const expiresIn = Math.max(60, Number(payload.expires_in || 3600));
    return json(res, 200, { ok: true, session: { access_token: String(payload.access_token), refresh_token: String(payload.refresh_token), expires_at: Math.floor(Date.now() / 1000) + expiresIn } });
  } catch (error) {
    return json(res, error?.code === 413 ? 413 : error?.code === 400 ? 400 : 503, { ok: false, error: 'AUTH_UNAVAILABLE' });
  }
}
