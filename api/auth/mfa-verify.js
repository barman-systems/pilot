import {
  accessTokenFromRequest,
  authCookieHeaders,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseAuth,
} from '../_auth-core.js';

const factorPattern = /^[0-9a-f-]{16,80}$/i;
const codePattern = /^\d{6,8}$/;

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  const accessToken = accessTokenFromRequest(req);
  const user = await getVerifiedUser(accessToken);
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const factorId = clean(body.factor_id, 80);
    const code = clean(body.code, 8);
    if (!factorPattern.test(factorId) || !codePattern.test(code)) {
      return json(res, 400, { ok: false, error: 'INVALID_MFA_INPUT' });
    }

    const challengeResponse = await supabaseAuth(`/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({}),
    });
    const challengeText = await challengeResponse.text();
    let challenge = null;
    try { challenge = challengeText ? JSON.parse(challengeText) : null; } catch { challenge = null; }
    if (!challengeResponse.ok || !challenge?.id) {
      return json(res, challengeResponse.status === 429 ? 429 : 400, {
        ok: false,
        error: 'MFA_CHALLENGE_FAILED',
        detail: clean(challenge?.error_code || challenge?.code || challenge?.msg || challenge?.message || '', 120) || undefined,
      });
    }

    const verifyResponse = await supabaseAuth(`/auth/v1/factors/${encodeURIComponent(factorId)}/verify`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ challenge_id: challenge.id, code }),
    });
    const verifyText = await verifyResponse.text();
    let session = null;
    try { session = verifyText ? JSON.parse(verifyText) : null; } catch { session = null; }
    if (!verifyResponse.ok) {
      return json(res, verifyResponse.status === 429 ? 429 : 400, {
        ok: false,
        error: 'MFA_VERIFY_FAILED',
        detail: clean(session?.error_code || session?.code || session?.msg || session?.message || '', 120) || undefined,
      });
    }
    if (!session?.access_token || !session?.refresh_token) {
      return json(res, 502, { ok: false, error: 'MFA_SESSION_MISSING' });
    }

    res.setHeader('set-cookie', authCookieHeaders(session));
    return json(res, 200, { ok: true, verified: true, aal: 'aal2', expires_in: session.expires_in ?? null });
  } catch (error) {
    return json(res, error?.code === 413 ? 413 : error?.code === 400 ? 400 : 500, {
      ok: false,
      error: error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : error?.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'MFA_VERIFY_UNAVAILABLE',
    });
  }
}
