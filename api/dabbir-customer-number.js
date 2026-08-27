import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  supabaseRest,
} from './_auth-core.js';

async function readData(response) {
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const error = new Error('CUSTOMER_NUMBER_LOOKUP_FAILED');
    error.status = Number(response.status || 500);
    throw error;
  }
  return payload;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });

  const accessToken = accessTokenFromRequest(req);
  if (!accessToken) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  try {
    const user = await getVerifiedUser(accessToken);
    if (!user?.id) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

    const rows = await readData(await supabaseRest(
      `dabbir_user_accounts?select=customer_no,created_at&user_id=eq.${user.id}&limit=1`,
      accessToken,
    ));
    const account = Array.isArray(rows) ? rows[0] || null : null;

    return json(res, 200, {
      ok: true,
      customer_no: account?.customer_no || null,
      created_at: account?.created_at || null,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json(res, status === 401 || status === 403 ? status : 503, {
      ok: false,
      error: status === 401 || status === 403 ? 'AUTH_REQUIRED' : 'CUSTOMER_NUMBER_LOOKUP_FAILED',
    });
  }
}
