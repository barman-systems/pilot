import { accessTokenFromRequest, getVerifiedUser, requireSameOrigin } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import { generateDABBIRAiReply, getDABBIRAiConfig, getDABBIRAiRedundancy } from './_ai-core.js';

function json(res, status, body) {
  return res.status(status).setHeader('cache-control', 'no-store').json(body);
}

function configuredDirectProviders(env = process.env) {
  return [
    env.GEMINI_API_KEY ? 'google-gemini' : null,
    env.GROQ_API_KEY ? 'groq' : null,
    env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID ? 'cloudflare-workers-ai' : null,
  ].filter(Boolean);
}

export default async function handler(req, res) {
  const environment = process.env.VERCEL_ENV === 'production' ? 'PRODUCTION_DABBIR' : 'PREVIEW_DABBIR';

  if (req.method === 'GET') {
    const config = getDABBIRAiConfig();
    const redundancy = getDABBIRAiRedundancy();
    if (String(singleQueryValue(req, 'synthetic') || '') === '1') {
      // Synthetic probes call the real provider. Keep them on the same protected
      // write path as production AI so a public query cannot consume capacity.
      return json(res, 405, { ok: false, error: 'SYNTHETIC_POST_AUTH_REQUIRED' });
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
      configured_provider_count: redundancy.configured_provider_count,
      direct_provider_count: redundancy.direct_provider_count,
      direct_providers: configuredDirectProviders(),
      gateway_fallback_configured: redundancy.gateway_fallback_configured,
      redundancy_ready: redundancy.redundancy_ready,
      data_mode: 'SYNTHETIC_ONLY',
      external_side_effects: false,
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  if (!requireSameOrigin(req)) {
    return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });
  }

  const user = await getVerifiedUser(accessTokenFromRequest(req));
  if (!user) {
    return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });
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
    synthetic_probe: true,
    requested_by: user.id,
    timestamp: new Date().toISOString(),
  });
}
