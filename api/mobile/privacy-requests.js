import { json } from '../_auth-core.js';
import privacyRequestsHandler from '../privacy/requests.js';
import { requireNativeBearer } from './_native-core.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET, POST' });
  if (!requireNativeBearer(req, res)) return;
  return privacyRequestsHandler(req, res);
}
