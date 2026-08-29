import ownerCopilotHandler from '../owner-copilot.js';
import { requireNativeBearer } from './_native-core.js';
import { json } from '../_auth-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  }
  if (!requireNativeBearer(req, res)) return;
  return ownerCopilotHandler(req, res);
}
