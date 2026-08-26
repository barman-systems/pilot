import { generatePilotAiReply, getPilotAiConfig } from './_ai-core.js';

function json(res, status, body) {
  return res.status(status).setHeader('cache-control', 'no-store').json(body);
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return json(res, 404, { ok: false, error: 'preview_only_ai' });
  }

  if (req.method === 'GET') {
    const config = getPilotAiConfig();
    return json(res, 200, {
      ok: true,
      service: 'pilot-ai',
      environment: 'PREVIEW_PILOT',
      provider: config.provider,
      model: config.model,
      configured: config.configured,
      cost_mode: config.cost_mode,
      data_mode: 'SYNTHETIC_ONLY',
      external_side_effects: false,
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  if (req.body?.synthetic !== true) {
    return json(res, 403, { ok: false, error: 'synthetic_mode_required' });
  }

  const result = await generatePilotAiReply({
    project: req.body?.project,
    message: req.body?.message,
    language: req.body?.language || 'auto',
  });

  const status = result.ok ? 200
    : result.state === 'UNCONFIGURED' ? 503
    : result.state === 'RATE_LIMITED' ? 429
    : result.state === 'REJECTED' ? 400
    : 502;

  return json(res, status, {
    ...result,
    service: 'pilot-ai',
    environment: 'PREVIEW_PILOT',
    data_mode: 'SYNTHETIC_ONLY',
    external_side_effects: false,
    timestamp: new Date().toISOString(),
  });
}
