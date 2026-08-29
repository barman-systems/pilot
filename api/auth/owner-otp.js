const { accessTokenFromRequest } = require('../_auth-core.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_USERNAME = process.env.DABBIR_OWNER_USERNAME || 'barmanadmin';
const OWNER_EMAIL = process.env.DABBIR_OWNER_EMAIL;
const PUBLIC_ORIGIN = process.env.DABBIR_PUBLIC_ORIGIN || 'https://dabbir.bmalman.com';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.end(JSON.stringify(body));
}

async function supabase(path, init = {}) {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(init.headers || {}),
  };
  return fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OWNER_EMAIL) {
    return json(res, 503, { ok: false, error: 'OWNER_AUTH_NOT_CONFIGURED' });
  }

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  const username = String(body.username || '').trim().toLowerCase();
  if (username !== OWNER_USERNAME.toLowerCase()) {
    return json(res, 401, { ok: false, error: 'INVALID_OWNER' });
  }

  if (body.action === 'request') {
    const r = await supabase('/auth/v1/otp', {
      method: 'POST',
      body: JSON.stringify({
        email: OWNER_EMAIL,
        create_user: false,
        data: { dabbir_owner: true },
        options: { emailRedirectTo: `${PUBLIC_ORIGIN}/owner-dashboard` },
      }),
    });
    if (!r.ok) {
      const p = await r.json().catch(() => ({}));
      return json(res, r.status === 429 ? 429 : 503, { ok: false, error: r.status === 429 ? 'OTP_RATE_LIMITED' : 'OTP_REQUEST_FAILED', details: p?.msg || p?.message || null });
    }
    return json(res, 200, { ok: true });
  }

  if (body.action === 'verify') {
    const otp = String(body.otp || '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(otp)) return json(res, 400, { ok: false, error: 'INVALID_OTP_FORMAT' });

    const r = await supabase('/auth/v1/verify', {
      method: 'POST',
      body: JSON.stringify({ type: 'email', email: OWNER_EMAIL, token: otp }),
    });
    const p = await r.json().catch(() => ({}));
    if (!r.ok || !p?.access_token) return json(res, 401, { ok: false, error: 'INVALID_OWNER_OTP' });

    const secure = PUBLIC_ORIGIN.startsWith('https://') ? '; Secure' : '';
    res.setHeader('set-cookie', `dabbir_access_token=${encodeURIComponent(p.access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${secure}`);
    return json(res, 200, { ok: true, authenticated: true });
  }

  return json(res, 400, { ok: false, error: 'INVALID_ACTION' });
};
