import { json } from './_auth-core.js';
import { sentryEnabled } from './_sentry-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  return json(res, 200, { ok: true, sentry_enabled: sentryEnabled() });
}
