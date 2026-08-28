import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  supabaseRest,
  userClaimsFromValidatedAccessToken,
} from './_auth-core.js';
import { getDABBIRAiConfig } from './_ai-core.js';
import dabbirRuntimeHandler from './dabbir-runtime.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId = value => UUID_RE.test(String(value || '').trim()) ? String(value).trim() : null;
const DABBIR_TIME_ZONE = 'Asia/Dubai';
const DABBIR_UTC_OFFSET = '+04:00';
const DABBIR_FAST_RUNTIME_VERSION = 'fast-v7-timeout-guarded';

// Every Supabase request is bounded independently so a hung upstream call cannot
// consume the full Vercel function lifetime. Required workspace reads remain
// fail-fast as a group: one required timeout makes the request fail explicitly.
const DB_TIMEOUT_MS = 10_000;

function withTimeout(promiseFactory, label, ms = DB_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return Promise.race([
    promiseFactory(controller.signal).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        const error = new Error(`${label}_TIMEOUT`);
        error.status = 504;
        reject(error);
      });
    }),
  ]);
}

function singleQueryValue(req, name) {
  try {
    const url = new URL(String(req?.url || '/'), 'https://dabbir.invalid');
    const values = url.searchParams.getAll(name);
    return values.length === 1 ? values[0] : null;
  } catch {
    return null;
  }
}

function normalizeDisplayName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stateRank(state) {
  const value = String(state || '').toLowerCase();
  if (value === 'human_active') return 4;
  if (value === 'waiting_customer') return 3;
  if (value === 'ai_active') return 2;
  if (value === 'action_required') return 1;
  return 0;
}

function activityTime(conversation) {
  return new Date(conversation?.updated_at || conversation?.created_at || 0).getTime();
}

function isBetterCanonical(candidate, existing) {
  const rankDelta = stateRank(candidate?.state) - stateRank(existing?.state);
  if (rankDelta !== 0) return rankDelta > 0;
  return activityTime(candidate) > activityTime(existing);
}

function visibleConversations(conversations = [], customers = []) {
  const customerById = new Map((customers || []).map(customer => [customer.id, customer]));
  const runtimeGroups = new Map();
  const passthrough = [];

  for (const conversation of conversations || []) {
    const customer = customerById.get(conversation.customer_id);
    const source = String(customer?.metadata?.source || '');
    const normalizedName = normalizeDisplayName(customer?.display_name || '');
    if (source !== 'dabbir_web_runtime' || !normalizedName) {
      passthrough.push(conversation);
      continue;
    }
    const existing = runtimeGroups.get(normalizedName);
    if (!existing || isBetterCanonical(conversation, existing)) runtimeGroups.set(normalizedName, conversation);
  }

  return [...passthrough, ...runtimeGroups.values()].sort((a, b) => activityTime(b) - activityTime(a));
}

async function readData(response, fallback = 'DATA_REQUEST_FAILED') {
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(fallback);
    error.status = response.status;
    error.detail = payload?.code || payload?.message || null;
    throw error;
  }
  return payload;
}

const rest = (token, path, fallback) =>
  withTimeout(
    signal => supabaseRest(path, token, { signal }).then(response => readData(response, fallback)),
    fallback,
  );

async function restCount(accessToken, path, fallback) {
  return withTimeout(async signal => {
    const response = await supabaseRest(path, accessToken, { headers: { prefer: 'count=exact' }, signal });
    if (!response.ok) {
      const payload = await readData(response, fallback);
      return payload;
    }
    const range = String(response.headers.get('content-range') || '');
    const rawTotal = range.includes('/') ? range.slice(range.lastIndexOf('/') + 1) : '';
    const total = Number(rawTotal);
    await response.text().catch(() => '');
    if (!Number.isSafeInteger(total) || total < 0) {
      const error = new Error(`${fallback}_COUNT_UNVERIFIED`);
      error.status = 502;
      throw error;
    }
    return total;
  }, fallback);
}

