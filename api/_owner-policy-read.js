// Only use for the owner's read-only policy sources, after tenant authorization.
// Mutations must never enter this retry path.
const TRANSIENT_STATUS = new Set([429, 502, 503, 504]);
const TRANSIENT_CODES = new Set(['40001', '40P01', '57014', '53300', '08006']);
const SAFE_CODES = new Set([...TRANSIENT_CODES, '42501', '42P01', '42883', 'PGRST202', 'PGRST301', 'PGRST302']);
const AUTH_CODES = new Set(['AUTH_REQUIRED', 'OWNER_REQUIRED', 'DABBIR_ACCOUNT_SUSPENDED']);
const SOURCES = new Set(['candidates', 'policies', 'audit']);

export async function readOwnerPolicyRows(request, source, {
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  log = (event, details) => console.warn(event, details),
} = {}) {
  if (!SOURCES.has(source)) throw new Error('INVALID_POLICY_READ_SOURCE');
  for (let attempt = 1; attempt <= 2; attempt++) {
    let upstreamStatus = 0, code = 'NETWORK_FAILURE', retryable = false;
    try {
      const response = await request(AbortSignal.timeout(4000));
      upstreamStatus = response.status;
      const payload = await response.json().catch(() => null);
      if (response.ok && Array.isArray(payload)) return payload;
      code = AUTH_CODES.has(payload?.message) ? payload.message : SAFE_CODES.has(payload?.code) ? payload.code : response.ok ? 'INVALID_RESPONSE' : 'UPSTREAM_REJECTED';
      retryable = TRANSIENT_STATUS.has(upstreamStatus) || TRANSIENT_CODES.has(code);
    } catch (error) {
      retryable = error instanceof TypeError || ['AbortError', 'TimeoutError'].includes(error?.name);
      code = retryable ? 'NETWORK_FAILURE' : 'READ_FAILED';
    }
    if (retryable && attempt === 1) { await wait(150); continue; }
    const status = upstreamStatus === 401 || code === 'AUTH_REQUIRED' ? 401 : upstreamStatus === 403 || code === '42501' || AUTH_CODES.has(code) ? 403 : retryable ? 503 : 502;
    log('dabbir_owner_policy_read_failed', { source, upstream_status: upstreamStatus, status, code, attempt });
    throw Object.assign(new Error('OWNER_POLICY_READ_UNAVAILABLE'), { status });
  }
}
