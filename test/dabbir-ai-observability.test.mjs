import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBudgetObservation, exportBudgetObservation, observationOtlpPayload, publishBudgetObservation, telemetryConfiguration, validateBudgetObservation } from '../api/_dabbir-ai-observability.js';

const env = { DABBIR_LANGFUSE_ENABLED: '1', LANGFUSE_PUBLIC_KEY: 'pk-lf-testpublic12345', LANGFUSE_SECRET_KEY: 'sk-lf-testsecret12345', DABBIR_TELEMETRY_SAMPLE_RATE: '1', VERCEL_ENV: 'preview' };
const input = { businessId: 'private-business-id', operationKey: 'private-operation-id', outcome: 'VERIFIED_SUCCESS', actualCostUsd: 0.004, metadata: { provider: 'gemini-direct', model: 'gemini-3.7-flash', attempts: [{ provider: 'gemini-direct', state: 'succeeded' }], generation: { prompt_tokens: 30, completion_tokens: 10 } } };
const now = 1_788_627_600_000;
const reply = (payload = {}, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const event = () => buildBudgetObservation(input, env, now);

// These are synthetic payloads, not production calls.
test('disabled by default and does not perform network requests', async () => {
  const result = await publishBudgetObservation(input, { env: {}, fetchImpl: () => assert.fail('unexpected network') });
  assert.equal(result.reason, 'DISABLED');
});
test('missing Langfuse credentials fail closed for the exporter', () => {
  assert.equal(telemetryConfiguration({ DABBIR_LANGFUSE_ENABLED: '1' }).reason, 'LANGFUSE_KEYS_MISSING');
});
test('enabling Trigger without its key does not switch silently to direct export', async () => {
  const result = await publishBudgetObservation(input, { env: { ...env, DABBIR_TRIGGER_ENABLED: '1' }, fetchImpl: () => assert.fail('unexpected network') });
  assert.equal(result.reason, 'TRIGGER_KEY_MISSING');
});
for (const origin of ['http://cloud.langfuse.com', 'https://cloud.langfuse.com.evil.test', 'https://cloud.langfuse.com/path', 'https://cloud.langfuse.com?token=secret', 'https://localhost', 'https://user@cloud.langfuse.com']) {
  test(`rejects unapproved origin ${origin}`, () => {
    assert.equal(telemetryConfiguration({ ...env, LANGFUSE_BASE_URL: origin }).reason, 'INVALID_LANGFUSE_ORIGIN');
  });
}
test('explicit approved region is retained', () => {
  assert.equal(telemetryConfiguration({ ...env, LANGFUSE_BASE_URL: 'https://us.cloud.langfuse.com/' }).origin, 'https://us.cloud.langfuse.com');
});
test('allowlist strips customer messages, raw data, errors and identifiers', () => {
  const malicious = { ...input, customerPhone: '+971501234567', prompt: 'private prompt', metadata: { ...input.metadata, email: 'customer@example.com', error: 'Bearer private-token', raw: 'private-record', attempts: [{ error: 'customer-secret' }] } };
  const result = JSON.stringify(buildBudgetObservation(malicious, env, now));
  for (const forbidden of ['private-business-id', 'private-operation-id', 'private prompt', 'customer@example.com', 'private-token', 'private-record', 'customer-secret', '+971501234567']) assert.ok(!result.includes(forbidden));
});
test('identifiers are deterministic and tenant-scoped', () => {
  assert.deepEqual(event(), event());
  assert.notEqual(event().traceId, buildBudgetObservation({ ...input, businessId: 'another-business' }, env, now).traceId);
  assert.notEqual(event().traceId, buildBudgetObservation(input, { ...env, LANGFUSE_SECRET_KEY: 'another-secret' }, now).traceId);
});
test('unknown costs and tokens stay null instead of becoming zero', () => {
  const result = buildBudgetObservation({ ...input, actualCostUsd: null, metadata: {} }, env, now);
  assert.equal(result.actualCostUsd, null);
  assert.equal(result.promptTokens, null);
  assert.equal(result.completionTokens, null);
});
test('known zero cost remains an actual zero', () => {
  assert.equal(buildBudgetObservation({ ...input, actualCostUsd: 0 }, env, now).actualCostUsd, 0);
});
test('invalid numerics, free text provider and model are removed', () => {
  const result = buildBudgetObservation({ ...input, actualCostUsd: NaN, metadata: { provider: 'customer-name', model: 'customer@example.com', generation: { prompt_tokens: -1, completion_tokens: '10' } } }, env, now);
  assert.equal(result.actualCostUsd, null); assert.equal(result.provider, null); assert.equal(result.model, null); assert.equal(result.promptTokens, null); assert.equal(result.completionTokens, null);
});
test('worker boundary reconstructs allowlist and rejects malformed identity', () => {
  assert.equal(validateBudgetObservation({ ...event(), traceId: 'wrong' }), null);
  assert.ok(!('extra' in validateBudgetObservation({ ...event(), extra: 'secret' })));
});
test('OTLP event does not invent model duration, booking success or model cost', () => {
  const span = observationOtlpPayload(event()).resourceSpans[0].scopeSpans[0].spans[0];
  assert.equal(span.startTimeUnixNano, span.endTimeUnixNano);
  const attrs = Object.fromEntries(span.attributes.map(x => [x.key, x.value.stringValue]));
  assert.equal(attrs['langfuse.observation.type'], 'event');
  assert.equal(attrs['langfuse.trace.metadata.scope'], 'budget_ledger_not_business_execution');
  assert.equal(attrs['langfuse.observation.metadata.actual_cost_usd'], '0.004');
  assert.equal(attrs['langfuse.observation.cost_details'], undefined);
});
test('direct export uses v4 OTLP, Basic auth, bounded signal and no redirects', async () => {
  const result = await publishBudgetObservation(input, { env, now, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://cloud.langfuse.com/api/public/otel/v1/traces');
    assert.equal(options.headers['x-langfuse-ingestion-version'], '4');
    assert.match(options.headers.authorization, /^Basic /);
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    assert.equal(JSON.parse(options.body).resourceSpans.length, 1);
    return reply();
  } });
  assert.equal(result.state, 'ACCEPTED');
});
test('zero sampling makes no network request', async () => {
  assert.equal((await publishBudgetObservation(input, { env: { ...env, DABBIR_TELEMETRY_SAMPLE_RATE: '0' }, fetchImpl: () => assert.fail('unexpected network') })).reason, 'SAMPLED_OUT');
});
test('invalid sample rate disables sending and default is ten percent', () => {
  assert.equal(telemetryConfiguration({ ...env, DABBIR_TELEMETRY_SAMPLE_RATE: 'bad' }).sampleRate, 0);
  const { DABBIR_TELEMETRY_SAMPLE_RATE, ...rest } = env;
  assert.equal(telemetryConfiguration(rest).sampleRate, 0.1);
});
test('Trigger queues only a sanitized payload with an idempotency key', async () => {
  const result = await publishBudgetObservation(input, { env: { ...env, DABBIR_TRIGGER_ENABLED: '1', TRIGGER_SECRET_KEY: 'tr_dev_testtrigger123' }, now, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.trigger.dev/api/v1/tasks/dabbir-export-ai-budget-observation/trigger');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.payload, event());
    assert.equal(body.options.idempotencyKey, `budget-${event().traceId}-${event().spanId}`);
    assert.equal(body.options.ttl, '1h');
    assert.ok(!options.body.includes(env.LANGFUSE_SECRET_KEY));
    return reply({ id: 'run_test123' });
  } });
  assert.equal(result.state, 'QUEUED');
});
test('ambiguous Trigger result never claims queued or performs a direct fallback', async () => {
  let calls = 0;
  const result = await publishBudgetObservation(input, { env: { ...env, DABBIR_TRIGGER_ENABLED: '1', TRIGGER_SECRET_KEY: 'tr_dev_testtrigger123' }, fetchImpl: async () => { calls++; return reply({}); } });
  assert.equal(result.state, 'NOT_CONFIRMED'); assert.equal(calls, 1);
});
test('provider rejection does not leak response text or throw into the request', async () => {
  const result = await publishBudgetObservation(input, { env, fetchImpl: async () => reply({ error: 'private-data' }, 503) });
  assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes('private-data'));
});
test('authentication rejection is not retryable', async () => {
  assert.equal((await exportBudgetObservation(event(), { env, fetchImpl: async () => reply({}, 401) })).retryable, false);
});
test('rate limit is retryable in the isolated worker', async () => {
  assert.equal((await exportBudgetObservation(event(), { env, fetchImpl: async () => reply({}, 429) })).retryable, true);
});
test('partial OTLP rejection is not reported as success and is not retried', async () => {
  const result = await exportBudgetObservation(event(), { env, fetchImpl: async () => reply({ partialSuccess: { rejectedSpans: '1', errorMessage: 'secret-error' } }) });
  assert.equal(result.reason, 'OTLP_PARTIAL_REJECTION'); assert.equal(result.retryable, false);
  assert.ok(!JSON.stringify(result).includes('secret-error'));
});
test('timeout is bounded even when a mock transport does not honor cancellation', async () => {
  const start = Date.now();
  const result = await publishBudgetObservation(input, { env, timeoutMs: 10, fetchImpl: () => new Promise(() => {}) });
  assert.equal(result.ok, false); assert.ok(Date.now() - start < 1_000);
});
test('a synchronous network exception is contained', async () => {
  const result = await publishBudgetObservation(input, { env, fetchImpl: () => { throw new Error('contains-secret'); } });
  assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes('contains-secret'));
});
test('invalid payload is refused before the exporter calls the network', async () => {
  const result = await exportBudgetObservation({ ...event(), timestampMs: Infinity }, { env, fetchImpl: () => assert.fail('unexpected network') });
  assert.equal(result.reason, 'INVALID_TELEMETRY_PAYLOAD');
});
