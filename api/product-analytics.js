// Product analytics milestones are captured from authoritative server/database
// transitions only. This legacy public collector is intentionally retired so a
// browser or external caller cannot manufacture DABBIR activation telemetry.
function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export default function handler(_req, res) {
  return reply(res, 410, { ok: false, error: 'ANALYTICS_SERVER_ONLY' });
}
