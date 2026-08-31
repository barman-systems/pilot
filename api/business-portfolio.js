import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
  supabaseRpc,
} from './_auth-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeId(value) {
  const id = String(value || '').trim();
  return UUID_RE.test(id) ? id : null;
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

async function read(response, fallback = 'PORTFOLIO_REQUEST_FAILED') {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const error = new Error(fallback);
    error.status = Number(response.status || 500);
    error.detail = data?.message || data?.code || null;
    throw error;
  }
  return data;
}

async function context(req, res) {
  const token = accessTokenFromRequest(req);
  if (!token) {
    json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });
    return null;
  }
  const [user, memberships] = await Promise.all([
    getVerifiedUser(token).catch(() => null),
    getBusinessMemberships(token).catch(() => []),
  ]);
  if (!user) {
    json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });
    return null;
  }
  return { token, user, memberships: Array.isArray(memberships) ? memberships : [] };
}

function membershipFor(memberships, businessId) {
  return memberships.find(row => row.business_id === businessId && row.status === 'active') || null;
}

function canManageBusiness(membership) {
  if (!membership) return false;
  if (membership.role === 'owner') return true;
  return Array.isArray(membership.permissions) && membership.permissions.includes('manage_business');
}

function idFilter(ids) {
  return ids.map(id => encodeURIComponent(id)).join(',');
}

