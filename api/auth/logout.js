import { ACCESS_COOKIE, clearAuthCookieHeaders, json, parseCookies, requireSameOrigin, supabaseAuth } from '../_auth-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  const cookies = parseCookies(req.headers.cookie || '');
  const accessToken = cookies[ACCESS_COOKIE];
  if (accessToken) {
    try {
      await supabaseAuth('/auth/v1/logout', { method: 'POST', headers: { authorization: `Bearer ${accessToken}` }, body: '{}' });
    } catch {
      // Local logout is fail-safe even if the identity provider is temporarily unavailable.
    }
  }
  res.setHeader('set-cookie', clearAuthCookieHeaders());
  return json(res, 200, { ok: true, authenticated: false });
}
