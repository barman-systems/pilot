import { ACCESS_COOKIE, json } from '../_auth-core.js';

export function bearerToken(req) {
  const raw = String(req.headers.authorization || '').trim();
  const match = raw.match(/^Bearer\s+([^\s]{20,8192})$/i);
  return match ? match[1] : null;
}

export function injectNativeBearerSession(req) {
  const token = bearerToken(req);
  if (!token) return null;
  req.headers.cookie = `${ACCESS_COOKIE}=${encodeURIComponent(token)}`;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host) req.headers.origin = `https://${host}`;
  req.headers['sec-fetch-site'] = 'same-origin';
  return token;
}

export function requireNativeBearer(req, res) {
  const token = injectNativeBearerSession(req);
  if (!token) {
    json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });
    return null;
  }
  return token;
}
