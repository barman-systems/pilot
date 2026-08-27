import { ACCESS_COOKIE, getBusinessMemberships, getVerifiedUserWithAccess, json, parseCookies } from '../_auth-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const accessToken = cookies[ACCESS_COOKIE];
    const user = await getVerifiedUserWithAccess(accessToken);
    if (!user) return json(res, 401, { ok: true, authenticated: false, memberships: [] });
    if (user.dabbir_access === 'suspended') {
      return json(res, 423, {
        ok: false,
        authenticated: true,
        suspended: true,
        error: 'DABBIR_ACCOUNT_SUSPENDED',
        user: { id: user.id, email: user.email },
        reason: user.suspension_reason ?? null,
        suspended_at: user.suspended_at ?? null,
        memberships: [],
      });
    }
    const memberships = await getBusinessMemberships(accessToken);
    return json(res, 200, { ok: true, authenticated: true, user, memberships });
  } catch {
    return json(res, 503, { ok: false, authenticated: false, error: 'SESSION_LOOKUP_UNAVAILABLE' });
  }
}
