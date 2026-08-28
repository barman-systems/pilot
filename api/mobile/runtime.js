import { accessTokenFromRequest, getVerifiedUser, json } from '../_auth-core.js';
import runtimeHandler from '../dabbir-runtime-fast.js';
import { requireNativeBearer } from './_native-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  if (!requireNativeBearer(req, res)) return;

  const token = accessTokenFromRequest(req);
  const user = token ? await getVerifiedUser(token).catch(() => null) : null;
  if (!user) return json(res, 401, { ok: false, authenticated: false, error: 'AUTH_REQUIRED' });

  return runtimeHandler(req, res);
}
