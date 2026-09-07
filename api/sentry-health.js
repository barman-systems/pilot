import { json } from './_auth-core.js';
import { captureSentryPreviewProbe, sentryStatus } from './_sentry-core.js';

const RUNTIME_FLAG = Symbol.for('dabbir.sentry.runtime.installed');
const PREVIEW_PROBE_FLAG = Symbol.for('dabbir.sentry.preview.probe.sent');

function probeRequested(req) {
  const direct = req?.query?.probe;
  if (direct != null) return String(Array.isArray(direct) ? direct[0] : direct) === '1';
  try {
    const url = new URL(String(req?.url || '/'), 'https://dabbir.invalid');
    return url.searchParams.get('probe') === '1';
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });

  const status = sentryStatus();
  const runtimeInstrumented = Boolean(globalThis[RUNTIME_FLAG]);

  if (probeRequested(req)) {
    if (String(process.env.VERCEL_ENV || '') === 'production') {
      return json(res, 403, { ok: false, error: 'PREVIEW_ONLY' });
    }
    if (globalThis[PREVIEW_PROBE_FLAG]) {
      return json(res, 409, { ok: false, error: 'PROBE_ALREADY_SENT', sentry_enabled: status.enabled, runtime_instrumented: runtimeInstrumented });
    }
    globalThis[PREVIEW_PROBE_FLAG] = true;
    const transport = await captureSentryPreviewProbe();
    return json(res, transport.accepted ? 200 : 503, {
      ok: transport.accepted,
      sentry_enabled: status.enabled,
      runtime_instrumented: runtimeInstrumented,
      environment: status.environment,
      release: status.release,
      ingest_host: status.ingest_host,
      transport_accepted: transport.accepted,
      transport_status: transport.status,
      event_id: transport.event_id,
    });
  }

  return json(res, 200, {
    ok: true,
    sentry_enabled: status.enabled,
    runtime_instrumented: runtimeInstrumented,
    environment: status.environment,
    release: status.release,
    ingest_host: status.ingest_host,
  });
}
