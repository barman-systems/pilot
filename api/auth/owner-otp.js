import {
  authCookieHeaders,
  json,
  parseCookies,
  readJsonBody,
  requireSameOrigin,
} from '../_auth-core.js';

const OWNER_USERNAME = 'barmanadmin';
const OWNER_EMAIL = process.env.DABBIR_OWNER_LOGIN_EMAIL || 'barman2013@icloud.com';
const OWNER_USER_ID = process.env.DABBIR_OWNER_USER_ID || 'f1c5e98b-4060-43cb-a09b-a67a67028800';
const BROKER_URL = 'https://spohjzrsymsmzsseygtw.supabase.co/functions/v1/bm-secret-broker';
const OTP_RE = /^\d{6}$/;
const CHALLENGE_COOKIE = '__Host-dabbir_owner_otp_challenge';

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function challengeCookie(value, maxAge = 600) {
  return `${CHALLENGE_COOKIE}=${encodeURIComponent(value)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, maxAge)}`;
}

function clearChallengeCookie() {
  return challengeCookie('', 0);
}

async function broker(body) {
  const response = await fetch(BROKER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.setHeader('pragma', 'no-cache');
  res.setHeader('x-dabbir-owner-auth', 'brokered-resend-otp-v4');

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
      if (username !== OWNER_USERNAME) {
        return json(res, 200, { ok: true, otp_required: true });
      }

      const resendKey = String(process.env.RESEND_API_KEY || '').trim();
      if (!resendKey) {
        return json(res, 503, { ok: false, error: 'OWNER_OTP_NOT_CONFIGURED' });
      }

      const { response, payload } = await broker({
        action: 'owner_otp_request',
        resend_key: resendKey,
        owner_email: OWNER_EMAIL,
      });

      if (!response.ok || !payload?.ok || !payload?.challenge_id) {
        return json(res, response.status === 429 ? 429 : 503, {
          ok: false,
          error: response.status === 429 ? 'OTP_RATE_LIMITED' : (payload?.error || 'OWNER_AUTH_UNAVAILABLE'),
        });
      }

      res.setHeader('set-cookie', challengeCookie(payload.challenge_id));
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

      const challengeId = parseCookies(req.headers.cookie || '')[CHALLENGE_COOKIE];
      if (!challengeId) {
        return json(res, 401, { ok: false, error: 'INVALID_OWNER_OTP' });
      }

      const { response, payload } = await broker({
        action: 'owner_otp_verify',
        challenge_id: challengeId,
        otp,
      });

      if (!response.ok || !payload?.authenticated) {
        if (response.status !== 429) res.setHeader('set-cookie', clearChallengeCookie());
        return json(res, response.status === 429 ? 429 : response.status === 503 ? 503 : 401, {
          ok: false,
          error: response.status === 429 ? 'OTP_RATE_LIMITED' : (payload?.error || 'INVALID_OWNER_OTP'),
        });
      }

      const session = payload.session;
      if (
        !session?.access_token ||
        !session?.refresh_token ||
        String(session?.user?.id || '') !== OWNER_USER_ID
      ) {
        res.setHeader('set-cookie', clearChallengeCookie());
        return json(res, 403, { ok: false, error: 'OWNER_IDENTITY_MISMATCH' });
      }

      res.setHeader('set-cookie', [...authCookieHeaders(session), clearChallengeCookie()]);
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
    return json(res, code === 400 || code === 413 ? code : 503, {
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
