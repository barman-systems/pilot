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
import { generatePilotAiReply, getPilotAiConfig } from './_ai-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUSINESS_TYPES = new Set(['store', 'clinic', 'creator', 'salon', 'real_estate', 'services', 'other']);

function normalizeArabic(input = '') {
  return String(input)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[^\p{L}\p{N}\s:+\-./]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text, terms) {
  return terms.some(term => text.includes(term));
}

export function extractClinicSignals(message = '') {
  const text = normalizeArabic(message);
  const temporal = [];
  if (containsAny(text, ['عقب باجر', 'بعد بكره', 'بعد بكرة', 'day after tomorrow'])) temporal.push('DAY_AFTER_TOMORROW');
  else if (containsAny(text, ['باجر', 'بكره', 'بكرة', 'غدا', 'غد', 'tomorrow'])) temporal.push('TOMORROW');
  else if (containsAny(text, ['اليوم', 'today'])) temporal.push('TODAY');
  if (containsAny(text, ['الصبح', 'صباح', 'morning'])) temporal.push('MORNING');
  if (containsAny(text, ['الظهر', 'ظهرا', 'noon'])) temporal.push('NOON');
  if (containsAny(text, ['العصر', 'afternoon'])) temporal.push('AFTERNOON');
  if (containsAny(text, ['المغرب', 'المسا', 'مساء', 'evening'])) temporal.push('EVENING');
  if (containsAny(text, ['الليل', 'ليلا', 'night'])) temporal.push('NIGHT');

  const appointmentTerms = ['موعد', 'حجز', 'احجز', 'appointment', 'book', 'booking', 'slot', 'availability'];
  let intent = 'GENERAL_INQUIRY';
  if (containsAny(text, ['الغاء', 'الغي', 'الغيه', 'كنسل', 'cancel'])) intent = 'CANCEL_APPOINTMENT';
  else if (containsAny(text, ['اغير', 'غير', 'تغيير', 'بدل', 'انقل', 'move', 'reschedule', 'change']) && containsAny(text, appointmentTerms)) intent = 'RESCHEDULE_APPOINTMENT';
  else if (containsAny(text, appointmentTerms)) intent = 'APPOINTMENT_REQUEST';
  else if (containsAny(text, ['متابعه', 'راجع', 'follow-up', 'follow up', 'followup'])) intent = 'FOLLOW_UP';
  else if (containsAny(text, ['موقع', 'لوكيشن', 'عنوان', 'location', 'address', 'map'])) intent = 'LOCATION_REQUEST';
  else if (containsAny(text, ['دوام', 'تفتحون', 'تسكرون', 'ساعات', 'hours', 'opening', 'closing', 'open', 'close'])) intent = 'BUSINESS_HOURS';
  return { intent, temporal, normalized: text };
}

export function classifyClinicMessage(message = '') {
  return extractClinicSignals(message).intent;
}

export function classifyCelebrityMessage(message = '') {
  const text = normalizeArabic(message);
  if (containsAny(text, ['اعلان', 'advert', 'campaign', 'sponsor'])) return 'ADVERTISING_REQUEST';
  if (containsAny(text, ['تعاون', 'collab', 'collaboration'])) return 'COLLABORATION_REQUEST';
  if (containsAny(text, ['دعوه', 'invite', 'invitation', 'event'])) return 'INVITATION';
  if (containsAny(text, ['موعد', 'appointment', 'meeting'])) return 'APPOINTMENT_REQUEST';
  return 'GENERAL_REQUEST';
}

function safeId(value) {
  const id = String(value || '').trim();
  return UUID_RE.test(id) ? id : null;
}

function cleanText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function projectForBusinessType(type) {
  if (type === 'clinic') return 'pilot_clinics';
  if (type === 'creator') return 'pilot_celebrities';
  return 'pilot_businesses';
}

function intentForBusiness(type, message) {
  if (type === 'clinic') return classifyClinicMessage(message);
  if (type === 'creator') return classifyCelebrityMessage(message);
  const normalized = normalizeArabic(message);
  if (containsAny(normalized, ['موعد', 'حجز', 'appointment', 'booking'])) return 'APPOINTMENT_REQUEST';
  if (containsAny(normalized, ['سعر', 'price', 'cost'])) return 'PRICE_INQUIRY';
  if (containsAny(normalized, ['متوفر', 'availability', 'available', 'stock'])) return 'AVAILABILITY_INQUIRY';
  if (containsAny(normalized, ['شكوى', 'complaint', 'مشكله', 'problem'])) return 'SUPPORT_REQUEST';
  return 'GENERAL_INQUIRY';
}

