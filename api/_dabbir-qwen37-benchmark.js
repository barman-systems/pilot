import { probeCognitiveDialogue } from './_dabbir-cognitive-probe.js';
import { interpretSemanticMessage } from './_dabbir-semantic-interpreter.js';
import { SEMANTIC_JSON_SCHEMA } from './_dabbir-semantic-contract.js';

export const QWEN37_BENCHMARK_MODEL = 'alibaba/qwen3.7-flash';
const GATEWAY_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const ALLOWED_SCENARIOS = new Set([
  'critical',
  'correction_side_question',
  'multiple_requests',
  'service_details',
  'context_references',
  'unseen_multi_activity',
]);

export function qwen37BenchmarkEnvironment(env = process.env) {
  const vercelEnv = String(env.VERCEL_ENV || '').trim();
  const apiKey = String(env.AI_GATEWAY_API_KEY || '').trim();
  const oidc = String(env.VERCEL_OIDC_TOKEN || '').trim();
  if (!vercelEnv && !apiKey && !oidc) throw new Error('QWEN37_BENCHMARK_GATEWAY_NOT_CONFIGURED');
  return {
    VERCEL_ENV: vercelEnv || 'preview',
    DABBIR_AI_GATEWAY_MODEL: QWEN37_BENCHMARK_MODEL,
    ...(apiKey ? { AI_GATEWAY_API_KEY: apiKey } : {}),
    ...(oidc ? { VERCEL_OIDC_TOKEN: oidc } : {}),
  };
}

export function qwen37BenchmarkFetch(fetchImpl = fetch) {
  return async (url, options = {}) => {
    if (String(url) !== GATEWAY_ENDPOINT || !options.body) return fetchImpl(url, options);
    let body;
    try { body = JSON.parse(String(options.body)); }
    catch { return fetchImpl(url, options); }
    if (String(body.model || '') !== QWEN37_BENCHMARK_MODEL) throw new Error('QWEN37_BENCHMARK_MODEL_DRIFT');

    // Wave 2: give Qwen the same canonical generation contract that DABBIR
    // already validates, rather than asking for unconstrained JSON. Keep
    // reasoning low (not high/default) so the cheap model still represents a
    // viable production candidate instead of winning by unbounded deliberation.
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'dabbir_semantic_interpretation',
        strict: true,
        schema: SEMANTIC_JSON_SCHEMA,
      },
    };
    body.reasoning = { effort: 'low' };
    body.max_tokens = Math.max(Number(body.max_tokens) || 0, 2400);
    return fetchImpl(url, { ...options, body: JSON.stringify(body) });
  };
}

function providerProof(result) {
  const providers = Array.isArray(result?.providers) ? result.providers : [];
  return providers.length > 0 && providers.every(item =>
    !item?.error
    && item?.provider === 'vercel-ai-gateway'
    && /(?:^|\/)qwen3\.7-flash$/i.test(String(item?.model || ''))
  );
}

export async function runQwen37Benchmark({ scenario = 'critical', env = process.env, fetchImpl = fetch } = {}) {
  if (String(env.VERCEL_ENV || '') === 'production') throw new Error('QWEN37_BENCHMARK_PRODUCTION_FORBIDDEN');
  if (!ALLOWED_SCENARIOS.has(scenario)) throw new Error('QWEN37_BENCHMARK_SCENARIO_NOT_ALLOWED');
  const evaluationEnv = qwen37BenchmarkEnvironment(env);
  const candidateFetch = qwen37BenchmarkFetch(fetchImpl);
  const interpret = args => interpretSemanticMessage({ ...args, env: evaluationEnv, fetchImpl: candidateFetch });
  const result = await probeCognitiveDialogue({ scenario, interpret });
  const isolatedProvider = providerProof(result);
  const safeProviders = (result.providers || []).map(item => ({
    turn: item.turn,
    provider: item.provider || null,
    model: item.model || null,
    latency_ms: Number(item.latency_ms) || 0,
    telemetry: item.telemetry ? {
      latency_ms: Number(item.telemetry.latency_ms) || 0,
      request_count: Number(item.telemetry.request_count) || 0,
      final_request_usage: item.telemetry.final_request_usage || null,
      actual_cost_usd: typeof item.telemetry.actual_cost_usd === 'number' ? item.telemetry.actual_cost_usd : null,
    } : null,
    error: item.error || null,
  }));
  return {
    ok: Boolean(result.ok && isolatedProvider),
    state: result.ok && isolatedProvider ? 'SUCCESS' : 'FAILED',
    benchmark: 'DABBIR_QWEN37_STRICT_LOW_V2',
    model: QWEN37_BENCHMARK_MODEL,
    configuration: 'STRICT_JSON_SCHEMA_LOW_REASONING_2400_MAX',
    scenario,
    isolated_provider: isolatedProvider,
    checks: result.checks || {},
    provider_calls: safeProviders,
    turns: Array.isArray(result.turns) ? result.turns.length : 0,
    external_side_effects: false,
    production_routing_changed: false,
    evidence_scope: 'REAL_QWEN_MODEL_SYNTHETIC_DABBIR_ORCHESTRATOR_NO_DATABASE_OR_WHATSAPP_DELIVERY',
  };
}
