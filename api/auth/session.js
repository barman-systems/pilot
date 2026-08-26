import { ACCESS_COOKIE, getBusinessMemberships, getVerifiedUser, json, parseCookies } from '../_auth-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const accessToken = cookies[ACCESS_COOKIE];
    const user = await getVerifiedUser(accessToken);
    if (!user) return json(res, 401, { ok: true, authenticated: false, memberships: [] });
    const memberships = await getBusinessMemberships(accessToken);
    return json(res, 200, { ok: true, authenticated: true, user, memberships });
  } catch {
    return json(res, 503, { ok: false, authenticated: false, error: 'SESSION_LOOKUP_UNAVAILABLE' });
  }
}