function languageFor(message, locale = 'ar-AE') {
  const text = String(message || '');
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[A-Za-z]/.test(text)) return 'en';
  return String(locale || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

async function readData(response, fallback = 'DATA_REQUEST_FAILED') {
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(fallback);
    error.status = response.status;
    error.detail = payload?.code || null;
    throw error;
  }
  return payload;
}

async function rest(accessToken, path, options = {}, fallback) {
  return readData(await supabaseRest(path, accessToken, options), fallback);
}

async function rpc(accessToken, name, params = {}, fallback) {
  return readData(await supabaseRpc(name, accessToken, params), fallback);
}

async function requireIdentity(req) {
  const accessToken = accessTokenFromRequest(req);
  if (!accessToken) return null;
  const user = await getVerifiedUser(accessToken);
  if (!user) return null;
  const memberships = await getBusinessMemberships(accessToken);
  return { accessToken, user, memberships };
}

function requireMembership(identity, businessId) {
  return identity.memberships.find(item => item.business_id === businessId) || null;
}

async function getBusiness(accessToken, businessId) {
  const rows = await rest(
    accessToken,
    `pilot_businesses?select=id,slug,name,business_type,locale,demo_mode,created_at,updated_at&id=eq.${businessId}&limit=1`,
    {},
    'BUSINESS_LOOKUP_FAILED',
  );
  return rows?.[0] || null;
}

async function getKnowledge(accessToken, businessId) {
  const rows = await rest(
    accessToken,
    `pilot_business_knowledge?select=knowledge_key,knowledge_type,value,source,confidence,status,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=40`,
    {},
    'KNOWLEDGE_LOOKUP_FAILED',
  );
  return Array.isArray(rows) ? rows : [];
}

function buildBusinessContext(business, knowledge) {
  const verifiedKnowledge = (knowledge || [])
    .filter(item => !item.status || ['active', 'verified', 'approved'].includes(String(item.status).toLowerCase()))
    .slice(0, 30)
    .map(item => ({
      key: item.knowledge_key,
      type: item.knowledge_type,
      value: item.value,
      source: item.source,
      confidence: item.confidence,
    }));
  return JSON.stringify({
    business: {
      name: business?.name || null,
      type: business?.business_type || null,
      locale: business?.locale || null,
    },
    knowledge: verifiedKnowledge,
  });
}

async function loadWorkspace(identity, requestedBusinessId, requestedConversationId) {
  const membership = requestedBusinessId
    ? requireMembership(identity, requestedBusinessId)
    : identity.memberships[0] || null;
  if (!membership) {
    return {
      ok: true,
      authenticated: true,
      user: identity.user,
      needs_onboarding: identity.memberships.length === 0,
      memberships: identity.memberships,
      operational_mode: 'AUTHENTICATED_WEB_RUNTIME',
      whatsapp: { state: 'NOT_OPERATIONAL', blocker: 'META_AUTHORIZATION_NOT_COMPLETED' },
      ai: getPilotAiConfig(),
    };
  }

  const businessId = membership.business_id;
  const business = await getBusiness(identity.accessToken, businessId);
  if (!business) throw Object.assign(new Error('BUSINESS_NOT_FOUND'), { status: 404 });

  const [conversations, customers, appointments, handoffs, followups] = await Promise.all([
    rest(identity.accessToken, `pilot_conversations?select=id,customer_id,channel_type,state,demo_mode,created_at,updated_at&business_id=eq.${businessId}&channel_type=eq.web&order=updated_at.desc&limit=30`, {}, 'CONVERSATIONS_LOOKUP_FAILED'),
    rest(identity.accessToken, `pilot_customers?select=id,display_name,lead_status,metadata,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=50`, {}, 'CUSTOMERS_LOOKUP_FAILED'),
    rest(identity.accessToken, `pilot_appointments?select=id,customer_id,service_id,starts_at,status,simulated,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=50`, {}, 'APPOINTMENTS_LOOKUP_FAILED'),
    rest(identity.accessToken, `pilot_handoffs?select=id,conversation_id,customer_id,route_class,reason,state,priority,summary,created_at,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=30`, {}, 'HANDOFFS_LOOKUP_FAILED'),
    rest(identity.accessToken, `pilot_followups?select=id,conversation_id,customer_id,channel_type,reason,status,due_at,recommended_message,blocked_reason,created_at,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=30`, {}, 'FOLLOWUPS_LOOKUP_FAILED'),
  ]);

  let conversationId = requestedConversationId && safeId(requestedConversationId);
  if (conversationId && !conversations.some(item => item.id === conversationId)) conversationId = null;
  if (!conversationId) conversationId = conversations?.[0]?.id || null;

  const messages = conversationId
    ? await rest(identity.accessToken, `pilot_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at&business_id=eq.${businessId}&conversation_id=eq.${conversationId}&order=created_at.asc&limit=100`, {}, 'MESSAGES_LOOKUP_FAILED')
    : [];

  const aiConfig = getPilotAiConfig();
  return {
    ok: true,
    authenticated: true,
    user: identity.user,
    needs_onboarding: false,
    operational_mode: 'AUTHENTICATED_WEB_RUNTIME',
    membership,
    memberships: identity.memberships,
    business,
    conversations,
    selected_conversation_id: conversationId,
    messages,
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
  };
}

