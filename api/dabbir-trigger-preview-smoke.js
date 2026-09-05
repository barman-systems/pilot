import { publishBudgetObservation } from './_dabbir-ai-observability.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'feat/langfuse-trigger-observability-pilot') {
    return res.status(404).json({ ok: false, state: 'NOT_AVAILABLE' });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST');
    return res.status(405).json({ ok: false, state: 'METHOD_NOT_ALLOWED' });
  }
  const env = { ...process.env, DABBIR_LANGFUSE_ENABLED: '1', DABBIR_TRIGGER_ENABLED: '1', DABBIR_TELEMETRY_SAMPLE_RATE: '1' };
  const result = await publishBudgetObservation({
    businessId: 'synthetic-trigger-preview-smoke-business',
    operationKey: `synthetic-trigger-preview-smoke-${Date.now()}`,
    outcome: 'VERIFIED_SUCCESS',
    actualCostUsd: 0,
    metadata: { provider: 'vercel-ai-gateway', model: 'google/gemini-3.7-flash', attempts: [{ provider: 'vercel-ai-gateway', state: 'succeeded' }], generation: { prompt_tokens: 0, completion_tokens: 0 } },
  }, { env, timeoutMs: 1200 });
  const status = result.ok ? 200 : (result.reason === 'TRIGGER_KEY_MISSING' ? 503 : 502);
  return res.status(status).json({ ok: result.ok, state: result.state, reason: result.reason || null, has_run_id: Boolean(result.runId) });
}
