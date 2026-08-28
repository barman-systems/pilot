import { json, supabaseAuth } from '../../_auth-core.js';
import { bearerToken } from '../_native-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  const token = bearerToken(req);
  if (!token) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });
  const response = await supabaseAuth('/auth/v1/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' }).catch(() => null);
  if (response && !response.ok && response.status !== 401) return json(res, 503, { ok: false, error: 'LOGOUT_UNAVAILABLE' });
  return json(res, 200, { ok: true });
}
