import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  supabaseRest,
} from './_auth-core.js';
import { getDABBIRAiConfig } from './_ai-core.js';
import dabbirRuntimeHandler from './dabbir-runtime.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId = value => UUID_RE.test(String(value || '').trim()) ? String(value).trim() : null;

function normalizeDisplayName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
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

const rest = (token, path, fallback) => supabaseRest(path, token).then(response => readData(response, fallback));

async function loadMessages(accessToken, businessId, conversationId) {
  if (!conversationId) return [];
  return rest(
    accessToken,
    `dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at&business_id=eq.${businessId}&conversation_id=eq.${conversationId}&order=created_at.asc&limit=60`,
    'MESSAGES_LOOKUP_FAILED',
  );
}

async function handleFastGet(req, res) {
  const started = Date.now();
  const accessToken = accessTokenFromRequest(req);
  if (!accessToken) return json(res, 401, { ok: false, authenticated: false, error: 'AUTH_REQUIRED' });

  const [user, memberships] = await Promise.all([
    getVerifiedUser(accessToken).catch(() => null),
    getBusinessMemberships(accessToken).catch(() => []),
  ]);
  if (!user) return json(res, 401, { ok: false, authenticated: false, error: 'AUTH_REQUIRED' });

  const requestedBusinessId = safeId(req.query?.business_id);
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
  const requestedConversationId = safeId(req.query?.conversation_id);
  const summaryOnly = String(req.query?.summary || '') === '1';

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
  const requestedMessagesPromise = !summaryOnly && requestedConversationId
    ? loadMessages(accessToken, businessId, requestedConversationId)
    : Promise.resolve(null);

  const [businessRows, rawConversations, customers, appointments, handoffs, followups, requestedMessages] = await Promise.all([
    businessPromise,
    conversationsPromise,
    customersPromise,
    appointmentsPromise,
    handoffsPromise,
    followupsPromise,
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
  res.setHeader('server-timing', `dabbir;dur=${duration}`);
  res.setHeader('x-dabbir-runtime', 'fast-v3');
  return json(res, 200, {
    ok: true,
    authenticated: true,
    user,
    needs_onboarding: false,
    operational_mode: 'AUTHENTICATED_WEB_RUNTIME',
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
    performance: { runtime_ms: duration, summary_only: summaryOnly, conversation_dedupe: true },
  });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      return await handleFastGet(req, res);
    } catch (error) {
      const status = Number(error?.status || 500);
      const safeStatus = [400, 401, 403, 404, 409, 413, 429, 502, 503].includes(status) ? status : 500;
      return json(res, safeStatus, {
        ok: false,
        error: String(error?.message || 'FAST_RUNTIME_FAILED').slice(0, 120),
        detail: error?.detail || undefined,
      });
    }
  }
  return dabbirRuntimeHandler(req, res);
}
