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
const DEFAULT_NOTIFICATIONS = Object.freeze({
  handoffs: true,
  appointments: true,
  channel_issues: true,
  daily_summary: true,
});
const METRIC_KEYS = new Set(['conversations', 'appointments', 'customers', 'attention']);
const DEFAULT_DASHBOARD = Object.freeze({
  hidden_metrics: [],
  metric_order: ['conversations', 'appointments', 'customers', 'attention'],
});

function normalizeNotifications(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.keys(DEFAULT_NOTIFICATIONS).map(key => [
    key,
    typeof source[key] === 'boolean' ? source[key] : DEFAULT_NOTIFICATIONS[key],
  ]));
}

function normalizeDashboard(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const hidden = Array.isArray(source.hidden_metrics)
    ? [...new Set(source.hidden_metrics.map(String).filter(key => METRIC_KEYS.has(key)))]
    : [];
  const requestedOrder = Array.isArray(source.metric_order)
    ? [...new Set(source.metric_order.map(String).filter(key => METRIC_KEYS.has(key)))]
    : [];
  const metricOrder = [...requestedOrder, ...DEFAULT_DASHBOARD.metric_order.filter(key => !requestedOrder.includes(key))];
  return { hidden_metrics: hidden, metric_order: metricOrder };
}

async function context(req) {
  const token = accessTokenFromRequest(req);
  const user = await getVerifiedUser(token);
  if (!user) return null;
  const memberships = await getBusinessMemberships(token);
  return { token, user, memberships: Array.isArray(memberships) ? memberships : [] };
}

function hasMembership(ctx, businessId) {
  return ctx.memberships.some(row => row.business_id === businessId && row.status === 'active');
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method || '')) return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET, POST' });
  if (req.method === 'POST' && !requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const ctx = await context(req);
    if (!ctx) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

    let businessId = '';
    let notificationPreferences = DEFAULT_NOTIFICATIONS;
    let dashboardPreferences = DEFAULT_DASHBOARD;
    if (req.method === 'GET') {
      const url = new URL(req.url || '/', 'https://dabbir.local');
      businessId = String(url.searchParams.get('business_id') || '');
    } else {
      const body = await readJsonBody(req, 8192);
      businessId = String(body.business_id || '');
      notificationPreferences = normalizeNotifications(body.notification_preferences);
      dashboardPreferences = normalizeDashboard(body.dashboard_preferences);
    }

    if (!UUID_RE.test(businessId)) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    if (!hasMembership(ctx, businessId)) return json(res, 403, { ok: false, error: 'BUSINESS_ACCESS_REQUIRED' });

    if (req.method === 'GET') {
      const response = await supabaseRest(
        `dabbir_user_preferences?select=notification_preferences,dashboard_preferences,updated_at&user_id=eq.${ctx.user.id}&business_id=eq.${businessId}&limit=1`,
        ctx.token,
      );
      if (!response.ok) return json(res, response.status, { ok: false, error: 'PREFERENCES_READ_FAILED' });
      const rows = await response.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      return json(res, 200, {
        ok: true,
        notification_preferences: normalizeNotifications(row?.notification_preferences),
        dashboard_preferences: normalizeDashboard(row?.dashboard_preferences),
        updated_at: row?.updated_at || null,
      });
    }

    const response = await supabaseRest('dabbir_user_preferences?on_conflict=user_id,business_id', ctx.token, {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        user_id: ctx.user.id,
        business_id: businessId,
        notification_preferences: notificationPreferences,
        dashboard_preferences: dashboardPreferences,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!response.ok) return json(res, response.status, { ok: false, error: 'PREFERENCES_SAVE_FAILED' });
    return json(res, 200, {
      ok: true,
      notification_preferences: notificationPreferences,
      dashboard_preferences: dashboardPreferences,
    });
  } catch (error) {
    const status = error?.code === 413 ? 413 : error?.code === 400 ? 400 : 500;
    return json(res, status, { ok: false, error: status === 500 ? 'PREFERENCES_UNAVAILABLE' : error.message });
  }
}
