import { createRemoteJWKSet, jwtVerify } from 'jose';

const LEGACY_SUPABASE_URL = 'https://spohjzrsymsmzsseygtw.supabase.co';
export const SUPABASE_AUTH_URL = String(process.env.SUPABASE_AUTH_URL || process.env.SUPABASE_URL || LEGACY_SUPABASE_URL).replace(/\/$/, '');
export const SUPABASE_DATA_URL = String(process.env.SUPABASE_DATA_URL || process.env.SUPABASE_URL || LEGACY_SUPABASE_URL).replace(/\/$/, '');
// Backward-compatible export. New code should choose AUTH or DATA explicitly.
export const SUPABASE_URL = SUPABASE_DATA_URL;
const SUPABASE_AUTH_ISSUER = `${SUPABASE_AUTH_URL}/auth/v1`;
const SUPABASE_AUTH_JWKS = createRemoteJWKSet(new URL(`${SUPABASE_AUTH_ISSUER}/.well-known/jwks.json`));
// Supabase publishable keys are intentionally safe for public/client use. Never place a service-role key here.
const SUPABASE_PUBLISHABLE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_WPxhwNf08BW1FgBptkinWg_3j75O4O3').trim();
const DEFAULT_SUPABASE_TIMEOUT_MS = Math.max(1000, Number(process.env.DABBIR_SUPABASE_TIMEOUT_MS || 15000));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ACCESS_COOKIE = '__Host-dabbir_access';
export const REFRESH_COOKIE = '__Host-dabbir_refresh';

function boundedSignal(options = {}) {
  return options.signal || AbortSignal.timeout(DEFAULT_SUPABASE_TIMEOUT_MS);
}

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

function matchesRequestHost(urlValue, req) {
  if (!urlValue) return false;
  try {
    return new URL(String(urlValue)).host.toLowerCase() === hostFromRequest(req);
  } catch {
    return false;
  }
}

export function requireSameOrigin(req) {
  const origin = req.headers.origin;
  if (origin) return matchesRequestHost(origin, req);

  // Safari/iOS can omit Origin, Sec-Fetch-Site, and Referer on same-origin
  // fetches, especially with Referrer-Policy: no-referrer. The web client
  // sends this non-simple header; a cross-site form cannot set it and a
  // cross-site fetch would be stopped by CORS before reaching this handler.
  if (String(req.headers['x-dabbir-client'] || '').toLowerCase() === 'web') return true;

  // Keep the request fail-closed when the browser supplies fetch metadata or
  // a same-host Referer. Cross-site and unknown requests remain rejected.
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite === 'same-origin') return true;
  if (fetchSite === 'cross-site' || fetchSite === 'same-site' || fetchSite === 'none') return false;

  return matchesRequestHost(req.headers.referer, req);
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
  return fetch(`${SUPABASE_AUTH_URL}${path}`, {
    ...options,
    headers,
    redirect: 'manual',
    signal: boundedSignal(options),
  });
}

export async function supabaseRest(path, accessToken, options = {}) {
  if (!accessToken) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 401 });
  const headers = new Headers(options.headers || {});
  headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  headers.set('authorization', `Bearer ${accessToken}`);
  headers.set('accept', 'application/json');
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return fetch(`${SUPABASE_DATA_URL}/rest/v1/${path}`, {
    ...options,
    headers,
    cache: 'no-store',
    signal: boundedSignal(options),
  });
}

export async function supabaseStorage(path, accessToken, options = {}) {
  if (!accessToken) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 401 });
  const headers = new Headers(options.headers || {});
  headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(`${SUPABASE_DATA_URL}/storage/v1/${String(path || '').replace(/^\/+/, '')}`, {
    ...options,
    headers,
    cache: 'no-store',
    signal: boundedSignal(options),
  });
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

async function verifiedUserViaJwks(accessToken) {
  try {
    const { payload } = await jwtVerify(accessToken, SUPABASE_AUTH_JWKS, {
      issuer: SUPABASE_AUTH_ISSUER,
      audience: 'authenticated',
    });
    if (!UUID_RE.test(String(payload?.sub || ''))) return null;
    return {
      id: String(payload.sub),
      email: payload.email == null ? null : String(payload.email),
      aud: payload.aud ?? null,
    };
  } catch {
    return null;
  }
}

