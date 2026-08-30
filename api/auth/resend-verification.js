import { json, readJsonBody, requireSameOrigin, supabaseAuth } from '../_auth-core.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req, 2048);
    const email = String(body.email || '').trim().toLowerCase();
    if (!emailPattern.test(email) || email.length > 254) {
      return json(res, 400, { ok: false, error: 'INVALID_EMAIL' });
    }

    // Supabase performs provider-side rate limiting. The public response remains
    // enumeration-safe whether the address exists, is already verified, or is new.
    await supabaseAuth('/auth/v1/resend', {
      method: 'POST',
      body: JSON.stringify({ type: 'signup', email }),
    }).catch(() => null);

    return json(res, 202, { ok: true, verification_requested: true });
  } catch (error) {
    const status = error?.code === 413 ? 413 : error?.code === 400 ? 400 : 500;
    const code = error?.message === 'PAYLOAD_TOO_LARGE'
      ? 'PAYLOAD_TOO_LARGE'
      : error?.message === 'INVALID_JSON'
        ? 'INVALID_JSON'
        : 'AUTH_UNAVAILABLE';
    return json(res, status, { ok: false, error: code });
  }
}
