import { json } from '../_auth-core.js';
import runtimeHandler from '../dabbir-runtime-fast.js';
import { requireNativeBearer } from './_native-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  if (!requireNativeBearer(req, res)) return;
  return runtimeHandler(req, res);
}
