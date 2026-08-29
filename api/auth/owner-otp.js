import {
  authCookieHeaders,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseAuth,
} from '../_auth-core.js';

const OWNER_USERNAME = 'barmanadmin';
const OWNER_EMAIL = process.env.DABBIR_OWNER_LOGIN_EMAIL || 'barman2013@icloud.com';
const OWNER_USER_ID = process.env.DABBIR_OWNER_USER_ID || 'f1c5e98b-4060-43cb-a09b-a67a67028800';
const OWNER_REDIRECT_URL = process.env.DABBIR_OWNER_REDIRECT_URL || 'https://dabbir.bmalman.com/owner-dashboard';
const OTP_RE = /^\d{6}$/;

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function publicAuthError(status) {
  if (status === 429) return { status: 429, error: 'OTP_RATE_LIMITED' };
  return { status: 503, error: 'OTP_UNAVAILABLE' };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.setHeader('pragma', 'no-cache');
  res.setHeader('x-dabbir-owner-auth', 'username-otp-v1');

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  }
  if (!requireSameOrigin(req)) {
    return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });
  }

  try {
    const body = await readJsonBody(req, 2048);
    const action = String(body.action || '').trim().toLowerCase();
    const username = normalizeUsername(body.username);

    if (action === 'request') {
      // Keep the response generic so this endpoint never becomes an account
      // discovery oracle. Only the canonical owner username causes delivery.
      if (username !== OWNER_USERNAME) {
        return json(res, 200, { ok: true, otp_required: true });
      }

      const response = await supabaseAuth(
        `/auth/v1/otp?redirect_to=${encodeURIComponent(OWNER_REDIRECT_URL)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            email: OWNER_EMAIL,
            create_user: false,
          }),
        },
      );

      if (!response.ok) {
        const failure = publicAuthError(response.status);
        return json(res, failure.status, { ok: false, error: failure.error });
      }

      return json(res, 200, { ok: true, otp_required: true });
    }

    if (action === 'verify') {
      if (username !== OWNER_USERNAME) {
        return json(res, 401, { ok: false, error: 'INVALID_OWNER_OTP' });
      }

      const otp = String(body.otp || '').trim();
      if (!OTP_RE.test(otp)) {
        return json(res, 400, { ok: false, error: 'INVALID_OTP_FORMAT' });
      }

      const response = await supabaseAuth('/auth/v1/verify', {
        method: 'POST',
        body: JSON.stringify({
          email: OWNER_EMAIL,
          token: otp,
          type: 'email',
        }),
      });

      if (!response.ok) {
        return json(res, response.status === 429 ? 429 : 401, {
          ok: false,
          error: response.status === 429 ? 'OTP_RATE_LIMITED' : 'INVALID_OWNER_OTP',
        });
      }

      const session = await response.json().catch(() => null);
      if (
        !session?.access_token ||
        !session?.refresh_token ||
        String(session?.user?.id || '') !== OWNER_USER_ID
      ) {
        return json(res, 403, { ok: false, error: 'OWNER_IDENTITY_MISMATCH' });
      }

      res.setHeader('set-cookie', authCookieHeaders(session));
      return json(res, 200, {
        ok: true,
        authenticated: true,
        username: OWNER_USERNAME,
        expires_in: session.expires_in ?? null,
      });
    }

    return json(res, 400, { ok: false, error: 'INVALID_OTP_ACTION' });
  } catch (error) {
    const code = Number(error?.code || 500);
    return json(res, code === 400 || code === 413 ? code : 500, {
      ok: false,
      error:
        error?.message === 'PAYLOAD_TOO_LARGE'
          ? 'PAYLOAD_TOO_LARGE'
          : error?.message === 'INVALID_JSON'
            ? 'INVALID_JSON'
            : 'OWNER_AUTH_UNAVAILABLE',
    });
  }
}
