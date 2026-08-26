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

export async function supabaseRest(path, accessToken, options = {}) {
  if (!accessToken) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 401 });
  const headers = new Headers(options.headers || {});
  headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  headers.set('authorization', `Bearer ${accessToken}`);
  headers.set('accept', 'application/json');
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers, cache: 'no-store' });
}

export function accessTokenFromRequest(req) {
  return parseCookies(req.headers.cookie || '')[ACCESS_COOKIE] || null;
}

export async function supabaseRpc(name, accessToken, params = {}) {
  return supabaseRest(`rpc/${encodeURIComponent(name)}`, accessToken, {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(params),
  });
}

export async function getVerifiedUser(accessToken) {
  if (!accessToken) return null;
  const response = await supabaseAuth('/auth/v1/user', { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  const user = await response.json();
  return { id: user.id, email: user.email ?? null, aud: user.aud ?? null };
}

export async function getBusinessMemberships(accessToken) {
  const response = await supabaseRest('pilot_memberships?select=business_id,role,status,permissions,accepted_at&status=eq.active', accessToken);
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

export async function readRpcJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return { message: text.slice(0, 500) }; }
}

export function rpcErrorCode(payload, fallback = 'REQUEST_FAILED') {
  const raw = String(payload?.message || payload?.error || '').toUpperCase();
  const known = [
    'AUTH_REQUIRED','BUSINESS_REQUIRED','INVALID_EMAIL','INVALID_ROLE','INVALID_TOKEN_HASH','INVALID_EXPIRY',
    'TEAM_MANAGEMENT_REQUIRED','PERMISSION_GRANT_NOT_ALLOWED','INVITATION_ALREADY_PENDING','EMPLOYEE_ALREADY_MEMBER',
    'INVALID_INVITATION','VERIFIED_EMAIL_REQUIRED','INVITATION_NOT_FOUND','INVITATION_NOT_PENDING','INVITATION_EXPIRED',
    'INVITATION_EMAIL_MISMATCH','INVITER_NO_LONGER_AUTHORIZED','MEMBERSHIP_ALREADY_EXISTS','MEMBERSHIP_NOT_FOUND',
    'OWNER_IMMUTABLE','INVALID_STATUS','NEW_INVITATION_REQUIRED'
  ];
  return known.find(code => raw.includes(code)) || fallback;
}
