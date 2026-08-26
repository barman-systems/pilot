import { generatePilotAiReply } from './_ai-core.js';

const ALLOWED = new Set([
  'inclusionai/ling-3.0-tiny-free',
  'poolside/laguna-s-2.1-free',
  'nvidia/nemotron-3.5-lightning-free',
  'minimax/minimax-m2.7-free',
  'minimax/minimax-m3-free',
]);

export default async function handler(req, res) {
  if (req.method !== 'GET' || req.query?.synthetic !== '1') return res.status(404).json({ ok: false });
  const model = String(req.query?.model || '');
  if (!ALLOWED.has(model)) return res.status(400).json({ ok: false, error: 'model_not_allowed' });
  const started = Date.now();
  const result = await generatePilotAiReply({
    project: 'pilot_businesses',
    message: 'مرحبا، هل يمكنني معرفة حالة طلبي؟',
    language: 'ar',
    businessContext: JSON.stringify({ business: { name: 'Synthetic Store', type: 'store', locale: 'ar-AE' }, knowledge: [] }),
    history: [],
    env: { ...process.env, PILOT_AI_GATEWAY_MODEL: model },
  });
  return res.status(result.ok ? 200 : 502).json({
    ok: result.ok,
    requested_model: model,
    actual_model: result.model,
    state: result.state,
    error: result.error || null,
    elapsed_ms: Date.now() - started,
  });
}
