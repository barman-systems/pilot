import { json } from './_auth-core.js';
import { sentryStatus } from './_sentry-core.js';

const RUNTIME_FLAG = Symbol.for('dabbir.sentry.runtime.installed');

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });

  const status = sentryStatus();
  return json(res, 200, {
    ok: true,
    sentry_enabled: status.enabled,
    runtime_instrumented: Boolean(globalThis[RUNTIME_FLAG]),
    environment: status.environment,
    release: status.release,
    ingest_host: status.ingest_host,
  });
}
