import crypto from 'node:crypto';
import {
  authCookieHeaders,
  json,
  parseCookies,
  readJsonBody,
  requireSameOrigin,
  supabaseAuth,
} from '../_auth-core.js';

const SUPABASE_URL = 'https://spohjzrsymsmzsseygtw.supabase.co';
const OWNER_USERNAME = 'barmanadmin';
const OWNER_EMAIL = process.env.DABBIR_OWNER_LOGIN_EMAIL || 'barman2013@icloud.com';
const OWNER_USER_ID = process.env.DABBIR_OWNER_USER_ID || 'f1c5e98b-4060-43cb-a09b-a67a67028800';
const RESEND_FROM = process.env.DABBIR_OWNER_EMAIL_FROM || 'DABBIR | دبّر <no-reply@auth.bmalman.com>';
const OTP_RE = /^\d{6}$/;
const OTP_COOKIE = '__Host-dabbir_owner_otp_state';
const OTP_TTL_SECONDS = 600;
const RESEND_SECONDS = 60;

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function secrets() {
  const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const resendKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!serviceRole || !resendKey) throw new Error('OWNER_OTP_SECRETS_MISSING');
  return { serviceRole, resendKey };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('base64url');
}

function signState(payload, key) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', key).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function readState(req, key) {
  const raw = parseCookies(req.headers.cookie || '')[OTP_COOKIE];
  if (!raw) return null;
  const [encoded, signature] = String(raw).split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', key).update(encoded).digest();
  let received;
  try { received = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const state = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!state || Number(state.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    return state;
  } catch {
    return null;
  }
}

function otpCookie(value, maxAge = OTP_TTL_SECONDS) {
  return `${OTP_COOKIE}=${encodeURIComponent(value)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, maxAge)}`;
}

function clearOtpCookie() {
  return otpCookie('', 0);
}

async function generateSupabaseMagicToken(serviceRole) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: OWNER_EMAIL }),
  });

  if (!response.ok) throw new Error('OWNER_TOKEN_GENERATION_FAILED');
  const payload = await response.json().catch(() => null);
  const hashedToken = payload?.properties?.hashed_token || payload?.hashed_token;
  if (!hashedToken) throw new Error('OWNER_TOKEN_GENERATION_FAILED');
  return String(hashedToken);
}

async function sendOwnerOtp(resendKey, otp) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${resendKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [OWNER_EMAIL],
      subject: 'رمز دخول دبّر | DABBIR owner code',
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7"><h2>دبّر | DABBIR</h2><p>رمز دخول المالك:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px">${otp}</div><p>ينتهي الرمز خلال 10 دقائق. إذا لم تطلب هذا الرمز فتجاهل الرسالة.</p></div>`,
      text: `DABBIR | دبّر\nرمز دخول المالك: ${otp}\nينتهي الرمز خلال 10 دقائق.`,
    }),
  });
  if (!response.ok) throw new Error('OWNER_OTP_EMAIL_FAILED');
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.setHeader('pragma', 'no-cache');
  res.setHeader('x-dabbir-owner-auth', 'direct-resend-otp-v2');

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

      const { serviceRole, resendKey } = secrets();
      const existing = readState(req, serviceRole);
      const now = Math.floor(Date.now() / 1000);
      if (existing && now - Number(existing.iat || 0) < RESEND_SECONDS) {
        return json(res, 429, { ok: false, error: 'OTP_RATE_LIMITED' });
      }

      const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const nonce = crypto.randomBytes(18).toString('base64url');
      const hashedToken = await generateSupabaseMagicToken(serviceRole);
      await sendOwnerOtp(resendKey, otp);

      const state = signState({
        v: 2,
        otp_hash: sha256(`${nonce}:${otp}`),
        nonce,
        token_hash: hashedToken,
        iat: now,
        exp: now + OTP_TTL_SECONDS,
      }, serviceRole);

      res.setHeader('set-cookie', otpCookie(state));
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

      const { serviceRole } = secrets();
      const state = readState(req, serviceRole);
      if (!state?.nonce || !state?.otp_hash || !state?.token_hash) {
        res.setHeader('set-cookie', clearOtpCookie());
        return json(res, 401, { ok: false, error: 'INVALID_OWNER_OTP' });
      }

      const actual = Buffer.from(sha256(`${state.nonce}:${otp}`));
      const expected = Buffer.from(String(state.otp_hash));
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        return json(res, 401, { ok: false, error: 'INVALID_OWNER_OTP' });
      }

      const response = await supabaseAuth('/auth/v1/verify', {
        method: 'POST',
        body: JSON.stringify({ token_hash: state.token_hash, type: 'magiclink' }),
      });

      if (!response.ok) {
        res.setHeader('set-cookie', clearOtpCookie());
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
        res.setHeader('set-cookie', clearOtpCookie());
        return json(res, 403, { ok: false, error: 'OWNER_IDENTITY_MISMATCH' });
      }

      res.setHeader('set-cookie', [...authCookieHeaders(session), clearOtpCookie()]);
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
            : error?.message === 'OWNER_OTP_SECRETS_MISSING'
              ? 'OWNER_OTP_NOT_CONFIGURED'
              : 'OWNER_AUTH_UNAVAILABLE',
    });
  }
}
