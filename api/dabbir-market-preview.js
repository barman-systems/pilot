// Retired public demo: keep bookmarked URLs useful without loading a simulation.
export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.statusCode = 405;
    res.setHeader('allow', 'GET, HEAD');
    return res.end();
  }
  res.statusCode = 303;
  res.setHeader('location', '/');
  return res.end();
}
