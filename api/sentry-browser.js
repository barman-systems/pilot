import { captureBrowserSentryEvent, sentryEnabled } from './_sentry-core.js';
import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';

function safePath(value) {
  try {
    const url = new URL(String(value || ''), 'https://dabbir.invalid');
    return url.pathname.slice(0, 1000);
  } catch {
    return '/';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'FORBIDDEN' });
  if (!sentryEnabled()) return json(res, 503, { ok: false, error: 'SENTRY_NOT_CONFIGURED' });

  try {
    const body = await readJsonBody(req, 12000);
    const accepted = await captureBrowserSentryEvent({
      source: body?.source,
      name: body?.name,
      message: body?.message,
      stack: body?.stack,
      path: safePath(body?.path),
    });
    return json(res, accepted ? 202 : 503, accepted
      ? { ok: true }
      : { ok: false, error: 'SENTRY_DELIVERY_FAILED' });
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_ERROR_EVENT' });
  }
}
