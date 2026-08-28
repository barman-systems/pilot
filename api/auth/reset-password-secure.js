import { json, readJsonBody, requireSameOrigin, supabaseAuth } from '../_auth-core.js';
import { checkPasswordCompromise } from '../_password-breach-check.js';
import { isStrongPassword } from '../_password-policy.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const accessToken = String(body.access_token || '').trim();
    const password = String(body.password || '');

    if (accessToken.length < 20 || accessToken.length > 8192 || !isStrongPassword(password)) {
      return json(res, 400, { ok: false, error: 'INVALID_RESET_INPUT' });
    }

    const breach = await checkPasswordCompromise(password);
    if (breach.compromised) return json(res, 400, { ok: false, error: 'COMPROMISED_PASSWORD' });

    const response = await supabaseAuth('/auth/v1/user', {
      method: 'PUT',
      headers: { authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      return json(res, response.status === 429 ? 429 : 400, {
        ok: false,
        error: response.status === 429 ? 'RESET_RATE_LIMITED' : 'RECOVERY_LINK_INVALID_OR_EXPIRED',
      });
    }

    return json(res, 200, { ok: true, password_updated: true });
  } catch (error) {
    if (error?.code === 'PASSWORD_BREACH_CHECK_UNAVAILABLE') {
      return json(res, 503, { ok: false, error: 'PASSWORD_SECURITY_CHECK_UNAVAILABLE' });
    }
    if (error?.code === 413) return json(res, 413, { ok: false, error: 'PAYLOAD_TOO_LARGE' });
    if (error?.code === 400) return json(res, 400, { ok: false, error: 'INVALID_JSON' });
    return json(res, 500, { ok: false, error: 'RESET_UNAVAILABLE' });
  }
}
