import crypto from 'node:crypto';

const FAILURE_CLASSES = new Set([
  'AI','AUTH','AUTHORIZATION','TENANT','DATA','API','WEBHOOK','NETWORK','RATE_LIMIT','TIMEOUT',
  'POLICY','USER_INPUT','EXTERNAL_PROVIDER','SECURITY','UNKNOWN',
]);

export function correlationId(req) {
  const incoming = String(req?.headers?.['x-correlation-id'] || req?.headers?.['x-request-id'] || '').trim();
  if (/^[A-Za-z0-9._:-]{8,120}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

export function attachCorrelation(res, id) {
  if (id) res.setHeader('x-pilot-correlation-id', id);
}

export function classifyFailure(error, fallback = 'UNKNOWN') {
  const status = Number(error?.statusCode || error?.status || error?.cause?.statusCode || 0);
  const message = String(error?.message || error?.name || error?.cause?.message || '').toLowerCase();

  // Provider/gateway denials can use HTTP 401/403 even when the application credential is fine.
  // Preserve the operational root cause before applying generic HTTP auth classification.
  if (/gateway|provider|model|restrictedmodels|no_providers_available/.test(message)) return 'EXTERNAL_PROVIDER';
  if (status === 429 || /rate.?limit/.test(message)) return 'RATE_LIMIT';
  if (status === 408 || status === 504 || /timeout/.test(message)) return 'TIMEOUT';
  if (/network|fetch failed|econn/.test(message)) return 'NETWORK';
  if (status === 401 || status === 403 || /auth|credential|unauthor/.test(message)) return 'AUTH';
  return FAILURE_CLASSES.has(fallback) ? fallback : 'UNKNOWN';
}

export function logEvent(level, event) {
  const safe = {
    ts: new Date().toISOString(),
    product: 'PILOT',
    ...event,
  };
  // Never log message bodies, access tokens, refresh tokens, secrets, phone numbers or emails here.
  const line = JSON.stringify(safe);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function operationalResult({ correlation_id, operation, outcome, failure_class = null, verified = false, retryable = false }) {
  return {
    correlation_id,
    operation,
    outcome,
    failure_class: failure_class && FAILURE_CLASSES.has(failure_class) ? failure_class : null,
    verified,
    retryable,
  };
}

export { FAILURE_CLASSES };
