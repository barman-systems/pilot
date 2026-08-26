import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  readJsonBody,
  readRpcJson,
  requireSameOrigin,
  rpcErrorCode,
  supabaseRpc,
} from '../_auth-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  const accessToken = accessTokenFromRequest(req);
  const user = await getVerifiedUser(accessToken);
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const token = String(body.token || '').trim();
    if (token.length < 32 || token.length > 256) return json(res, 400, { ok: false, error: 'INVALID_INVITATION' });

    const response = await supabaseRpc('dabbir_accept_employee_invitation', accessToken, { p_token: token });
    const payload = await readRpcJson(response);
    if (!response.ok) {
      const code = rpcErrorCode(payload, 'INVITATION_ACCEPT_FAILED');
      const status = code === 'INVITATION_EMAIL_MISMATCH' || code === 'INVITER_NO_LONGER_AUTHORIZED' ? 403 :
        ['INVITATION_NOT_PENDING','MEMBERSHIP_ALREADY_EXISTS'].includes(code) ? 409 :
        code === 'INVITATION_NOT_FOUND' ? 404 : 400;
      return json(res, status, { ok: false, error: code });
    }
    const membership = Array.isArray(payload) ? payload[0] : payload;
    return json(res, 200, { ok: true, membership, invitation_consumed: true });
  } catch (error) {
    return json(res, error?.code === 413 ? 413 : error?.code === 400 ? 400 : 500, {
      ok: false,
      error: error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : error?.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'INVITATION_UNAVAILABLE',
    });
  }
}
