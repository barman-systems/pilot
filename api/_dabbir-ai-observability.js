import { createHmac } from 'node:crypto';

// Metadata-only pilot. The existing ledger remains authoritative.
export const TELEMETRY_TASK_ID = 'dabbir-export-ai-budget-observation';
const LANGFUSE_ORIGINS = new Set([
  'https://cloud.langfuse.com', 'https://us.cloud.langfuse.com',
  'https://jp.cloud.langfuse.com', 'https://hipaa.cloud.langfuse.com',
]);
const OUTCOMES = new Set(['VERIFIED_SUCCESS', 'FAILED', 'PARTIALLY_COMPLETED', 'CANCELLED', 'BLOCKED']);
const FAILURES = new Set(['AI', 'AUTH', 'AUTHORIZATION', 'TENANT', 'DATA', 'API', 'WEBHOOK', 'NETWORK', 'RATE_LIMIT', 'TIMEOUT', 'POLICY', 'USER_INPUT', 'EXTERNAL_PROVIDER', 'SECURITY', 'UNKNOWN']);
const PROVIDERS = new Set(['google-gemini', 'gemini-direct', 'groq', 'groq-direct', 'cloudflare-workers-ai', 'vercel-gateway', 'vercel-ai-gateway']);
const enabled = value => value === '1' || value === 'true';
const numeric = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
const tokenCount = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000 ? value : null;
const hash = (secret, value) => createHmac('sha256', secret).update(JSON.stringify(value)).digest('hex');
const modelName = value => typeof value === 'string' && /^(?:(?:google|openai|anthropic|meta-llama|qwen|minimax)\/)?(?:gemini|llama|gpt|qwen|glm|minimax|claude|deepseek|mistral|mixtral)[a-z0-9._/-]{0,140}$/i.test(value) ? value : null;

