import { getVerifiedUser, json, readJsonBody, supabaseAuth } from '../../_auth-core.js';

const PROVIDERS = new Set(['apple', 'google']);
const TOKEN_MAX = 16384;

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
    const body = await readJsonBody(req, TOKEN_MAX + 2048);
    const provider = String(body.provider || '').trim().toLowerCase();
    const idToken = String(body.id_token || '').trim();
    const accessToken = body.access_token == null ? '' : String(body.access_token).trim();
    const nonce = body.nonce == null ? '' : String(body.nonce).trim();
    const fullName = body.full_name == null ? '' : String(body.full_name).trim();

    if (!PROVIDERS.has(provider) || idToken.length < 20 || idToken.length > TOKEN_MAX || accessToken.length > TOKEN_MAX || nonce.length > 512 || fullName.length > 200) {
      return json(res, 400, { ok: false, error: 'INVALID_PROVIDER_TOKEN_INPUT' });
    }

    const credentials = { provider, id_token: idToken };
    if (accessToken) credentials.access_token = accessToken;
    if (nonce) credentials.nonce = nonce;
    const response = await supabaseAuth('/auth/v1/token?grant_type=id_token', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (!response.ok) return json(res, 401, { ok: false, error: 'INVALID_PROVIDER_CREDENTIALS' });
    const payload = await response.json();
    if (!payload?.access_token || !payload?.refresh_token) return json(res, 503, { ok: false, error: 'AUTH_SESSION_UNAVAILABLE' });

    const dabbirUser = await getVerifiedUser(payload.access_token).catch(() => null);
    if (!dabbirUser) {
      await revoke(payload.access_token);
      return json(res, 403, { ok: false, error: 'DABBIR_ACCOUNT_UNAVAILABLE' });
    }

    if (fullName && provider === 'apple') {
      await supabaseAuth('/auth/v1/user', {
        method: 'PUT',
        headers: { authorization: `Bearer ${payload.access_token}` },
        body: JSON.stringify({ data: { full_name: fullName } }),
      }).catch(() => null);
    }

    return json(res, 200, { ok: true, session: publicSession(payload), provider });
  } catch (error) {
    return json(res, error?.code === 413 ? 413 : error?.code === 400 ? 400 : 503, {
      ok: false,
      error: error?.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : 'AUTH_UNAVAILABLE',
    });
  }
}
