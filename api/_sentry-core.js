import { randomUUID } from 'node:crypto';

const SENTRY_DSN = String(process.env.SENTRY_DSN || '').trim();
const ENVIRONMENT = String(process.env.VERCEL_ENV || process.env.NODE_ENV || 'production').trim();
const RELEASE = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim();
const MAX_STRING = 6000;
const SENSITIVE_KEY = /(^|_)(authorization|cookie|token|secret|password|passwd|api_key|app_secret|phone|mobile|email|message_body|raw_body|raw_payload)($|_)/i;

function clean(value, max = MAX_STRING) {
  return String(value == null ? '' : value)
    .replace(/([?&](?:token|key|secret|code|password|authorization)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .slice(0, max);
}

function safeValue(value, key = '', depth = 0) {
  if (SENSITIVE_KEY.test(String(key))) return '[redacted]';
  if (depth > 6) return '[truncated]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return clean(value, 1200);
  if (Array.isArray(value)) return value.slice(0, 30).map(item => safeValue(item, '', depth + 1));
  if (typeof value === 'object') {
    const safe = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 60)) {
      safe[clean(childKey, 120)] = safeValue(childValue, childKey, depth + 1);
    }
    return safe;
  }
  return clean(value, 1200);
}

function parseDsn() {
  if (!SENTRY_DSN) return null;
  try {
    const url = new URL(SENTRY_DSN);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!url.username || !projectId || !/^https:$/.test(url.protocol)) return null;
    return {
      projectId,
      host: url.host,
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

export function sentryStatus() {
  return {
    enabled: Boolean(dsn),
    environment: ENVIRONMENT || 'production',
    release: RELEASE || null,
    ingest_host: dsn?.host || null,
  };
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

function stackFrames(stack) {
  const lines = clean(stack || '', MAX_STRING).split('\n').slice(1, 41);
  const frames = lines.map(rawLine => {
    const line = rawLine.trim();
    const match = line.match(/^at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
    if (!match) return { filename: clean(line, 500), in_app: true };
    return {
      function: clean(match[1] || '<anonymous>', 200),
      filename: clean(match[2], 500),
      lineno: Number(match[3]) || undefined,
      colno: Number(match[4]) || undefined,
      in_app: /(?:\/|^)api\//.test(match[2]) || /\/var\/task\//.test(match[2]),
    };
  }).filter(frame => frame.filename);
  return frames.length ? frames.reverse() : undefined;
}

async function sendEventDetailed(event) {
  if (!dsn) return { accepted: false, status: 0, event_id: event?.event_id || null };
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
      signal: AbortSignal.timeout(3000),
    });
    return { accepted: response.ok, status: response.status, event_id: event.event_id };
  } catch {
    return { accepted: false, status: 0, event_id: event.event_id };
  }
}

function messageEvent(message, context = {}) {
  const base = baseEvent();
  return {
    ...base,
    level: clean(context.level || 'error', 40),
    message: clean(message, 1000) || 'DABBIR_ERROR',
    logger: clean(context.logger || 'dabbir', 120),
    tags: safeValue({ ...base.tags, ...(context.tags || {}) }),
    extra: context.extra ? safeValue(context.extra) : undefined,
  };
}

export async function captureSentryMessage(message, context = {}) {
  if (!dsn) return false;
  const result = await sendEventDetailed(messageEvent(message, context));
  return result.accepted;
}

export async function captureSentryException(error, context = {}) {
  if (!dsn) return false;
  const err = error instanceof Error ? error : new Error(clean(error, 1000) || 'DABBIR_ERROR');
  const base = baseEvent();
  const frames = stackFrames(err.stack);
  const event = {
    ...base,
    level: clean(context.level || 'error', 40),
    logger: clean(context.logger || 'dabbir', 120),
    tags: safeValue({ ...base.tags, ...(context.tags || {}) }),
    exception: {
      values: [{
        type: clean(err.name || 'Error', 120),
        value: clean(err.message || 'DABBIR_ERROR', 1200),
        stacktrace: frames ? { frames } : undefined,
      }],
    },
    extra: context.extra ? safeValue(context.extra) : undefined,
  };
  const result = await sendEventDetailed(event);
  return result.accepted;
}

export async function captureBrowserSentryEvent(payload = {}) {
  if (!dsn) return false;
  const base = baseEvent();
  const frames = stackFrames(payload.stack);
  const event = {
    ...base,
    platform: 'javascript',
    level: 'error',
    logger: 'dabbir.browser',
    tags: safeValue({ ...base.tags, runtime: 'browser', source: clean(payload.source || 'window', 80) }),
    message: clean(payload.message || 'BROWSER_ERROR', 1200),
    exception: {
      values: [{
        type: clean(payload.name || 'Error', 120),
        value: clean(payload.message || 'BROWSER_ERROR', 1200),
        stacktrace: frames ? { frames } : undefined,
      }],
    },
    request: payload.path ? { url: clean(payload.path, 1000) } : undefined,
  };
  const result = await sendEventDetailed(event);
  return result.accepted;
}

export async function captureSentryPreviewProbe() {
  const event = messageEvent('DABBIR_SENTRY_PREVIEW_PROBE', {
    level: 'info',
    logger: 'dabbir.sentry.probe',
    tags: { source: 'preview_probe', probe: 'transport' },
  });
  return sendEventDetailed(event);
}
