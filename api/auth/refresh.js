import { REFRESH_COOKIE, authCookieHeaders, clearAuthCookieHeaders, json, parseCookies, requireSameOrigin, supabaseAuth } from '../_auth-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  const cookies = parseCookies(req.headers.cookie || '');
  const refreshToken = cookies[REFRESH_COOKIE];
  if (!refreshToken) {
    res.setHeader('set-cookie', clearAuthCookieHeaders());
    return json(res, 401, { ok: true, authenticated: false });
  }

  try {
    const response = await supabaseAuth('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      res.setHeader('set-cookie', clearAuthCookieHeaders());
      return json(res, 401, { ok: true, authenticated: false });
    }
    const session = await response.json();
    if (!session.access_token || !session.refresh_token) throw new Error('AUTH_SESSION_MISSING');
    res.setHeader('set-cookie', authCookieHeaders(session));
    return json(res, 200, { ok: true, authenticated: true, expires_in: session.expires_in ?? null });
  } catch {
    return json(res, 503, { ok: false, error: 'AUTH_REFRESH_UNAVAILABLE' });
  }
}
