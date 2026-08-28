import forgotPasswordHandler from '../../auth/forgot-password.js';
import { json } from '../../_auth-core.js';

function nativeSameOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return false;
  req.headers.origin = `https://${host}`;
  req.headers['sec-fetch-site'] = 'same-origin';
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!nativeSameOrigin(req)) return json(res, 503, { ok: false, error: 'RECOVERY_CONFIGURATION_ERROR' });
  return forgotPasswordHandler(req, res);
}
