import { probeCognitiveDialogue } from './_dabbir-cognitive-probe.js';
import { interpretSemanticMessage } from './_dabbir-semantic-interpreter.js';

export const QWEN35_BENCHMARK_MODEL = 'alibaba/qwen3.5-flash';
const GATEWAY_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const ALLOWED_SCENARIOS = new Set([
  'critical',
  'correction_side_question',
  'multiple_requests',
  'service_details',
  'context_references',
  'unseen_multi_activity',
]);

export function qwen35BenchmarkEnvironment(env = process.env) {
  const vercelEnv = String(env.VERCEL_ENV || '').trim();
  const apiKey = String(env.AI_GATEWAY_API_KEY || '').trim();
  const oidc = String(env.VERCEL_OIDC_TOKEN || '').trim();
  if (!vercelEnv && !apiKey && !oidc) throw new Error('QWEN35_BENCHMARK_GATEWAY_NOT_CONFIGURED');
  return {
    VERCEL_ENV: vercelEnv || 'preview',
    DABBIR_AI_GATEWAY_MODEL: QWEN35_BENCHMARK_MODEL,
    ...(apiKey ? { AI_GATEWAY_API_KEY: apiKey } : {}),
    ...(oidc ? { VERCEL_OIDC_TOKEN: oidc } : {}),
  };
}

export function qwen35BenchmarkFetch(fetchImpl = fetch) {
  return async (url, options = {}) => {
    if (String(url) !== GATEWAY_ENDPOINT || !options.body) return fetchImpl(url, options);
    let body;
    try { body = JSON.parse(String(options.body)); }
    catch { return fetchImpl(url, options); }
    if (String(body.model || '') !== QWEN35_BENCHMARK_MODEL) throw new Error('QWEN35_BENCHMARK_MODEL_DRIFT');

    // Alibaba documents Qwen3.5 Flash structured JSON as reliable in non-thinking
    // mode. Keep DABBIR's existing application validator authoritative; do not
    // weaken entity/reference/span checks to make the candidate pass.
    body.response_format = { type: 'json_object' };
    body.reasoning = { effort: 'none' };
    body.max_tokens = Math.min(1600, Math.max(1, Number(body.max_tokens) || 1600));
    return fetchImpl(url, { ...options, body: JSON.stringify(body) });
  };
}

function providerProof(result) {
  const providers = Array.isArray(result?.providers) ? result.providers : [];
  return providers.length > 0 && providers.every(item =>
    !item?.error
    && item?.provider === 'vercel-ai-gateway'
    && /(?:^|\/)qwen3\.5-flash$/i.test(String(item?.model || ''))
  );
}

export async function runQwen35Benchmark({ scenario = 'critical', env = process.env, fetchImpl = fetch } = {}) {
  if (String(env.VERCEL_ENV || '') === 'production') throw new Error('QWEN35_BENCHMARK_PRODUCTION_FORBIDDEN');
  if (!ALLOWED_SCENARIOS.has(scenario)) throw new Error('QWEN35_BENCHMARK_SCENARIO_NOT_ALLOWED');
  const evaluationEnv = qwen35BenchmarkEnvironment(env);
  const candidateFetch = qwen35BenchmarkFetch(fetchImpl);
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
    benchmark: 'DABBIR_QWEN35_FLASH_JSON_NO_REASONING_V1',
    model: QWEN35_BENCHMARK_MODEL,
    configuration: 'JSON_OBJECT_NO_REASONING_1600_MAX',
    scenario,
    isolated_provider: isolatedProvider,
    checks: result.checks || {},
    provider_calls: safeProviders,
    turns: Array.isArray(result.turns) ? result.turns.length : 0,
    external_side_effects: false,
    production_routing_changed: false,
    evidence_scope: 'REAL_QWEN35_MODEL_SYNTHETIC_DABBIR_ORCHESTRATOR_NO_DATABASE_OR_WHATSAPP_DELIVERY',
  };
}