async function safeRows(promise) {
  try {
    const rows = await promise;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function loadPortfolio(ctx) {
  const ids = [...new Set(ctx.memberships.map(row => safeId(row.business_id)).filter(Boolean))];
  if (!ids.length) {
    return {
      businesses: [],
      summary: {
        businesses: 0,
        branches: 0,
        customers: 0,
        appointments_today: 0,
        orders_today: 0,
        revenue_today_aed: 0,
      },
    };
  }

  const filter = idFilter(ids);
  const [businesses, branches, billing, metrics] = await Promise.all([
    read(await supabaseRest(
      `dabbir_businesses?select=id,slug,name,business_type,locale,demo_mode,created_at,updated_at&id=in.(${filter})&order=created_at.asc`,
      ctx.token,
    ), 'BUSINESS_PORTFOLIO_LOOKUP_FAILED'),
    safeRows(
      supabaseRest(
        `dabbir_business_branches?select=id,business_id,name,status,timezone,phone_e164,address_text,is_primary,created_at,updated_at&business_id=in.(${filter})&order=is_primary.desc,created_at.asc`,
        ctx.token,
      ).then(response => read(response, 'BRANCH_LOOKUP_FAILED')),
    ),
    safeRows(
      supabaseRest(
        `dabbir_billing_accounts?select=business_id,status,trial_ends_at,current_period_ends_at,cancel_at_period_end,last_invoice_status&business_id=in.(${filter})`,
        ctx.token,
      ).then(response => read(response, 'BILLING_LOOKUP_FAILED')),
    ),
    safeRows(
      supabaseRpc('dabbir_owner_business_metrics', ctx.token, {})
        .then(response => read(response, 'OWNER_METRICS_LOOKUP_FAILED')),
    ),
  ]);

  const membershipMap = new Map(ctx.memberships.map(row => [row.business_id, row]));
  const branchMap = new Map();
  for (const branch of branches) {
    const list = branchMap.get(branch.business_id) || [];
    list.push(branch);
    branchMap.set(branch.business_id, list);
  }
  const billingMap = new Map(billing.map(row => [row.business_id, row]));
  const metricMap = new Map(metrics.map(row => [row.business_id, row]));

  const result = (Array.isArray(businesses) ? businesses : []).map(business => {
    const membership = membershipMap.get(business.id) || null;
    const metric = metricMap.get(business.id) || {};
    return {
      ...business,
      membership: membership ? {
        role: membership.role,
        permissions: membership.permissions || [],
        can_manage_business: canManageBusiness(membership),
      } : null,
      branches: branchMap.get(business.id) || [],
      billing: billingMap.get(business.id) || null,
      metrics: {
        customers_total: Number(metric.customers_total || 0),
        appointments_today: Number(metric.appointments_today || 0),
        orders_today: Number(metric.orders_today || 0),
        revenue_today_aed: Number(metric.revenue_today_aed || 0),
        branches_total: Number(metric.branches_total || (branchMap.get(business.id) || []).filter(branch => branch.status === 'active').length),
      },
    };
  });

  const summary = result.reduce((acc, business) => {
    acc.businesses += 1;
    acc.branches += Number(business.metrics.branches_total || 0);
    acc.customers += Number(business.metrics.customers_total || 0);
    acc.appointments_today += Number(business.metrics.appointments_today || 0);
    acc.orders_today += Number(business.metrics.orders_today || 0);
    acc.revenue_today_aed += Number(business.metrics.revenue_today_aed || 0);
    return acc;
  }, {
    businesses: 0,
    branches: 0,
    customers: 0,
    appointments_today: 0,
    orders_today: 0,
    revenue_today_aed: 0,
  });

  summary.revenue_today_aed = Number(summary.revenue_today_aed.toFixed(2));
  return { businesses: result, summary };
}

async function createBranch(ctx, body) {
  const businessId = safeId(body?.business_id);
  const membership = businessId ? membershipFor(ctx.memberships, businessId) : null;
  if (!businessId) throw Object.assign(new Error('BUSINESS_ID_REQUIRED'), { status: 400 });
  if (!membership) throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'), { status: 403 });
  if (!canManageBusiness(membership)) throw Object.assign(new Error('BUSINESS_MANAGEMENT_REQUIRED'), { status: 403 });

  const name = clean(body?.name, 120);
  if (!name) throw Object.assign(new Error('BRANCH_NAME_REQUIRED'), { status: 400 });

  const timezone = clean(body?.timezone || 'Asia/Dubai', 80) || 'Asia/Dubai';
  const phone = clean(body?.phone_e164, 40) || null;
  const address = clean(body?.address_text, 500) || null;

  const rows = await read(await supabaseRest(
    'dabbir_business_branches?select=id,business_id,name,status,timezone,phone_e164,address_text,is_primary,created_at,updated_at',
    ctx.token,
    {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        business_id: businessId,
        name,
        status: 'active',
        timezone,
        phone_e164: phone,
        address_text: address,
        is_primary: false,
        created_by: ctx.user.id,
      }),
    },
  ), 'BRANCH_CREATE_FAILED');

  const branch = Array.isArray(rows) ? rows[0] : null;
  if (!branch?.id) throw Object.assign(new Error('BRANCH_CREATE_UNVERIFIED'), { status: 502 });
  return branch;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET, POST' });
  }
  if (req.method === 'POST' && !requireSameOrigin(req)) {
    return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });
  }

  const ctx = await context(req, res);
  if (!ctx) return;

  try {
    if (req.method === 'GET') {
      const portfolio = await loadPortfolio(ctx);
      return json(res, 200, {
        ok: true,
        ...portfolio,
        active_memberships: ctx.memberships.length,
        truth: { state: 'VERIFIED', source: 'RLS_SCOPED_DATABASE' },
      });
    }

    const body = await readJsonBody(req);
    const action = clean(body?.action, 40);
    if (action !== 'create_branch') {
      return json(res, 400, { ok: false, error: 'UNSUPPORTED_ACTION' });
    }

    const branch = await createBranch(ctx, body);
    return json(res, 201, {
      ok: true,
      action,
      branch,
      truth: { state: 'VERIFIED_PERSISTED', source: 'SUPABASE_RETURN_REPRESENTATION', entity_id: branch.id },
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 413, 422, 502].includes(status) ? status : 500;
    console.error('dabbir_business_portfolio_failed', {
      status: safeStatus,
      error: String(error?.message || 'BUSINESS_PORTFOLIO_FAILED').slice(0, 140),
    });
    return json(res, safeStatus, {
      ok: false,
      error: String(error?.message || 'BUSINESS_PORTFOLIO_FAILED').slice(0, 140),
      detail: error?.detail || undefined,
    });
  }
}
