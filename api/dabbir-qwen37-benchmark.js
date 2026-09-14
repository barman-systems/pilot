import { requireSameOrigin } from './_auth-core.js';
import { runQwen37Benchmark } from './_dabbir-qwen37-benchmark.js';

const BENCHMARK_SCOPE='qwen37-live-v1';
const BENCHMARK_BRANCH='feat/qwen37-bonsai-intelligence-benchmark-20260914';

function json(res, status, body) {
  return res.status(status).setHeader('cache-control', 'no-store').json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  if (process.env.VERCEL_ENV !== 'preview') return json(res, 403, { ok: false, error: 'PREVIEW_BENCHMARK_ONLY' });
  if (String(process.env.VERCEL_GIT_COMMIT_REF||'') !== BENCHMARK_BRANCH) return json(res, 403, { ok:false, error:'BENCHMARK_BRANCH_MISMATCH' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });
  if (String(req.headers?.['x-dabbir-benchmark-scope']||'') !== BENCHMARK_SCOPE) return json(res,403,{ok:false,error:'BENCHMARK_SCOPE_REQUIRED'});
  if (req.body?.synthetic !== true) return json(res, 403, { ok: false, error: 'SYNTHETIC_MODE_REQUIRED' });

  try {
    const result = await runQwen37Benchmark({ scenario: String(req.body?.scenario || 'critical') });
    return json(res, result.ok ? 200 : 502, {
      ...result,
      service: 'dabbir-qwen37-benchmark',
      access_boundary: 'VERCEL_PROTECTED_PREVIEW_PLUS_SAME_ORIGIN_SYNTHETIC_SCOPE',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const code = String(error?.message || 'QWEN37_BENCHMARK_FAILED');
    const safe = /^(?:QWEN37_BENCHMARK_[A-Z_]+)$/.test(code) ? code : 'QWEN37_BENCHMARK_FAILED';
    return json(res, safe.endsWith('NOT_CONFIGURED') ? 503 : 400, { ok: false, error: safe });
  }
}