export function telemetryConfiguration(env = process.env) {
  const active = enabled(env.DABBIR_LANGFUSE_ENABLED);
  const origin = String(env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com').replace(/\/$/, '');
  const credentials = /^pk-lf-[A-Za-z0-9_-]{8,}$/.test(env.LANGFUSE_PUBLIC_KEY || '') && /^sk-lf-[A-Za-z0-9_-]{8,}$/.test(env.LANGFUSE_SECRET_KEY || '');
  const trigger = enabled(env.DABBIR_TRIGGER_ENABLED);
  const triggerKey = /^tr_(dev|prod|stg)_[A-Za-z0-9_-]{8,}$/.test(env.TRIGGER_SECRET_KEY || '');
  const requestedRate = env.DABBIR_TELEMETRY_SAMPLE_RATE == null ? 0.1 : Number(env.DABBIR_TELEMETRY_SAMPLE_RATE);
  const rate = Number.isFinite(requestedRate) ? Math.max(0, Math.min(1, requestedRate)) : 0;
  const reason = !active ? 'DISABLED' : !LANGFUSE_ORIGINS.has(origin) ? 'INVALID_LANGFUSE_ORIGIN' : !credentials ? 'LANGFUSE_KEYS_MISSING' : trigger && !triggerKey ? 'TRIGGER_KEY_MISSING' : null;
  return { enabled: active, ready: !reason, reason, origin, transport: trigger ? 'trigger' : 'direct', sampleRate: rate };
}

export function buildBudgetObservation(input, env = process.env, now = Date.now()) {
  if (!input || typeof input.businessId !== 'string' || !input.businessId || typeof input.operationKey !== 'string' || !input.operationKey || !env.LANGFUSE_SECRET_KEY || !Number.isSafeInteger(now) || now < 0) return null;
  const traceId = hash(env.LANGFUSE_SECRET_KEY, ['dabbir-budget-v1', input.businessId, input.operationKey]).slice(0, 32);
  const outcome = OUTCOMES.has(input.outcome) ? input.outcome : 'UNKNOWN';
  const meta = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  const generation = meta.generation && typeof meta.generation === 'object' ? meta.generation : {};
  return {
    version: 1,
    traceId,
    spanId: hash(env.LANGFUSE_SECRET_KEY, ['dabbir-budget-event-v1', traceId, outcome]).slice(0, 16),
    timestampMs: now,
    environment: ['production', 'preview', 'development'].includes(env.VERCEL_ENV) ? env.VERCEL_ENV : 'development',
    outcome,
    failureClass: FAILURES.has(input.failureClass) ? input.failureClass : null,
    provider: PROVIDERS.has(meta.provider) ? meta.provider : null,
    model: modelName(meta.model || generation.model),
    actualCostUsd: numeric(input.actualCostUsd, 100_000),
    promptTokens: tokenCount(generation.prompt_tokens),
    completionTokens: tokenCount(generation.completion_tokens),
    attempts: Array.isArray(meta.attempts) ? Math.min(20, meta.attempts.length) : null,
  };
}

// Reconstruct an allowlisted payload at the worker boundary; never spread input.
export function validateBudgetObservation(value) {
  if (!value || value.version !== 1 || !/^[a-f0-9]{32}$/.test(value.traceId || '') || !/^[a-f0-9]{16}$/.test(value.spanId || '') || !Number.isSafeInteger(value.timestampMs) || value.timestampMs < 0 || value.timestampMs > 8_640_000_000_000_000 || !['production', 'preview', 'development'].includes(value.environment) || ![...OUTCOMES, 'UNKNOWN'].includes(value.outcome)) return null;
  return {
    version: 1, traceId: value.traceId, spanId: value.spanId, timestampMs: value.timestampMs,
    environment: value.environment, outcome: value.outcome,
    failureClass: FAILURES.has(value.failureClass) ? value.failureClass : null,
    provider: PROVIDERS.has(value.provider) ? value.provider : null,
    model: modelName(value.model), actualCostUsd: numeric(value.actualCostUsd, 100_000),
    promptTokens: tokenCount(value.promptTokens), completionTokens: tokenCount(value.completionTokens),
    attempts: Number.isInteger(value.attempts) && value.attempts >= 0 && value.attempts <= 20 ? value.attempts : null,
  };
}

export function observationOtlpPayload(observation) {
  const item = validateBudgetObservation(observation);
  if (!item) throw new Error('INVALID_TELEMETRY_PAYLOAD');
  const attributes = [
    ['langfuse.trace.name', 'dabbir.ai-budget.finalized'],
    ['langfuse.observation.type', 'event'],
    ['langfuse.environment', item.environment],
    ['langfuse.observation.level', item.outcome === 'FAILED' ? 'ERROR' : 'DEFAULT'],
    ['langfuse.trace.metadata.scope', 'budget_ledger_not_business_execution'],
    ['langfuse.observation.metadata.timing_source', 'ledger_finalization_not_model_latency'],
    ['langfuse.observation.metadata.outcome', item.outcome],
    ['langfuse.observation.metadata.failure_class', item.failureClass],
    ['langfuse.observation.metadata.provider', item.provider],
    ['langfuse.observation.metadata.model', item.model],
    ['langfuse.observation.metadata.actual_cost_usd', item.actualCostUsd],
    ['langfuse.observation.metadata.prompt_tokens', item.promptTokens],
    ['langfuse.observation.metadata.completion_tokens', item.completionTokens],
    ['langfuse.observation.metadata.attempts', item.attempts],
  ].filter(([, value]) => value != null).map(([key, value]) => ({ key, value: { stringValue: String(value) } }));
  const timestamp = String(BigInt(item.timestampMs) * 1_000_000n);
  return { resourceSpans: [{
    resource: { attributes: [{ key: 'service.name', value: { stringValue: 'dabbir' } }] },
    scopeSpans: [{ scope: { name: 'dabbir.budget-observability', version: '1.0.0' }, spans: [{
      traceId: item.traceId, spanId: item.spanId, name: 'dabbir.ai-budget.finalized', kind: 1,
      startTimeUnixNano: timestamp, endTimeUnixNano: timestamp, attributes,
      status: { code: item.outcome === 'FAILED' ? 2 : 0 },
    }] }],
  }] };
}

async function postJson(url, headers, body, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
        if (!response.ok) return { ok: false, status: response.status, retryable: response.status === 429 || response.status >= 500, reason: 'HTTP_REJECTED' };
        const payload = await response.json();
        return { ok: true, status: response.status, payload };
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('TELEMETRY_TIMEOUT')); }, timeoutMs); }),
    ]);
  } catch {
    return { ok: false, status: null, retryable: true, reason: 'NETWORK_OR_TIMEOUT' };
  } finally { clearTimeout(timer); }
}

