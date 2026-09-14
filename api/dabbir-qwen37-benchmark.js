import { accessTokenFromRequest, getVerifiedUser, requireSameOrigin } from './_auth-core.js';
import { runQwen37Benchmark } from './_dabbir-qwen37-benchmark.js';

function json(res, status, body) {
  return res.status(status).setHeader('cache-control', 'no-store').json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  if (process.env.VERCEL_ENV === 'production') return json(res, 403, { ok: false, error: 'PRODUCTION_BENCHMARK_FORBIDDEN' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });
  const user = await getVerifiedUser(accessTokenFromRequest(req));
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });
  if (req.body?.synthetic !== true) return json(res, 403, { ok: false, error: 'SYNTHETIC_MODE_REQUIRED' });

  try {
    const result = await runQwen37Benchmark({ scenario: String(req.body?.scenario || 'critical') });
    return json(res, result.ok ? 200 : 502, {
      ...result,
      service: 'dabbir-qwen37-benchmark',
      requested_by: user.id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const code = String(error?.message || 'QWEN37_BENCHMARK_FAILED');
    const safe = /^(?:QWEN37_BENCHMARK_[A-Z_]+)$/.test(code) ? code : 'QWEN37_BENCHMARK_FAILED';
    return json(res, safe.endsWith('NOT_CONFIGURED') ? 503 : 400, { ok: false, error: safe });
  }
}