export function dubaiDayRange(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DABBIR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  const start = new Date(`${dateKey}T00:00:00${DABBIR_UTC_OFFSET}`);
  if (Number.isNaN(start.getTime())) throw Object.assign(new Error('DUBAI_DAY_RANGE_FAILED'), { status: 502 });
  return {
    time_zone: DABBIR_TIME_ZONE,
    date_key: dateKey,
    starts_at_gte: start.toISOString(),
    starts_at_lt: new Date(start.getTime() + 86400000).toISOString(),
  };
}

async function loadVerifiedMetrics(accessToken, businessId, now = new Date()) {
  const day = dubaiDayRange(now);
  const b = encodeURIComponent(businessId);
  const start = encodeURIComponent(day.starts_at_gte);
  const end = encodeURIComponent(day.starts_at_lt);
  const [activeChats, todayAppointments, customers, activeHandoffs, openFollowups, aiMessages, humanHandoffs] = await Promise.all([
    restCount(accessToken, `dabbir_conversations?select=id&business_id=eq.${b}&channel_type=eq.web&state=neq.closed&limit=1`, 'ACTIVE_CHATS_COUNT_FAILED'),
    restCount(accessToken, `dabbir_appointments?select=id&business_id=eq.${b}&starts_at=gte.${start}&starts_at=lt.${end}&limit=1`, 'TODAY_APPOINTMENTS_COUNT_FAILED'),
    restCount(accessToken, `dabbir_customers?select=id&business_id=eq.${b}&limit=1`, 'CUSTOMERS_COUNT_FAILED'),
    restCount(accessToken, `dabbir_handoffs?select=id&business_id=eq.${b}&state=in.(QUEUED,ASSIGNED,HUMAN_ACTIVE)&limit=1`, 'ACTIVE_HANDOFFS_COUNT_FAILED'),
    restCount(accessToken, `dabbir_followups?select=id&business_id=eq.${b}&status=not.in.(completed,cancelled,sent)&limit=1`, 'OPEN_FOLLOWUPS_COUNT_FAILED'),
    restCount(accessToken, `dabbir_messages?select=id&business_id=eq.${b}&sender_type=eq.ai&simulated=eq.false&limit=1`, 'AI_MESSAGES_COUNT_FAILED'),
    restCount(accessToken, `dabbir_handoffs?select=id&business_id=eq.${b}&limit=1`, 'HUMAN_HANDOFFS_COUNT_FAILED'),
  ]);

  return {
    state: 'VERIFIED_EXACT_COUNTS',
    source: 'SUPABASE_POSTGREST_COUNT_EXACT',
    as_of: new Date().toISOString(),
    time_zone: day.time_zone,
    date_key: day.date_key,
    active_chats: activeChats,
    today_appointments: todayAppointments,
    customers,
    active_handoffs: activeHandoffs,
    open_followups: openFollowups,
    needs_attention: activeHandoffs + openFollowups,
    ai_messages: aiMessages,
    human_handoffs: humanHandoffs,
  };
}

async function loadMessages(accessToken, businessId, conversationId) {
  if (!conversationId) return [];
  return rest(
    accessToken,
    `dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at&business_id=eq.${businessId}&conversation_id=eq.${conversationId}&order=created_at.asc&limit=60`,
    'MESSAGES_LOOKUP_FAILED',
  );
}

function buildDataTruth({ business, conversations, customers, appointments, handoffs, followups, messages, metrics, duration, summaryOnly }) {
  return {
    state: 'VERIFIED_TENANT_READ',
    source: 'SUPABASE_RLS_TENANT_DATA',
    runtime_version: DABBIR_FAST_RUNTIME_VERSION,
    read_at: new Date().toISOString(),
    business_updated_at: business?.updated_at || null,
    runtime_ms: duration,
    summary_only: summaryOnly,
    exact_metrics_state: metrics?.state || 'UNVERIFIED',
    counts: {
      conversations_loaded: Array.isArray(conversations) ? conversations.length : 0,
      customers_loaded: Array.isArray(customers) ? customers.length : 0,
      appointments_loaded: Array.isArray(appointments) ? appointments.length : 0,
      handoffs_loaded: Array.isArray(handoffs) ? handoffs.length : 0,
      followups_loaded: Array.isArray(followups) ? followups.length : 0,
      messages_loaded: Array.isArray(messages) ? messages.length : 0,
    },
  };
}

