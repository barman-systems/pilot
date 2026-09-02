import {
  json,
  parseCookies,
  readJsonBody,
  requireSameOrigin,
} from '../_auth-core.js';

const OWNER_USERNAME = 'barmanadmin';
const OWNER_EMAIL = process.env.DABBIR_OWNER_LOGIN_EMAIL || 'barman2013@icloud.com';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const BROKER_URL = String(process.env.DABBIR_OWNER_BROKER_URL || `${SUPABASE_URL}/functions/v1/dabbir-owner-broker`).replace(/\/$/, '');
const OTP_RE = /^\d{6}$/;
const CHALLENGE_COOKIE = '__Host-dabbir_owner_otp_challenge';
const SESSION_COOKIE = '__Host-dabbir_owner_session';

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function secureCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, maxAge)}`;
}

function challengeCookie(value, maxAge = 600) {
  return secureCookie(CHALLENGE_COOKIE, value, maxAge);
}

function sessionCookie(value, maxAge = 43200) {
  return secureCookie(SESSION_COOKIE, value, maxAge);
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
  res.setHeader('x-dabbir-owner-auth', 'brokered-resend-otp-v7');

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

      if (!response.ok || !payload?.authenticated || !payload?.session_token) {
        res.setHeader('set-cookie', clearChallengeCookie());
        return json(res, response.status === 503 ? 503 : 401, {
          ok: false,
          error: payload?.error || 'INVALID_OWNER_OTP',
        });
      }

      const maxAge = Math.max(60, Math.min(43200, Number(payload.expires_in || 43200)));
      res.setHeader('set-cookie', [sessionCookie(payload.session_token, maxAge), clearChallengeCookie()]);
      return json(res, 200, {
        ok: true,
        authenticated: true,
        username: OWNER_USERNAME,
        expires_in: maxAge,
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
