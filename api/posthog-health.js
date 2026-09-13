const HOST = String(process.env.POSTHOG_HOST || 'https://eu.i.posthog.com').trim().replace(/\/$/, '');
const TOKEN = String(process.env.POSTHOG_PROJECT_TOKEN || '').trim();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const enabled = Boolean(TOKEN && HOST);
  if (!enabled) return json(res, 503, { ok: false, posthog_enabled: false });

  // Send one anonymous deployment verification event. No user/customer data,
  // cookies, IP-derived properties, session replay, or autocapture is used.
  try {
    const response = await fetch(`${HOST}/capture/`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: TOKEN,
        event: 'dabbir_analytics_verified',
        distinct_id: 'dabbir-production',
        properties: {
          $process_person_profile: false,
          source: 'production_health',
          environment: String(process.env.VERCEL_ENV || 'production'),
          release: String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 40),
        },
      }),
    });
    if (!response.ok) return json(res, 502, { ok: false, posthog_enabled: true, delivery: false });
  } catch {
    return json(res, 502, { ok: false, posthog_enabled: true, delivery: false });
  }

  if (req.method === 'HEAD') {
    res.statusCode = 204;
    res.end();
    return;
  }
  return json(res, 200, { ok: true, posthog_enabled: true, delivery: true });
}
