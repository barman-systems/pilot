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
const CATEGORIES = new Set(['general', 'problem', 'idea', 'onboarding']);
const CONTEXT_KEYS = new Set(['screen', 'language', 'viewport', 'release']);

function safeContext(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  for (const [key, raw] of Object.entries(source)) {
    if (!CONTEXT_KEYS.has(key)) continue;
    const text = String(raw ?? '').slice(0, 160);
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

    const body = await readJsonBody(req, 8192);
    const businessId = String(body.business_id || '');
    const category = String(body.category || 'general');
    const message = String(body.message || '').trim();
    const rating = body.rating == null || body.rating === '' ? null : Number(body.rating);
    if (!UUID_RE.test(businessId)) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    if (!CATEGORIES.has(category)) return json(res, 400, { ok: false, error: 'INVALID_CATEGORY' });
    if (message.length < 3 || message.length > 2000) return json(res, 400, { ok: false, error: 'INVALID_MESSAGE' });
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return json(res, 400, { ok: false, error: 'INVALID_RATING' });

    const memberships = await getBusinessMemberships(token);
    const allowed = Array.isArray(memberships) && memberships.some(row => row.business_id === businessId && row.status === 'active');
    if (!allowed) return json(res, 403, { ok: false, error: 'BUSINESS_ACCESS_REQUIRED' });

    const response = await supabaseRest('dabbir_feedback', token, {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id,
        business_id: businessId,
        category,
        rating,
        message,
        context: safeContext(body.context),
      }),
    });
    if (!response.ok) return json(res, response.status, { ok: false, error: 'FEEDBACK_SAVE_FAILED' });
    return json(res, 201, { ok: true });
  } catch (error) {
    const status = error?.code === 413 ? 413 : error?.code === 400 ? 400 : 500;
    return json(res, status, { ok: false, error: status === 500 ? 'FEEDBACK_UNAVAILABLE' : error.message });
  }
}
