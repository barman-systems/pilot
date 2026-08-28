import { getVerifiedUser, json, readJsonBody, supabaseAuth } from '../../_auth-core.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicSession(payload) {
  const expiresIn = Math.max(60, Number(payload?.expires_in || 3600));
  return {
    access_token: String(payload.access_token),
    refresh_token: String(payload.refresh_token),
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
  };
}

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
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!EMAIL.test(email) || email.length > 254 || password.length < 1 || password.length > 4096) return json(res, 400, { ok: false, error: 'INVALID_LOGIN_INPUT' });
    const response = await supabaseAuth('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (!response.ok) return json(res, 401, { ok: false, error: 'INVALID_CREDENTIALS' });
    const payload = await response.json();
    if (!payload?.access_token || !payload?.refresh_token) return json(res, 503, { ok: false, error: 'AUTH_SESSION_UNAVAILABLE' });

    // The shared Supabase identity may legitimately continue to exist for other
    // products after DABBIR deletion. Never turn that shared identity back into a
    // DABBIR session when the DABBIR product access state is suspended/deleted.
    const dabbirUser = await getVerifiedUser(payload.access_token).catch(() => null);
    if (!dabbirUser) {
      await revoke(payload.access_token);
      return json(res, 403, { ok: false, error: 'DABBIR_ACCOUNT_UNAVAILABLE' });
    }

    return json(res, 200, { ok: true, session: publicSession(payload) });
  } catch (error) {
    return json(res, error?.code === 413 ? 413 : error?.code === 400 ? 400 : 503, { ok: false, error: error?.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : 'AUTH_UNAVAILABLE' });
  }
}
