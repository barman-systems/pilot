import dashboard from './platform-owner-dashboard.js';
import {
  accessTokenFromRequest,
  clearAuthCookieHeaders,
  getVerifiedUser,
  supabaseRest,
} from './_auth-core.js';

const OWNER_USER_ID = process.env.DABBIR_OWNER_USER_ID || 'f1c5e98b-4060-43cb-a09b-a67a67028800';

function redirectToOwner(res, clear = false) {
  res.statusCode = 302;
  res.setHeader('location', '/owner');
  res.setHeader('cache-control', 'no-store, max-age=0');
  if (clear) res.setHeader('set-cookie', clearAuthCookieHeaders());
  res.end('Redirecting...');
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET, HEAD');
    return res.end('Method Not Allowed');
  }

  const accessToken = accessTokenFromRequest(req);
  if (!accessToken) return redirectToOwner(res);

  try {
    const user = await getVerifiedUser(accessToken);
    if (!user || String(user.id) !== OWNER_USER_ID) {
      return redirectToOwner(res, true);
    }

    const adminResponse = await supabaseRest(
      `dabbir_platform_admins?select=role,active&user_id=eq.${encodeURIComponent(OWNER_USER_ID)}&active=eq.true&limit=1`,
      accessToken,
    );
    if (!adminResponse.ok) return redirectToOwner(res, true);

    const admins = await adminResponse.json().catch(() => []);
    if (!Array.isArray(admins) || !admins.some(row => row?.active === true && row?.role === 'platform_owner')) {
      return redirectToOwner(res, true);
    }

    return dashboard(req, res);
  } catch {
    return redirectToOwner(res, true);
  }
}
