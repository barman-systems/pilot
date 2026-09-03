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
const BUSINESS_TYPES = new Set(['clinic','store','creator','salon','real_estate','services','car_wash','laundry','other']);
const BILLING_DELETE_BLOCKERS = new Set(['trialing','active','past_due','unpaid','incomplete']);

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
  if (String(membership.role || '').toLowerCase() === 'owner') return true;
  const permissions = Array.isArray(membership.permissions) ? membership.permissions : [];
  if (permissions.length) return permissions.includes('manage_business');
  return String(membership.role || '').toLowerCase() === 'admin';
}

function requireManage(ctx, businessId) {
  const membership = businessId ? membershipFor(ctx.memberships, businessId) : null;
  if (!businessId) throw Object.assign(new Error('BUSINESS_ID_REQUIRED'), { status: 400 });
  if (!membership) throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'), { status: 403 });
  if (!canManageBusiness(membership)) throw Object.assign(new Error('BUSINESS_MANAGEMENT_REQUIRED'), { status: 403 });
  return membership;
}

function requireOwner(ctx, businessId) {
  const membership = requireManage(ctx, businessId);
  if (String(membership.role || '').toLowerCase() !== 'owner') throw Object.assign(new Error('OWNER_APPROVAL_REQUIRED'), { status: 403 });
  return membership;
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
      summary: { businesses: 0, branches: 0, customers: 0, appointments_today: 0, orders_today: 0, revenue_today_aed: 0 },
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
    if (branch.status !== 'active') continue;
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
        is_owner: String(membership.role || '').toLowerCase() === 'owner',
      } : null,
      branches: branchMap.get(business.id) || [],
      billing: billingMap.get(business.id) || null,
      metrics: {
        customers_total: Number(metric.customers_total || 0),
        appointments_today: Number(metric.appointments_today || 0),
        orders_today: Number(metric.orders_today || 0),
        revenue_today_aed: Number(metric.revenue_today_aed || 0),
        branches_total: Number(metric.branches_total || (branchMap.get(business.id) || []).length),
      },
    };
  });

  const summary = result.reduce((acc, business) => {
    acc.businesses += 1;
    acc.branches += (business.branches || []).length;
    acc.customers += Number(business.metrics.customers_total || 0);
    acc.appointments_today += Number(business.metrics.appointments_today || 0);
    acc.orders_today += Number(business.metrics.orders_today || 0);
    acc.revenue_today_aed += Number(business.metrics.revenue_today_aed || 0);
    return acc;
  }, { businesses: 0, branches: 0, customers: 0, appointments_today: 0, orders_today: 0, revenue_today_aed: 0 });

  summary.revenue_today_aed = Number(summary.revenue_today_aed.toFixed(2));
  return { businesses: result, summary };
}

async function createBranch(ctx, body) {
  const businessId = safeId(body?.business_id);
  requireManage(ctx, businessId);
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
      body: JSON.stringify({ business_id: businessId, name, status: 'active', timezone, phone_e164: phone, address_text: address, is_primary: false, created_by: ctx.user.id }),
    },
  ), 'BRANCH_CREATE_FAILED');
  const branch = Array.isArray(rows) ? rows[0] : null;
  if (!branch?.id) throw Object.assign(new Error('BRANCH_CREATE_UNVERIFIED'), { status: 502 });
  return branch;
}

async function updateBranch(ctx, body) {
  const businessId=safeId(body?.business_id),branchId=safeId(body?.branch_id);
  requireManage(ctx,businessId);
  if(!branchId)throw Object.assign(new Error('BRANCH_ID_REQUIRED'),{status:400});
  const name=clean(body?.name,120);if(!name)throw Object.assign(new Error('BRANCH_NAME_REQUIRED'),{status:400});
  const timezone=clean(body?.timezone||'Asia/Dubai',80)||'Asia/Dubai';
  const phone=clean(body?.phone_e164,40)||null,address=clean(body?.address_text,500)||null;
  const rows=await read(await supabaseRest(
    `dabbir_business_branches?id=eq.${branchId}&business_id=eq.${businessId}&status=eq.active&select=id,business_id,name,status,timezone,phone_e164,address_text,is_primary,created_at,updated_at`,
    ctx.token,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({name,timezone,phone_e164:phone,address_text:address,updated_at:new Date().toISOString()})}
  ),'BRANCH_UPDATE_FAILED');
  const branch=rows?.[0];if(!branch?.id)throw Object.assign(new Error('BRANCH_NOT_FOUND'),{status:404});
  return branch;
}

