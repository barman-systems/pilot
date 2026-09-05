import { publishBudgetObservation } from './_dabbir-ai-observability.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  if (!result.ok || !result.runId) {
    const status = result.reason === 'TRIGGER_KEY_MISSING' ? 503 : 502;
    return res.status(status).json({ ok: false, state: result.state, reason: result.reason || null });
  }
  let runState = 'UNKNOWN';
  let completed = false;
  for (let i = 0; i < 5; i++) {
    await sleep(i === 0 ? 250 : 500);
    const response = await fetch(`https://api.trigger.dev/api/v3/runs/${encodeURIComponent(result.runId)}`, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { authorization: `Bearer ${env.TRIGGER_SECRET_KEY}` },
      signal: AbortSignal.timeout(1200),
    }).catch(() => null);
    if (!response?.ok) continue;
    const body = await response.json().catch(() => null);
    runState = typeof body?.status === 'string' ? body.status : 'UNKNOWN';
    completed = ['COMPLETED', 'FAILED', 'CRASHED', 'INTERRUPTED', 'SYSTEM_FAILURE', 'CANCELED'].includes(runState);
    if (completed) break;
  }
  return res.status(200).json({ ok: true, state: result.state, run_state: runState, completed });
}
