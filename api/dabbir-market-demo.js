// The public simulation is retired. Stale pages must never execute it.
export default function handler(req, res) {
  res.statusCode = 410;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  return res.end(req.method === 'HEAD' ? '' : JSON.stringify({ ok: false, error: 'DEMO_RETIRED' }));
}