async function createBusiness(identity, body) {
  const name = cleanText(body.name, 120);
  const businessType = cleanText(body.business_type, 40).toLowerCase();
  const locale = cleanText(body.locale || 'ar-AE', 20);
  if (!name) throw Object.assign(new Error('BUSINESS_NAME_REQUIRED'), { status: 400 });
  if (!BUSINESS_TYPES.has(businessType)) throw Object.assign(new Error('UNSUPPORTED_BUSINESS_TYPE'), { status: 400 });

  const result = await rpc(identity.accessToken, 'pilot_create_business', {
    p_name: name,
    p_business_type: businessType,
    p_locale: locale,
  }, 'BUSINESS_CREATE_FAILED');
  const businessId = result?.[0]?.business_id || result?.business_id;
  if (!safeId(businessId)) throw Object.assign(new Error('BUSINESS_CREATE_FAILED'), { status: 502 });

  await rest(identity.accessToken, `pilot_businesses?id=eq.${businessId}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ demo_mode: false, updated_at: new Date().toISOString() }),
  }, 'BUSINESS_ACTIVATION_FAILED');

  return { ok: true, action: 'create_business', business_id: businessId, verified_persisted: true };
}

async function startConversation(identity, body) {
  const businessId = safeId(body.business_id);
  if (!businessId || !requireMembership(identity, businessId)) throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'), { status: 403 });
  const displayName = cleanText(body.display_name || 'Web Customer', 120) || 'Web Customer';

  const customers = await rest(identity.accessToken, 'pilot_customers?select=id,display_name,lead_status,created_at', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      business_id: businessId,
      display_name: displayName,
      lead_status: 'new',
      metadata: { source: 'pilot_web_runtime' },
    }),
  }, 'CUSTOMER_CREATE_FAILED');
  const customer = customers?.[0];
  if (!customer?.id) throw Object.assign(new Error('CUSTOMER_CREATE_FAILED'), { status: 502 });

  const conversations = await rest(identity.accessToken, 'pilot_conversations?select=id,customer_id,channel_type,state,demo_mode,created_at,updated_at', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      business_id: businessId,
      customer_id: customer.id,
      channel_type: 'web',
      state: 'ai_active',
      demo_mode: false,
    }),
  }, 'CONVERSATION_CREATE_FAILED');
  const conversation = conversations?.[0];
  if (!conversation?.id) throw Object.assign(new Error('CONVERSATION_CREATE_FAILED'), { status: 502 });

  return {
    ok: true,
    action: 'start_conversation',
    customer,
    conversation,
    channel: 'web',
    verified_persisted: true,
    external_side_effects: false,
  };
}

async function sendMessage(identity, body) {
  const businessId = safeId(body.business_id);
  const conversationId = safeId(body.conversation_id);
  const message = cleanText(body.message, 2000);
  if (!businessId || !conversationId || !message) throw Object.assign(new Error('MESSAGE_INPUT_REQUIRED'), { status: 400 });
  if (!requireMembership(identity, businessId)) throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'), { status: 403 });

  const conversations = await rest(identity.accessToken, `pilot_conversations?select=id,customer_id,channel_type,state,demo_mode&business_id=eq.${businessId}&id=eq.${conversationId}&limit=1`, {}, 'CONVERSATION_LOOKUP_FAILED');
  const conversation = conversations?.[0];
  if (!conversation || conversation.channel_type !== 'web') throw Object.assign(new Error('WEB_CONVERSATION_NOT_FOUND'), { status: 404 });
  if (conversation.demo_mode) throw Object.assign(new Error('REAL_RUNTIME_REQUIRES_NON_DEMO_CONVERSATION'), { status: 409 });

  const mayReply = await rpc(identity.accessToken, 'pilot_ai_may_reply', {
    p_business_id: businessId,
    p_conversation_id: conversationId,
  }, 'AI_POLICY_CHECK_FAILED');
  if (mayReply !== true) throw Object.assign(new Error('AI_REPLY_BLOCKED_BY_HANDOFF_STATE'), { status: 409 });

  const [business, knowledge, history] = await Promise.all([
    getBusiness(identity.accessToken, businessId),
    getKnowledge(identity.accessToken, businessId),
    rest(identity.accessToken, `pilot_messages?select=sender_type,body,created_at&business_id=eq.${businessId}&conversation_id=eq.${conversationId}&order=created_at.asc&limit=30`, {}, 'MESSAGE_HISTORY_FAILED'),
  ]);
  if (!business) throw Object.assign(new Error('BUSINESS_NOT_FOUND'), { status: 404 });

  const intent = intentForBusiness(business.business_type, message);
  const insertedCustomer = await rest(identity.accessToken, 'pilot_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      business_id: businessId,
      conversation_id: conversationId,
      sender_type: 'customer',
      body: message,
      intent,
      simulated: false,
    }),
  }, 'CUSTOMER_MESSAGE_PERSIST_FAILED');

  const language = languageFor(message, business.locale);
  const aiResult = await generatePilotAiReply({
    project: projectForBusinessType(business.business_type),
    message,
    language,
    businessContext: buildBusinessContext(business, knowledge),
    history,
  });

  if (!aiResult.ok) {
    await rest(identity.accessToken, `pilot_conversations?business_id=eq.${businessId}&id=eq.${conversationId}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ state: 'action_required', updated_at: new Date().toISOString() }),
    }, 'CONVERSATION_STATE_UPDATE_FAILED').catch(() => null);
    return {
      ok: false,
      action: 'send_message',
      error: aiResult.error || aiResult.state || 'AI_PROVIDER_FAILED',
      ai_state: aiResult.state,
      customer_message_persisted: true,
      customer_message: insertedCustomer?.[0] || null,
      external_side_effects: false,
    };
  }

  const insertedAi = await rest(identity.accessToken, 'pilot_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      business_id: businessId,
      conversation_id: conversationId,
      sender_type: 'ai',
      body: aiResult.reply,
      intent,
      simulated: false,
    }),
  }, 'AI_MESSAGE_PERSIST_FAILED');

  await rest(identity.accessToken, `pilot_conversations?business_id=eq.${businessId}&id=eq.${conversationId}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ state: 'waiting_customer', updated_at: new Date().toISOString() }),
  }, 'CONVERSATION_STATE_UPDATE_FAILED');

  return {
    ok: true,
    action: 'send_message',
    channel: 'web',
    provider: aiResult.provider,
    model: aiResult.model,
    cost_mode: aiResult.cost_mode,
    grounding_state: aiResult.grounding_state,
    guarded: aiResult.guarded,
    customer_message: insertedCustomer?.[0] || null,
    ai_message: insertedAi?.[0] || null,
    verified: {
      customer_message_persisted: true,
      ai_message_persisted: true,
      conversation_state_persisted: true,
    },
    external_side_effects: false,
  };
}

async function createAppointment(identity, body) {
  const businessId = safeId(body.business_id);
  if (!businessId || !requireMembership(identity, businessId)) throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'), { status: 403 });
  let customerId = safeId(body.customer_id);
  const startsAt = new Date(String(body.starts_at || ''));
  if (Number.isNaN(startsAt.getTime())) throw Object.assign(new Error('VALID_START_TIME_REQUIRED'), { status: 400 });

  if (!customerId) {
    const customerName = cleanText(body.customer_name || 'Customer', 120) || 'Customer';
    const customers = await rest(identity.accessToken, 'pilot_customers?select=id,display_name,lead_status,created_at', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        business_id: businessId,
        display_name: customerName,
        lead_status: 'new',
        metadata: { source: 'pilot_appointment_runtime' },
      }),
    }, 'CUSTOMER_CREATE_FAILED');
    customerId = customers?.[0]?.id || null;
  }

  const rows = await rest(identity.accessToken, 'pilot_appointments?select=id,customer_id,service_id,starts_at,status,simulated,created_at', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      business_id: businessId,
      customer_id: customerId,
      service_id: safeId(body.service_id),
      starts_at: startsAt.toISOString(),
      status: 'requested',
      simulated: false,
    }),
  }, 'APPOINTMENT_CREATE_FAILED');

  return {
    ok: true,
    action: 'create_appointment',
    appointment: rows?.[0] || null,
    verified_persisted: Boolean(rows?.[0]?.id),
    external_side_effects: false,
  };
}

async function createFollowup(identity, body) {
  const businessId = safeId(body.business_id);
  const conversationId = safeId(body.conversation_id);
  if (!businessId || !conversationId || !requireMembership(identity, businessId)) throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'), { status: 403 });
  const reason = cleanText(body.reason || 'customer_followup', 240) || 'customer_followup';
  const due = body.due_at ? new Date(String(body.due_at)) : null;
  if (due && Number.isNaN(due.getTime())) throw Object.assign(new Error('INVALID_FOLLOWUP_TIME'), { status: 400 });

  const conversations = await rest(identity.accessToken, `pilot_conversations?select=id,customer_id,channel_type&business_id=eq.${businessId}&id=eq.${conversationId}&limit=1`, {}, 'CONVERSATION_LOOKUP_FAILED');
  const conversation = conversations?.[0];
  if (!conversation) throw Object.assign(new Error('CONVERSATION_NOT_FOUND'), { status: 404 });

  const rows = await rest(identity.accessToken, 'pilot_followups?select=id,conversation_id,customer_id,channel_type,reason,status,due_at,recommended_message,created_at,updated_at', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      business_id: businessId,
      conversation_id: conversationId,
      customer_id: conversation.customer_id,
      channel_type: conversation.channel_type,
      reason,
      status: 'candidate',
      due_at: due ? due.toISOString() : null,
      recommended_message: cleanText(body.recommended_message, 1000) || null,
      metadata: { source: 'pilot_web_runtime' },
    }),
  }, 'FOLLOWUP_CREATE_FAILED');

  return {
    ok: true,
    action: 'create_followup',
    followup: rows?.[0] || null,
    verified_persisted: Boolean(rows?.[0]?.id),
    external_side_effects: false,
  };
}

export default async function handler(req, res) {
  const identity = await requireIdentity(req).catch(() => null);
  if (!identity) return json(res, 401, { ok: false, authenticated: false, error: 'AUTH_REQUIRED' });

  try {
    if (req.method === 'GET') {
      const businessId = safeId(req.query?.business_id);
      const conversationId = safeId(req.query?.conversation_id);
      return json(res, 200, await loadWorkspace(identity, businessId, conversationId));
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET, POST' });
    if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

    const body = await readJsonBody(req);
    const action = cleanText(body.action, 60);
    let result;
    if (action === 'create_business') result = await createBusiness(identity, body);
    else if (action === 'start_conversation') result = await startConversation(identity, body);
    else if (action === 'send_message') result = await sendMessage(identity, body);
    else if (action === 'create_appointment') result = await createAppointment(identity, body);
    else if (action === 'create_followup') result = await createFollowup(identity, body);
    else return json(res, 400, { ok: false, error: 'UNSUPPORTED_ACTION' });

    return json(res, result.ok === false ? 502 : 200, result);
  } catch (error) {
    const status = Number(error?.status || error?.code || 500);
    const safeStatus = [400, 401, 403, 404, 409, 413, 429, 502, 503].includes(status) ? status : 500;
    return json(res, safeStatus, {
      ok: false,
      error: cleanText(error?.message || 'RUNTIME_FAILED', 120) || 'RUNTIME_FAILED',
      detail: error?.detail || undefined,
      external_side_effects: false,
    });
  }
}
