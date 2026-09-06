import { randomUUID } from 'node:crypto';

const SENTRY_DSN = String(process.env.SENTRY_DSN || '').trim();
const ENVIRONMENT = String(process.env.VERCEL_ENV || process.env.NODE_ENV || 'production').trim();
const RELEASE = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim();
const MAX_STRING = 6000;

function clean(value, max = MAX_STRING) {
  return String(value == null ? '' : value)
    .replace(/([?&](?:token|key|secret|code|password|authorization)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .slice(0, max);
}

function parseDsn() {
  if (!SENTRY_DSN) return null;
  try {
    const url = new URL(SENTRY_DSN);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!url.username || !projectId) return null;
    return {
      publicKey: url.username,
      projectId,
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

const dsn = parseDsn();

export function sentryEnabled() {
  return Boolean(dsn);
}

function baseEvent() {
  return {
    event_id: randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    environment: ENVIRONMENT || 'production',
    release: RELEASE || undefined,
    server_name: 'dabbir-vercel',
    tags: { app: 'dabbir', runtime: 'vercel-node' },
  };
}

async function sendEvent(event) {
  if (!dsn) return false;
  const header = JSON.stringify({
    event_id: event.event_id,
    sent_at: new Date().toISOString(),
    dsn: SENTRY_DSN,
  });
  const itemHeader = JSON.stringify({ type: 'event' });
  const body = `${header}\n${itemHeader}\n${JSON.stringify(event)}`;
  try {
    const response = await fetch(dsn.envelopeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body,
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function captureSentryMessage(message, context = {}) {
  if (!dsn) return false;
  const event = {
    ...baseEvent(),
    level: context.level || 'error',
    message: clean(message, 1000) || 'DABBIR_ERROR',
    logger: 'dabbir',
    tags: { ...baseEvent().tags, ...(context.tags || {}) },
    extra: context.extra || undefined,
  };
  return sendEvent(event);
}

export async function captureSentryException(error, context = {}) {
  if (!dsn) return false;
  const err = error instanceof Error ? error : new Error(clean(error, 1000) || 'DABBIR_ERROR');
  const event = {
    ...baseEvent(),
    level: context.level || 'error',
    logger: 'dabbir',
    tags: { ...baseEvent().tags, ...(context.tags || {}) },
    exception: {
      values: [{
        type: clean(err.name || 'Error', 120),
        value: clean(err.message || 'DABBIR_ERROR', 1200),
        stacktrace: err.stack ? { frames: [{ filename: clean(err.stack, MAX_STRING), in_app: true }] } : undefined,
      }],
    },
    extra: context.extra || undefined,
  };
  return sendEvent(event);
}

export async function captureBrowserSentryEvent(payload = {}) {
  if (!dsn) return false;
  const event = {
    ...baseEvent(),
    platform: 'javascript',
    level: 'error',
    logger: 'dabbir.browser',
    tags: { ...baseEvent().tags, runtime: 'browser', source: clean(payload.source || 'window', 80) },
    message: clean(payload.message || 'BROWSER_ERROR', 1200),
    exception: {
      values: [{
        type: clean(payload.name || 'Error', 120),
        value: clean(payload.message || 'BROWSER_ERROR', 1200),
        stacktrace: payload.stack ? { frames: [{ filename: clean(payload.stack, MAX_STRING), in_app: true }] } : undefined,
      }],
    },
    request: payload.path ? { url: clean(payload.path, 1000) } : undefined,
  };
  return sendEvent(event);
}
