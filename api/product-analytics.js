const HOST = String(process.env.POSTHOG_HOST || 'https://eu.i.posthog.com').trim().replace(/\/$/, '');
const TOKEN = String(process.env.POSTHOG_PROJECT_TOKEN || '').trim();
const ALLOWED_EVENTS = new Set([
  'signup_completed',
  'business_setup_completed',
  'first_request_received',
  'first_action_completed',
  'returning_user',
]);
const ALLOWED_PROPERTIES = new Set(['activity_type', 'channel', 'action_type', 'setup_version']);

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function safeProperties(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_PROPERTIES.has(key)) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    output[key] = typeof value === 'string' ? value.slice(0, 120) : value;
  }
  return output;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return reply(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  if (!TOKEN || !HOST) return reply(res, 503, { ok: false, error: 'ANALYTICS_DISABLED' });

  const event = String(req.body?.event || '').trim();
  if (!ALLOWED_EVENTS.has(event)) return reply(res, 400, { ok: false, error: 'EVENT_NOT_ALLOWED' });

  // Deliberately use an installation-scoped anonymous ID supplied by the app.
  // Never accept email, phone, name, message text, booking details, cookies, or arbitrary properties.
  const distinctId = String(req.body?.anonymous_id || '').trim().slice(0, 128);
  if (!distinctId || !/^[A-Za-z0-9._:-]+$/.test(distinctId)) {
    return reply(res, 400, { ok: false, error: 'ANONYMOUS_ID_REQUIRED' });
  }

  try {
    const response = await fetch(`${HOST}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: TOKEN,
        event,
        distinct_id: distinctId,
        properties: {
          $process_person_profile: false,
          ...safeProperties(req.body?.properties),
        },
      }),
    });
    if (!response.ok) return reply(res, 502, { ok: false, error: 'ANALYTICS_DELIVERY_FAILED' });
    return reply(res, 202, { ok: true });
  } catch {
    return reply(res, 502, { ok: false, error: 'ANALYTICS_DELIVERY_FAILED' });
  }
}
