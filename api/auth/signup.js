import { authCookieHeaders, json, readJsonBody, requireSameOrigin, supabaseAuth } from '../_auth-core.js';
import { checkPasswordCompromise } from '../_password-breach-check.js';
import { isStrongPassword } from '../_password-policy.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!emailPattern.test(email) || email.length > 254 || !isStrongPassword(password, { email })) {
      return json(res, 400, { ok: false, error: 'INVALID_SIGNUP_INPUT' });
    }

    const breach = await checkPasswordCompromise(password);
    if (breach.compromised) {
      return json(res, 400, { ok: false, error: 'COMPROMISED_PASSWORD' });
    }

    const response = await supabaseAuth('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, data: { product: 'DABBIR' } }),
    });
    if (!response.ok) {
      // Service failures do not prove that an account or verification email was
      // created. Keep provider details private and let the owner retry manually.
      if (response.status === 429) {
        return json(res, 429, { ok: false, error: 'AUTH_RATE_LIMITED', retryable: true });
      }
      if (response.status >= 500) {
        return json(res, 503, { ok: false, error: 'AUTH_TEMPORARILY_UNAVAILABLE', retryable: true });
      }
      // Account-dependent rejections and pending verification must have the
      // same public response; neither proves account creation or email delivery.
      return json(res, 202, { ok: true, authenticated: false, verification_required: true });
    }

    const payload = await response.json();
    if (typeof payload?.access_token === 'string' && payload.access_token.trim()
      && typeof payload?.refresh_token === 'string' && payload.refresh_token.trim()) {
      res.setHeader('set-cookie', authCookieHeaders(payload));
      return json(res, 201, { ok: true, authenticated: true, verification_required: false });
    }
    // Supabase may return the user directly or under `user` when confirmation
    // is pending. A missing user or partial session proves neither outcome.
    const userId = payload?.user?.id || payload?.id;
    if (payload?.access_token || payload?.refresh_token || typeof userId !== 'string' || !userId.trim()) {
      return json(res, 503, { ok: false, error: 'AUTH_TEMPORARILY_UNAVAILABLE', retryable: true });
    }
    return json(res, 202, { ok: true, authenticated: false, verification_required: true });
  } catch (error) {
    if (error?.code === 'PASSWORD_BREACH_CHECK_UNAVAILABLE') {
      return json(res, 503, { ok: false, error: 'PASSWORD_SECURITY_CHECK_UNAVAILABLE' });
    }
    if (error?.code === 413 || error?.code === 400) {
      return json(res, error.code, { ok: false, error: error.code === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON' });
    }
    return json(res, 503, { ok: false, error: 'AUTH_TEMPORARILY_UNAVAILABLE', retryable: true });
  }
}
