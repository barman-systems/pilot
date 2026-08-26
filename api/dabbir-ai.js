import { generateDABBIRAiReply, getDABBIRAiConfig } from './_ai-core.js';

function json(res, status, body) {
  return res.status(status).setHeader('cache-control', 'no-store').json(body);
}

export default async function handler(req, res) {
  const environment = process.env.VERCEL_ENV === 'production' ? 'PRODUCTION_DABBIR' : 'PREVIEW_DABBIR';

  if (req.method === 'GET') {
    const config = getDABBIRAiConfig();
    if (String(req.query?.synthetic || '') === '1') {
      const result = await generateDABBIRAiReply({
        project: 'dabbir_clinics',
        message: 'هلا، ابا موعد باجر العصر',
        language: 'ar',
      });
      const status = result.ok ? 200
        : result.state === 'UNCONFIGURED' ? 503
        : result.state === 'RATE_LIMITED' ? 429
        : 502;
      return json(res, status, {
        ...result,
        service: 'dabbir-ai',
        environment,
        data_mode: 'SYNTHETIC_ONLY',
        external_side_effects: false,
        synthetic_probe: true,
      });
    }

    return json(res, 200, {
      ok: true,
      service: 'dabbir-ai',
      environment,
      provider: config.provider,
      model: config.model,
      configured: config.configured,
      auth_mode: config.auth_mode,
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

  const result = await generateDABBIRAiReply({
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
    service: 'dabbir-ai',
    environment,
    data_mode: 'SYNTHETIC_ONLY',
    external_side_effects: false,
    timestamp: new Date().toISOString(),
  });
}
