import { json, readJsonBody, requireSameOrigin, supabaseAuth } from '../_auth-core.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function recoveryRedirect(req) {
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/.test(rawHost)) return null;
  const local = rawHost.startsWith('localhost:') || rawHost.startsWith('127.0.0.1:');
  const protocol = local ? 'http' : 'https';
  return `${protocol}://${rawHost}/?password_recovery=1`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const redirectTo = recoveryRedirect(req);

    if (!emailPattern.test(email) || email.length > 254 || !redirectTo) {
      return json(res, 400, { ok: false, error: 'INVALID_RECOVERY_INPUT' });
    }

    // Do not reveal whether an account exists. Supabase Auth also rate-limits
    // password recovery requests (normally one request per user per 60 seconds).
    await supabaseAuth(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }).catch(() => null);

    return json(res, 200, {
      ok: true,
      accepted: true,
      message: 'RECOVERY_EMAIL_IF_ACCOUNT_EXISTS',
    });
  } catch (error) {
    if (error?.code === 413) return json(res, 413, { ok: false, error: 'PAYLOAD_TOO_LARGE' });
    if (error?.code === 400) return json(res, 400, { ok: false, error: 'INVALID_JSON' });
    // Preserve account-enumeration resistance even if the upstream mail service is unavailable.
    return json(res, 200, {
      ok: true,
      accepted: true,
      message: 'RECOVERY_EMAIL_IF_ACCOUNT_EXISTS',
    });
  }
}
