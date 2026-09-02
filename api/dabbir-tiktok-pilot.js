export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    return res.end('METHOD_NOT_ALLOWED');
  }
  const rawUrl = String(req.url || '');
  const queryIndex = rawUrl.indexOf('?');
  const query = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';
  res.statusCode = 308;
  res.setHeader('cache-control', 'no-store');
  res.setHeader('location', `/api/dabbir-tiktok${query}`);
  res.end();
}
