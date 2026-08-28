import { json, readJsonBody, supabaseAuth } from '../../_auth-core.js';
import { checkPasswordCompromise } from '../../_password-breach-check.js';
import { isStrongPassword } from '../../_password-policy.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicSession(payload) {
  const expiresIn = Math.max(60, Number(payload?.expires_in || 3600));
  return { access_token: String(payload.access_token), refresh_token: String(payload.refresh_token), expires_at: Math.floor(Date.now() / 1000) + expiresIn };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  try {
    const body = await readJsonBody(req, 8192);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!EMAIL.test(email) || email.length > 254 || !isStrongPassword(password, { email })) return json(res, 400, { ok: false, error: 'INVALID_SIGNUP_INPUT' });
    const breach = await checkPasswordCompromise(password);
    if (breach.compromised) return json(res, 400, { ok: false, error: 'COMPROMISED_PASSWORD' });
    const response = await supabaseAuth('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password, data: { product: 'DABBIR', client: 'ios' } }) });
    if (!response.ok) return json(res, 202, { ok: true, session: null, verification_required: true });
    const payload = await response.json();
    if (payload?.access_token && payload?.refresh_token) return json(res, 201, { ok: true, session: publicSession(payload), verification_required: false });
    return json(res, 202, { ok: true, session: null, verification_required: true });
  } catch (error) {
    if (error?.code === 'PASSWORD_BREACH_CHECK_UNAVAILABLE') return json(res, 503, { ok: false, error: 'PASSWORD_SECURITY_CHECK_UNAVAILABLE' });
    return json(res, error?.code === 413 ? 413 : error?.code === 400 ? 400 : 503, { ok: false, error: error?.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : 'AUTH_UNAVAILABLE' });
  }
}
