import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENTS = new Set([
  'workspace_first_value',
  'search_opened',
  'search_result_opened',
  'preferences_saved',
  'feedback_submitted',
  'tour_started',
  'tour_completed',
  'conversation_created',
  'appointment_created',
  'load_error_shown',
]);
const CONTEXT_KEYS = new Set(['screen', 'language', 'viewport', 'release', 'item_type']);

function safeContext(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  for (const [key, raw] of Object.entries(source)) {
    if (!CONTEXT_KEYS.has(key)) continue;
    const text = String(raw ?? '').slice(0, 80);
    if (text) result[key] = text;
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const token = accessTokenFromRequest(req);
    const user = await getVerifiedUser(token);
    if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

    const body = await readJsonBody(req, 4096);
    const businessId = String(body.business_id || '');
    const eventName = String(body.event_name || '');
    const duration = body.duration_ms == null ? null : Number(body.duration_ms);
    if (!UUID_RE.test(businessId)) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    if (!EVENTS.has(eventName)) return json(res, 400, { ok: false, error: 'INVALID_EVENT' });
    if (duration !== null && (!Number.isInteger(duration) || duration < 0 || duration > 86400000)) {
      return json(res, 400, { ok: false, error: 'INVALID_DURATION' });
    }

    const memberships = await getBusinessMemberships(token);
    const allowed = Array.isArray(memberships) && memberships.some(row => row.business_id === businessId && row.status === 'active');
    if (!allowed) return json(res, 403, { ok: false, error: 'BUSINESS_ACCESS_REQUIRED' });

    const response = await supabaseRest('dabbir_ux_events', token, {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id,
        business_id: businessId,
        event_name: eventName,
        duration_ms: duration,
        context: safeContext(body.context),
      }),
    });
    if (!response.ok) return json(res, response.status, { ok: false, error: 'UX_EVENT_SAVE_FAILED' });
    return json(res, 202, { ok: true });
  } catch (error) {
    const status = error?.code === 413 ? 413 : error?.code === 400 ? 400 : 500;
    return json(res, status, { ok: false, error: status === 500 ? 'UX_EVENT_UNAVAILABLE' : error.message });
  }
}
