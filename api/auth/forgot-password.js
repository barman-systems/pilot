import { json, readJsonBody, requireSameOrigin, supabaseAuth } from '../_auth-core.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CANONICAL_RECOVERY_REDIRECT = 'https://pilot-taupe.vercel.app/?password_recovery=1';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();

    if (!emailPattern.test(email) || email.length > 254) {
      return json(res, 400, { ok: false, error: 'INVALID_RECOVERY_INPUT' });
    }

    // Password recovery must always return to the single authoritative PILOT
    // production URL. Supabase Auth still requires this exact destination to be
    // configured in Auth > URL Configuration; otherwise it falls back to Site URL.
    const upstream = await supabaseAuth(`/auth/v1/recover?redirect_to=${encodeURIComponent(CANONICAL_RECOVERY_REDIRECT)}`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }).catch(() => null);

    // Do not reveal whether an account exists. Preserve enumeration resistance.
    // Expose only a non-sensitive configuration hint for server diagnostics.
    if (upstream && !upstream.ok) {
      console.warn('pilot_password_recovery_upstream_rejected', { status: upstream.status });
    }

    return json(res, 200, {
      ok: true,
      accepted: true,
      message: 'RECOVERY_EMAIL_IF_ACCOUNT_EXISTS',
      redirect_target: 'CANONICAL_PILOT_PRODUCTION',
    });
  } catch (error) {
    if (error?.code === 413) return json(res, 413, { ok: false, error: 'PAYLOAD_TOO_LARGE' });
    if (error?.code === 400) return json(res, 400, { ok: false, error: 'INVALID_JSON' });
    return json(res, 200, {
      ok: true,
      accepted: true,
      message: 'RECOVERY_EMAIL_IF_ACCOUNT_EXISTS',
      redirect_target: 'CANONICAL_PILOT_PRODUCTION',
    });
  }
}
