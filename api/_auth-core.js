const SUPABASE_URL = 'https://spohjzrsymsmzsseygtw.supabase.co';
// Supabase publishable keys are intentionally safe for public/client use. Never place a service-role key here.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WPxhwNf08BW1FgBptkinWg_3j75O4O3';

export const ACCESS_COOKIE = '__Host-pilot_access';
export const REFRESH_COOKIE = '__Host-pilot_refresh';

export function json(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(pair => {
    const i = pair.indexOf('=');
    return i < 0 ? [pair, ''] : [pair.slice(0, i), decodeURIComponent(pair.slice(i + 1))];
  }));
}

function hostFromRequest(req) {
  const raw = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return raw.toLowerCase();
}

export function requireSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host.toLowerCase() === hostFromRequest(req);
  } catch {
    return false;
  }
}

export function authCookieHeaders(session) {
  const accessMaxAge = Math.max(60, Number(session.expires_in || 3600));
  const common = 'Path=/; Secure; HttpOnly; SameSite=Lax';
  return [
    `${ACCESS_COOKIE}=${encodeURIComponent(session.access_token)}; ${common}; Max-Age=${accessMaxAge}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(session.refresh_token)}; ${common}; Max-Age=2592000`,
  ];
}

export function clearAuthCookieHeaders() {
  const common = 'Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';
  return [`${ACCESS_COOKIE}=; ${common}`, `${REFRESH_COOKIE}=; ${common}`];
}

export async function supabaseAuth(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  headers.set('content-type', 'application/json');
  return fetch(`${SUPABASE_URL}${path}`, { ...options, headers, redirect: 'manual' });
}

export async function getVerifiedUser(accessToken) {
  if (!accessToken) return null;
  const response = await supabaseAuth('/auth/v1/user', { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  const user = await response.json();
  return { id: user.id, email: user.email ?? null, aud: user.aud ?? null };
}

export async function getBusinessMemberships(accessToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/pilot_memberships?select=business_id,role`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('MEMBERSHIP_LOOKUP_FAILED');
  return response.json();
}

export function readJsonBody(req, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('INVALID_JSON'), { code: 400 })); }
    });
    req.on('error', reject);
  });
}