async function handleFastGet(req, res) {
  const started = Date.now();
  const accessToken = accessTokenFromRequest(req);
  if (!accessToken) return json(res, 401, { ok: false, authenticated: false, error: 'AUTH_REQUIRED' });

  let memberships;
  try {
    memberships = await getBusinessMemberships(accessToken);
  } catch (error) {
    const status = Number(error?.code || 500);
    if (status === 401 || status === 403) {
      return json(res, 401, { ok: false, authenticated: false, error: 'AUTH_REQUIRED' });
    }
    return json(res, 503, { ok: false, authenticated: false, error: 'AUTH_VERIFICATION_UNAVAILABLE' });
  }

  let user = userClaimsFromValidatedAccessToken(accessToken);
  if (!user) user = await getVerifiedUser(accessToken).catch(() => null);
  if (!user) return json(res, 401, { ok: false, authenticated: false, error: 'AUTH_REQUIRED' });

  const requestedBusinessId = safeId(singleQueryValue(req, 'business_id'));
  const membership = requestedBusinessId
    ? memberships.find(item => item.business_id === requestedBusinessId) || null
    : memberships[0] || null;

  const aiConfig = getDABBIRAiConfig();
  if (!membership) {
    res.setHeader('server-timing', `dabbir;dur=${Date.now() - started}`);
    return json(res, 200, {
      ok: true,
      authenticated: true,
      user,
      needs_onboarding: memberships.length === 0,
      memberships,
      operational_mode: 'AUTHENTICATED_WEB_RUNTIME',
      truth_mode: 'AUTH_VERIFIED_NO_TENANT',
      data_truth: {
        state: 'NO_TENANT_SELECTED',
        source: 'SUPABASE_AUTH_AND_MEMBERSHIP',
        read_at: new Date().toISOString(),
      },
      verified_metrics: null,
      whatsapp: { state: 'NOT_OPERATIONAL', blocker: 'META_AUTHORIZATION_NOT_COMPLETED' },
      ai: {
        provider: aiConfig.provider,
        model: aiConfig.model,
        configured: aiConfig.configured,
        cost_mode: aiConfig.cost_mode,
        state: aiConfig.configured ? 'OPERATIONAL_PROVIDER_READY' : 'UNCONFIGURED',
      },
    });
  }

  const businessId = membership.business_id;
  const requestedConversationId = safeId(singleQueryValue(req, 'conversation_id'));
  const summaryOnly = singleQueryValue(req, 'summary') === '1';

  const businessPromise = rest(
    accessToken,
    `dabbir_businesses?select=id,slug,name,business_type,locale,demo_mode,created_at,updated_at&id=eq.${businessId}&limit=1`,
    'BUSINESS_LOOKUP_FAILED',
  );
  const conversationsPromise = rest(
    accessToken,
    `dabbir_conversations?select=id,customer_id,channel_type,state,demo_mode,created_at,updated_at&business_id=eq.${businessId}&channel_type=eq.web&state=neq.closed&order=updated_at.desc&limit=40`,
    'CONVERSATIONS_LOOKUP_FAILED',
  );
  const customersPromise = rest(
    accessToken,
    `dabbir_customers?select=id,display_name,lead_status,metadata,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=80`,
    'CUSTOMERS_LOOKUP_FAILED',
  );
  const appointmentsPromise = rest(
    accessToken,
    `dabbir_appointments?select=id,customer_id,service_id,starts_at,status,simulated,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=30`,
    'APPOINTMENTS_LOOKUP_FAILED',
  );
  const handoffsPromise = rest(
    accessToken,
    `dabbir_handoffs?select=id,conversation_id,customer_id,route_class,reason,state,priority,summary,created_at,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=20`,
    'HANDOFFS_LOOKUP_FAILED',
  );
  const followupsPromise = rest(
    accessToken,
    `dabbir_followups?select=id,conversation_id,customer_id,channel_type,reason,status,due_at,created_at,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=20`,
    'FOLLOWUPS_LOOKUP_FAILED',
  );
  const metricsPromise = loadVerifiedMetrics(accessToken, businessId);
  const requestedMessagesPromise = !summaryOnly && requestedConversationId
    ? loadMessages(accessToken, businessId, requestedConversationId)
    : Promise.resolve(null);

  // These reads are all required to claim a verified workspace response. Promise.all
  // intentionally fails the whole request if any required read times out or fails.
  const [businessRows, rawConversations, customers, appointments, handoffs, followups, metrics, requestedMessages] =
    await Promise.all([
      businessPromise,
      conversationsPromise,
      customersPromise,
      appointmentsPromise,
      handoffsPromise,
      followupsPromise,
      metricsPromise,
      requestedMessagesPromise,
    ]);

  const business = businessRows?.[0] || null;
  if (!business) return json(res, 404, { ok: false, error: 'BUSINESS_NOT_FOUND' });

  const conversations = visibleConversations(rawConversations, customers);
  const customerById = new Map((customers || []).map(customer => [customer.id, customer]));

  let conversationId = requestedConversationId;
  if (conversationId && !conversations.some(item => item.id === conversationId)) {
    const hiddenRequested = (rawConversations || []).find(item => item.id === conversationId);
    const hiddenCustomer = hiddenRequested ? customerById.get(hiddenRequested.customer_id) : null;
    const hiddenName = normalizeDisplayName(hiddenCustomer?.display_name || '');
    const replacement = hiddenName
      ? conversations.find(item => normalizeDisplayName(customerById.get(item.customer_id)?.display_name || '') === hiddenName)
      : null;
    conversationId = replacement?.id || null;
  }
  if (!conversationId) conversationId = conversations?.[0]?.id || null;

  let messages = [];
  let messagesLoaded = false;
  if (!summaryOnly && conversationId) {
    if (conversationId === requestedConversationId && Array.isArray(requestedMessages)) {
      messages = requestedMessages;
    } else {
      messages = await loadMessages(accessToken, businessId, conversationId);
    }
    messagesLoaded = true;
  }

  const duration = Date.now() - started;
  const dataTruth = buildDataTruth({ business, conversations, customers, appointments, handoffs, followups, messages, metrics, duration, summaryOnly });
  res.setHeader('server-timing', `dabbir;dur=${duration}`);
  res.setHeader('x-dabbir-runtime', DABBIR_FAST_RUNTIME_VERSION);
  return json(res, 200, {
    ok: true,
    authenticated: true,
    user,
    needs_onboarding: false,
    operational_mode: 'AUTHENTICATED_WEB_RUNTIME',
    truth_mode: 'VERIFIED_TENANT_READS_AND_EXACT_COUNTS',
    data_truth: dataTruth,
    verified_metrics: metrics,
    membership,
    memberships,
    business,
    conversations,
    selected_conversation_id: conversationId,
    messages,
    messages_loaded: messagesLoaded,
    customers,
    appointments,
    handoffs,
    followups,
    ai: {
      provider: aiConfig.provider,
      model: aiConfig.model,
      configured: aiConfig.configured,
      cost_mode: aiConfig.cost_mode,
      state: aiConfig.configured ? 'OPERATIONAL_PROVIDER_READY' : 'UNCONFIGURED',
    },
    whatsapp: { state: 'NOT_OPERATIONAL', blocker: 'META_AUTHORIZATION_NOT_COMPLETED' },
    performance: { runtime_ms: duration, runtime_version: DABBIR_FAST_RUNTIME_VERSION, summary_only: summaryOnly, conversation_dedupe: true, auth_fast_path: true, exact_metrics: true },
  });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      return await handleFastGet(req, res);
    } catch (error) {
      const status = Number(error?.status || 500);
      const safeStatus = [400, 401, 403, 404, 409, 413, 429, 502, 503, 504].includes(status) ? status : 500;
      return json(res, safeStatus, {
        ok: false,
        state: 'FAILED_OR_UNVERIFIED',
        error: String(error?.message || 'FAST_RUNTIME_FAILED').slice(0, 120),
        detail: error?.detail || undefined,
        truth: { state: 'UNVERIFIED' },
      });
    }
  }
  return dabbirRuntimeHandler(req, res);
}