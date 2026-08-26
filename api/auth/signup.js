import { authCookieHeaders, json, readJsonBody, requireSameOrigin, supabaseAuth } from '../_auth-core.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!emailPattern.test(email) || email.length > 254 || password.length < 12 || password.length > 256) {
      return json(res, 400, { ok: false, error: 'INVALID_SIGNUP_INPUT' });
    }

    const response = await supabaseAuth('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, data: { product: 'PILOT' } }),
    });
    if (!response.ok) {
      // Avoid exposing whether an account already exists.
      return json(res, 202, { ok: true, verification_required: true });
    }

    const payload = await response.json();
    if (payload.access_token && payload.refresh_token) {
      res.setHeader('set-cookie', authCookieHeaders(payload));
      return json(res, 201, { ok: true, authenticated: true, verification_required: false });
    }
    return json(res, 202, { ok: true, authenticated: false, verification_required: true });
  } catch (error) {
    return json(res, error?.code === 413 ? 413 : error?.code === 400 ? 400 : 500, { ok: false, error: error?.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : 'AUTH_UNAVAILABLE' });
  }
}