export async function exportBudgetObservation(observation, { env = process.env, fetchImpl = fetch, timeoutMs = 2_000 } = {}) {
  const config = telemetryConfiguration({ ...env, DABBIR_TRIGGER_ENABLED: '0' });
  if (!config.ready) return { ok: false, retryable: false, reason: config.reason };
  const item = validateBudgetObservation(observation);
  if (!item) return { ok: false, retryable: false, reason: 'INVALID_TELEMETRY_PAYLOAD' };
  const result = await postJson(`${config.origin}/api/public/otel/v1/traces`, {
    authorization: `Basic ${Buffer.from(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`).toString('base64')}`,
    'x-langfuse-ingestion-version': '4',
  }, observationOtlpPayload(item), fetchImpl, Math.min(2_000, Math.max(1, timeoutMs)));
  if (!result.ok) return { ok: false, retryable: result.retryable, reason: result.reason, status: result.status };
  if (!result.payload || typeof result.payload !== 'object' || Array.isArray(result.payload)) return { ok: false, retryable: false, reason: 'INVALID_OTLP_RESPONSE' };
  if (Number(result.payload.partialSuccess?.rejectedSpans || 0) > 0 || result.payload.partialSuccess?.errorMessage) return { ok: false, retryable: false, reason: 'OTLP_PARTIAL_REJECTION' };
  return { ok: true, state: 'ACCEPTED', traceId: item.traceId };
}

export async function publishBudgetObservation(input, { env = process.env, fetchImpl = fetch, now = Date.now(), timeoutMs = 750 } = {}) {
  try {
    const config = telemetryConfiguration(env);
    if (!config.ready) return { ok: false, state: 'SKIPPED', reason: config.reason };
    const item = buildBudgetObservation(input, env, now);
    if (!item) return { ok: false, state: 'SKIPPED', reason: 'INVALID_TELEMETRY_INPUT' };
    const sample = parseInt(item.traceId.slice(0, 8), 16) / 0x1_0000_0000;
    if (sample >= config.sampleRate) return { ok: false, state: 'SKIPPED', reason: 'SAMPLED_OUT' };
    const boundedTimeout = Math.min(750, Math.max(1, timeoutMs));
    if (config.transport === 'direct') return await exportBudgetObservation(item, { env, fetchImpl, timeoutMs: boundedTimeout });
    const result = await postJson(`https://api.trigger.dev/api/v1/tasks/${TELEMETRY_TASK_ID}/trigger`, {
      authorization: `Bearer ${env.TRIGGER_SECRET_KEY}`,
    }, { payload: item, options: { idempotencyKey: `budget-${item.traceId}-${item.spanId}`, ttl: '1h' } }, fetchImpl, boundedTimeout);
    if (!result.ok) return { ok: false, state: 'NOT_CONFIRMED', reason: result.reason };
    if (!/^run_[A-Za-z0-9_-]+$/.test(result.payload?.id || '')) return { ok: false, state: 'NOT_CONFIRMED', reason: 'INVALID_TRIGGER_RESPONSE' };
    return { ok: true, state: 'QUEUED', runId: result.payload.id, traceId: item.traceId };
  } catch { return { ok: false, state: 'SKIPPED', reason: 'TELEMETRY_UNAVAILABLE' }; }
}
