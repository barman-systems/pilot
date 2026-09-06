import { captureBrowserSentryEvent, sentryEnabled } from './_sentry-core.js';
import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';

function safePath(value) {
  try {
    const url = new URL(String(value || ''), 'https://dabbir.invalid');
    return `${url.pathname}${url.hash ? '' : ''}`.slice(0, 1000);
  } catch {
    return '/';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'FORBIDDEN' });
  if (!sentryEnabled()) return json(res, 204, {});

  try {
    const body = await readJsonBody(req, 12000);
    await captureBrowserSentryEvent({
      source: body?.source,
      name: body?.name,
      message: body?.message,
      stack: body?.stack,
      path: safePath(body?.path),
    });
    return json(res, 202, { ok: true });
  } catch {
    return json(res, 202, { ok: true });
  }
}
