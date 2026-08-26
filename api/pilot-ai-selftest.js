import { generatePilotAiReply, getPilotAiConfig } from './_ai-core.js';

function json(res, status, body) {
  return res.status(status).setHeader('cache-control', 'no-store').json(body);
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return json(res, 404, { ok: false, error: 'preview_only_ai' });
  }

  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const config = getPilotAiConfig();
  const confirmed = String(req.query?.confirm || '') === '1';

  if (!confirmed) {
    return json(res, 200, {
      ok: true,
      service: 'pilot-ai-selftest',
      configured: config.configured,
      provider: config.provider,
      model: config.model,
      cost_mode: config.cost_mode,
      test_ready: config.configured,
      run_url_suffix: '/api/pilot-ai-selftest?confirm=1',
      data_mode: 'SYNTHETIC_ONLY',
      external_side_effects: false,
    });
  }

  const result = await generatePilotAiReply({
    project: 'pilot_clinics',
    message: 'مرحبا، أريد معرفة كيف يمكنني حجز موعد في العيادة.',
    language: 'ar',
  });

  const status = result.ok ? 200
    : result.state === 'UNCONFIGURED' ? 503
    : result.state === 'RATE_LIMITED' ? 429
    : 502;

  return json(res, status, {
    ...result,
    service: 'pilot-ai-selftest',
    environment: 'PREVIEW_PILOT',
    test_input: 'SYNTHETIC_ARABIC_CLINIC_BOOKING',
    data_mode: 'SYNTHETIC_ONLY',
    external_side_effects: false,
    timestamp: new Date().toISOString(),
  });
}
