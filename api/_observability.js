import crypto from 'node:crypto';

const FAILURE_CLASSES = new Set([
  'AI','AUTH','AUTHORIZATION','TENANT','DATA','API','WEBHOOK','NETWORK','RATE_LIMIT','TIMEOUT',
  'POLICY','USER_INPUT','EXTERNAL_PROVIDER','SECURITY','UNKNOWN',
]);

const REDACTED='[REDACTED]';
const SENSITIVE_KEY=/(^|_)(authorization|cookie|set_cookie|access_token|refresh_token|id_token|token|secret|password|passwd|api_key|app_secret|phone|phone_number|mobile|email|message|message_body|body|raw_body|raw_payload)($|_)/i;
const EMAIL=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER=/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const JWT=/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const PHONE=/(^|[^A-Za-z0-9])((?:\+\d[\d ()-]{7,}\d)|(?:\d{9,15}))(?=$|[^A-Za-z0-9])/g;

export function correlationId(req) {
  const incoming = String(req?.headers?.['x-correlation-id'] || req?.headers?.['x-request-id'] || '').trim();
  if (/^[A-Za-z0-9._:-]{8,120}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

export function attachCorrelation(res, id) {
  if (id) res.setHeader('x-dabbir-correlation-id', id);
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

function redactString(value){
  return String(value)
    .replace(BEARER,REDACTED)
    .replace(JWT,REDACTED)
    .replace(EMAIL,REDACTED)
    .replace(PHONE,(full,prefix)=>`${prefix}${REDACTED}`);
}

export function redactLogValue(value,key='',depth=0){
  if(SENSITIVE_KEY.test(String(key)))return REDACTED;
  if(depth>8)return '[TRUNCATED_DEPTH]';
  if(value==null||typeof value==='boolean'||typeof value==='number')return value;
  if(typeof value==='string')return redactString(value).slice(0,2000);
  if(Array.isArray(value))return value.slice(0,50).map(item=>redactLogValue(item,'',depth+1));
  if(typeof value==='object'){
    const safe={};
    for(const [childKey,childValue] of Object.entries(value).slice(0,100)){
      safe[childKey]=redactLogValue(childValue,childKey,depth+1);
    }
    return safe;
  }
  return redactString(value);
}

export function redactLogEvent(event={}){
  return redactLogValue(event,'',0);
}

export function logEvent(level, event) {
  const safe = redactLogEvent({
    ts: new Date().toISOString(),
    product: 'DABBIR',
    ...event,
  });
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

export { FAILURE_CLASSES, REDACTED };
