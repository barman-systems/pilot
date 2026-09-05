import { buildBudgetObservation, exportBudgetObservation, telemetryConfiguration } from './_dabbir-ai-observability.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'feat/langfuse-trigger-observability-pilot') {
    return res.status(404).json({ ok: false, state: 'NOT_AVAILABLE' });
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ ok: false, state: 'METHOD_NOT_ALLOWED' });
  }

  const config = telemetryConfiguration({ ...process.env, DABBIR_TRIGGER_ENABLED: '0' });
  if (!config.ready) {
    return res.status(503).json({ ok: false, state: 'CONFIG_NOT_READY', reason: config.reason });
  }

  const observation = buildBudgetObservation({
    businessId: 'synthetic-preview-smoke-business',
    operationKey: `synthetic-preview-smoke-${Date.now()}`,
    outcome: 'VERIFIED_SUCCESS',
    actualCostUsd: 0,
    metadata: {
      provider: 'vercel-ai-gateway',
      model: 'google/gemini-3.7-flash',
      attempts: [{ provider: 'vercel-ai-gateway', state: 'succeeded' }],
      generation: { prompt_tokens: 0, completion_tokens: 0 },
    },
  });
  const result = await exportBudgetObservation(observation, { timeoutMs: 1800 });
  if (!result.ok) {
    return res.status(502).json({ ok: false, state: 'LANGFUSE_REJECTED', reason: result.reason, status: result.status ?? null });
  }
  return res.status(200).json({ ok: true, state: 'LANGFUSE_ACCEPTED', trace_id: result.traceId });
}
