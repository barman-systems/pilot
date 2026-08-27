import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  supabaseRpc,
} from './_auth-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const accessToken = accessTokenFromRequest(req);
  if (!accessToken) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  const user = await getVerifiedUser(accessToken);
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  try {
    const memberships = await getBusinessMemberships(accessToken);
    if (!memberships.length) {
      return json(res, 404, { ok: false, error: 'DABBIR_MEMBERSHIP_NOT_FOUND' });
    }

    const rpcResponse = await supabaseRpc('dabbir_my_customer_no', accessToken, {});
    const text = await rpcResponse.text();
    let customerNo = null;
    try { customerNo = text ? JSON.parse(text) : null; } catch { customerNo = null; }

    if (!rpcResponse.ok) {
      return json(res, rpcResponse.status === 401 || rpcResponse.status === 403 ? 401 : 500, {
        ok: false,
        error: 'ACCOUNT_NUMBER_LOOKUP_FAILED',
      });
    }
    if (!customerNo) return json(res, 404, { ok: false, error: 'ACCOUNT_NUMBER_NOT_FOUND' });

    return json(res, 200, {
      ok: true,
      customer_no: customerNo,
    });
  } catch {
    return json(res, 503, { ok: false, error: 'ACCOUNT_NUMBER_SERVICE_UNAVAILABLE' });
  }
}