async function verifiedUserBase(accessToken, options = {}) {
  if (!accessToken) return null;

  // Normal path: verify the ES256 Supabase session locally using the public JWKS.
  // This keeps Sydney Auth out of the hot request path once DABBIR data is in UAE.
  const localUser = await verifiedUserViaJwks(accessToken);
  if (localUser) return localUser;

  // Compatibility/failover path for a legacy HS256 session or a temporary JWKS
  // rotation/network issue. Supabase Auth remains managed and authoritative.
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${accessToken}`);
  const response = await supabaseAuth('/auth/v1/user', { ...options, headers });
  if (!response.ok) return null;
  const user = await response.json();
  if (!UUID_RE.test(String(user?.id || ''))) return null;
  return { id: user.id, email: user.email ?? null, aud: user.aud ?? null };
}

export async function getVerifiedUserWithAccess(accessToken, options = {}) {
  const user = await verifiedUserBase(accessToken, options);
  if (!user) return null;

  // This is an ordinary RLS-protected self-read. The authenticated browser/user
  // can read only its own suspension row and cannot write any access state.
  const response = await supabaseRest(
    `account_access_state?select=status,reason,suspended_at&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
    accessToken,
    options,
  ).catch(error => {
    if (options.signal?.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError') throw error;
    return null;
  });
  if (!response?.ok) return null;
  const rows = await response.json().catch(() => null);
  if (!Array.isArray(rows)) return null;
  const access = rows[0] || { status: 'active', reason: null, suspended_at: null };
  if (!['active','suspended'].includes(String(access.status || ''))) return null;

  return {
    ...user,
    dabbir_access: access.status,
    suspension_reason: access.reason ?? null,
    suspended_at: access.suspended_at ?? null,
  };
}

export async function getVerifiedUser(accessToken, options = {}) {
  const user = await getVerifiedUserWithAccess(accessToken, options);
  if (!user || user.dabbir_access === 'suspended') return null;
  return user;
}

function decodeJwtPayload(accessToken) {
  try {
    const parts = String(accessToken || '').split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// IMPORTANT: this helper does not verify the JWT signature itself. Call it only
// after the same access token has already been accepted by a verified path.
export function userClaimsFromValidatedAccessToken(accessToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = decodeJwtPayload(accessToken);
  if (!payload || !UUID_RE.test(String(payload.sub || ''))) return null;
  if (String(payload.iss || '') !== SUPABASE_AUTH_ISSUER) return null;
  if (String(payload.role || '') !== 'authenticated') return null;
  const audiences = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || '')];
  if (!audiences.includes('authenticated')) return null;
  const exp = Number(payload.exp || 0);
  if (!Number.isFinite(exp) || exp <= Number(nowSeconds)) return null;
  const nbf = payload.nbf == null ? null : Number(payload.nbf);
  if (nbf != null && (!Number.isFinite(nbf) || nbf > Number(nowSeconds))) return null;
  return {
    id: String(payload.sub),
    email: payload.email == null ? null : String(payload.email),
    aud: payload.aud ?? null,
  };
}

export async function getBusinessMemberships(accessToken, options = {}) {
  const payload = decodeJwtPayload(accessToken);
  const userId = UUID_RE.test(String(payload?.sub || '')) ? String(payload.sub) : null;
  const selfFilter = userId ? `&user_id=eq.${encodeURIComponent(userId)}` : '';
  const response = await supabaseRest(
    `dabbir_memberships?select=business_id,role,status,permissions,accepted_at&status=eq.active${selfFilter}`,
    accessToken,
    options,
  );
  if (!response.ok) {
    const status = Number(response.status || 500);
    const error = new Error(status === 401 || status === 403 ? 'AUTH_REQUIRED' : 'MEMBERSHIP_LOOKUP_FAILED');
    error.code = status;
    throw error;
  }
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
      catch { reject(Object.assign(new Error('INVALID_JSON'), { code: 400 }));
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
    'OWNER_IMMUTABLE','INVALID_STATUS','NEW_INVITATION_REQUIRED','DABBIR_ACCOUNT_SUSPENDED'
  ];
  return known.find(code => raw.includes(code)) || fallback;
}
