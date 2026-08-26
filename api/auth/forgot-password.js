import { json, readJsonBody, requireSameOrigin, supabaseAuth } from '../_auth-core.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CANONICAL_RECOVERY_REDIRECT = 'https://pilot-taupe.vercel.app/';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();

    if (!emailPattern.test(email) || email.length > 254) {
      return json(res, 400, { ok: false, error: 'INVALID_RECOVERY_INPUT' });
    }

    // Password recovery always returns to the one authoritative DABBIR production
    // root. The recovery token itself arrives in the URL fragment and the UI
    // detects type=recovery, so no special query string is required.
    const upstream = await supabaseAuth(`/auth/v1/recover?redirect_to=${encodeURIComponent(CANONICAL_RECOVERY_REDIRECT)}`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }).catch(() => null);

    // Do not reveal whether an account exists. Preserve enumeration resistance.
    if (upstream && !upstream.ok) {
      console.warn('dabbir_password_recovery_upstream_rejected', { status: upstream.status });
    }

    return json(res, 200, {
      ok: true,
      accepted: true,
      message: 'RECOVERY_EMAIL_IF_ACCOUNT_EXISTS',
      redirect_target: 'CANONICAL_DABBIR_PRODUCTION',
    });
  } catch (error) {
    if (error?.code === 413) return json(res, 413, { ok: false, error: 'PAYLOAD_TOO_LARGE' });
    if (error?.code === 400) return json(res, 400, { ok: false, error: 'INVALID_JSON' });
    return json(res, 200, {
      ok: true,
      accepted: true,
      message: 'RECOVERY_EMAIL_IF_ACCOUNT_EXISTS',
      redirect_target: 'CANONICAL_DABBIR_PRODUCTION',
    });
  }
}