async function deleteBranch(ctx, body) {
  const businessId=safeId(body?.business_id),branchId=safeId(body?.branch_id);
  requireManage(ctx,businessId);
  if(!branchId)throw Object.assign(new Error('BRANCH_ID_REQUIRED'),{status:400});
  const currentRows=await read(await supabaseRest(`dabbir_business_branches?id=eq.${branchId}&business_id=eq.${businessId}&status=eq.active&select=id,is_primary&limit=1`,ctx.token),'BRANCH_LOOKUP_FAILED');
  const current=currentRows?.[0];if(!current?.id)throw Object.assign(new Error('BRANCH_NOT_FOUND'),{status:404});
  const rows=await read(await supabaseRest(
    `dabbir_business_branches?id=eq.${branchId}&business_id=eq.${businessId}&select=id,business_id,status`,ctx.token,
    {method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({status:'inactive',is_primary:false,updated_at:new Date().toISOString()})}
  ),'BRANCH_DELETE_FAILED');
  if(!rows?.[0]?.id)throw Object.assign(new Error('BRANCH_DELETE_UNVERIFIED'),{status:502});
  if(current.is_primary){
    const candidates=await safeRows(supabaseRest(`dabbir_business_branches?business_id=eq.${businessId}&status=eq.active&id=neq.${branchId}&select=id&order=created_at.asc&limit=1`,ctx.token).then(response=>read(response,'BRANCH_REPLACEMENT_LOOKUP_FAILED')));
    const replacement=candidates?.[0]?.id;
    if(replacement){
      await read(await supabaseRest(`dabbir_business_branches?id=eq.${replacement}&business_id=eq.${businessId}`,ctx.token,{method:'PATCH',headers:{prefer:'return=minimal'},body:JSON.stringify({is_primary:true,updated_at:new Date().toISOString()})}),'BRANCH_PRIMARY_REPLACEMENT_FAILED');
    }
  }
  return {id:branchId,status:'inactive',preserved_history:true};
}

async function updateBusiness(ctx, body) {
  const businessId=safeId(body?.business_id);requireManage(ctx,businessId);
  const name=clean(body?.name,120);if(!name)throw Object.assign(new Error('BUSINESS_NAME_REQUIRED'),{status:400});
  const type=clean(body?.business_type,40).toLowerCase();
  if(type&&!BUSINESS_TYPES.has(type))throw Object.assign(new Error('INVALID_BUSINESS_TYPE'),{status:400});
  const patch={name,updated_at:new Date().toISOString()};if(type)patch.business_type=type;
  const rows=await read(await supabaseRest(`dabbir_businesses?id=eq.${businessId}&select=id,slug,name,business_type,locale,demo_mode,created_at,updated_at`,ctx.token,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify(patch)}),'BUSINESS_UPDATE_FAILED');
  const business=rows?.[0];if(!business?.id)throw Object.assign(new Error('BUSINESS_NOT_FOUND'),{status:404});
  return business;
}

async function deleteBusiness(ctx, body) {
  const businessId=safeId(body?.business_id);requireOwner(ctx,businessId);
  const billingRows=await safeRows(supabaseRest(`dabbir_billing_accounts?business_id=eq.${businessId}&select=status,cancel_at_period_end&limit=1`,ctx.token).then(response=>read(response,'BILLING_DELETE_GUARD_FAILED')));
  const billing=billingRows?.[0]||null;
  if(billing&&BILLING_DELETE_BLOCKERS.has(String(billing.status||'').toLowerCase())){
    throw Object.assign(new Error('CANCEL_SUBSCRIPTION_BEFORE_BUSINESS_DELETE'),{status:409,detail:billing.cancel_at_period_end?'WAIT_FOR_SUBSCRIPTION_END':'CANCEL_BILLING_FIRST'});
  }
  const rows=await read(await supabaseRest(`dabbir_businesses?id=eq.${businessId}&select=id`,ctx.token,{method:'DELETE',headers:{prefer:'return=representation'}}),'BUSINESS_DELETE_FAILED');
  const deleted=rows?.[0];if(!deleted?.id)throw Object.assign(new Error('BUSINESS_DELETE_UNVERIFIED'),{status:404});
  return {id:deleted.id,deleted:true};
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
      return json(res, 200, { ok: true, ...portfolio, active_memberships: ctx.memberships.length, truth: { state: 'VERIFIED', source: 'RLS_SCOPED_DATABASE' } });
    }

    const body = await readJsonBody(req);
    const action = clean(body?.action, 40);
    let result=null,entity='result',statusCode=200;
    if(action==='create_branch'){result=await createBranch(ctx,body);entity='branch';statusCode=201}
    else if(action==='update_branch'){result=await updateBranch(ctx,body);entity='branch'}
    else if(action==='delete_branch'){result=await deleteBranch(ctx,body);entity='branch'}
    else if(action==='update_business'){result=await updateBusiness(ctx,body);entity='business'}
    else if(action==='delete_business'){result=await deleteBusiness(ctx,body);entity='business'}
    else return json(res,400,{ok:false,error:'UNSUPPORTED_ACTION'});

    return json(res,statusCode,{ok:true,action,[entity]:result,truth:{state:'VERIFIED_PERSISTED',source:'SUPABASE_RETURN_REPRESENTATION',entity_id:result?.id||null}});
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 413, 422, 502].includes(status) ? status : 500;
    console.error('dabbir_business_portfolio_failed', { status: safeStatus, error: String(error?.message || 'BUSINESS_PORTFOLIO_FAILED').slice(0, 140) });
    return json(res, safeStatus, { ok: false, error: String(error?.message || 'BUSINESS_PORTFOLIO_FAILED').slice(0, 140), detail: error?.detail || undefined });
  }
}
