import { authCookieHeaders, getVerifiedUser, json, readJsonBody, requireSameOrigin, supabaseAuth } from '../_auth-core.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function revoke(accessToken) {
  await supabaseAuth('/auth/v1/logout', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    body: '{}',
  }).catch(() => null);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!emailPattern.test(email) || email.length > 254 || password.length < 8 || password.length > 256) {
      return json(res, 400, { ok: false, error: 'INVALID_CREDENTIAL_INPUT' });
    }

    const response = await supabaseAuth('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return json(res, 401, { ok: false, error: 'INVALID_CREDENTIALS' });

    const session = await response.json();
    if (!session.access_token || !session.refresh_token) return json(res, 502, { ok: false, error: 'AUTH_SESSION_MISSING' });

    const dabbirUser = await getVerifiedUser(session.access_token).catch(() => null);
    if (!dabbirUser) {
      await revoke(session.access_token);
      return json(res, 403, { ok: false, error: 'DABBIR_ACCOUNT_UNAVAILABLE' });
    }

    res.setHeader('set-cookie', authCookieHeaders(session));
    return json(res, 200, { ok: true, authenticated: true, expires_in: session.expires_in ?? null });
  } catch (error) {
    return json(res, error?.code === 413 ? 413 : error?.code === 400 ? 400 : 500, { ok: false, error: error?.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : 'AUTH_UNAVAILABLE' });
  }
}
