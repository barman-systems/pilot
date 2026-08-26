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
import { generatePilotAiReply } from './_ai-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId = value => UUID_RE.test(String(value || '').trim()) ? String(value).trim() : null;
const cleanText = (value, max = 2000) => String(value || '').trim().slice(0, max);

async function readData(response, fallback) {
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

const rest = (token, path, options = {}, fallback = 'DATA_REQUEST_FAILED') =>
  supabaseRest(path, token, options).then(response => readData(response, fallback));
const rpc = (token, name, params = {}, fallback = 'RPC_FAILED') =>
  supabaseRpc(name, token, params).then(response => readData(response, fallback));

function languageFor(message, locale = 'ar-AE') {
  if (/[\u0600-\u06FF]/.test(message)) return 'ar';
  if (/[A-Za-z]/.test(message)) return 'en';
  return String(locale).toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function projectFor(type) {
  if (type === 'clinic') return 'pilot_clinics';
  if (type === 'creator') return 'pilot_celebrities';
  return 'pilot_businesses';
}

function intentFor(type, message) {
  const text = String(message || '').toLowerCase();
  if (type === 'clinic' && /(موعد|حجز|appointment|booking)/i.test(text)) return 'APPOINTMENT_REQUEST';
  if (type === 'creator' && /(اعلان|إعلان|advert|campaign|sponsor)/i.test(text)) return 'ADVERTISING_REQUEST';
  if (/(سعر|price|cost)/i.test(text)) return 'PRICE_INQUIRY';
  if (/(متوفر|availability|available|stock)/i.test(text)) return 'AVAILABILITY_INQUIRY';
  if (/(شكوى|مشكله|مشكلة|complaint|problem)/i.test(text)) return 'SUPPORT_REQUEST';
  return 'GENERAL_INQUIRY';
}

function buildContext(business, knowledge = []) {
  const verified = knowledge
    .filter(item => !item.status || ['active', 'verified', 'approved'].includes(String(item.status).toLowerCase()))
    .slice(0, 12)
    .map(item => ({ key: item.knowledge_key, type: item.knowledge_type, value: item.value, source: item.source }));
  return JSON.stringify({
    business: { name: business.name, type: business.business_type, locale: business.locale },
    knowledge: verified,
  });
}

export default async function handler(req, res) {
  const started = Date.now();
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  const accessToken = accessTokenFromRequest(req);
  if (!accessToken) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  const [user, memberships] = await Promise.all([
    getVerifiedUser(accessToken).catch(() => null),
    getBusinessMemberships(accessToken).catch(() => []),
  ]);
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const businessId = safeId(body.business_id);
    const conversationId = safeId(body.conversation_id);
    const message = cleanText(body.message, 2000);
    if (!businessId || !conversationId || !message) return json(res, 400, { ok: false, error: 'MESSAGE_INPUT_REQUIRED' });
    if (!memberships.some(item => item.business_id === businessId)) return json(res, 403, { ok: false, error: 'BUSINESS_ACCESS_DENIED' });

    const lookupStarted = Date.now();
    const [conversations, businesses, knowledge, historyDesc, mayReply] = await Promise.all([
      rest(accessToken, `pilot_conversations?select=id,customer_id,channel_type,state,demo_mode&business_id=eq.${businessId}&id=eq.${conversationId}&limit=1`, {}, 'CONVERSATION_LOOKUP_FAILED'),
      rest(accessToken, `pilot_businesses?select=id,name,business_type,locale,demo_mode&id=eq.${businessId}&limit=1`, {}, 'BUSINESS_LOOKUP_FAILED'),
      rest(accessToken, `pilot_business_knowledge?select=knowledge_key,knowledge_type,value,source,status&business_id=eq.${businessId}&order=updated_at.desc&limit=12`, {}, 'KNOWLEDGE_LOOKUP_FAILED'),
      rest(accessToken, `pilot_messages?select=sender_type,body,created_at&business_id=eq.${businessId}&conversation_id=eq.${conversationId}&order=created_at.desc&limit=8`, {}, 'MESSAGE_HISTORY_FAILED'),
      rpc(accessToken, 'pilot_ai_may_reply', { p_business_id: businessId, p_conversation_id: conversationId }, 'AI_POLICY_CHECK_FAILED'),
    ]);
    const lookupMs = Date.now() - lookupStarted;

    const conversation = conversations?.[0];
    const business = businesses?.[0];
    if (!conversation || conversation.channel_type !== 'web') return json(res, 404, { ok: false, error: 'WEB_CONVERSATION_NOT_FOUND' });
    if (conversation.demo_mode) return json(res, 409, { ok: false, error: 'REAL_RUNTIME_REQUIRES_NON_DEMO_CONVERSATION' });
    if (!business) return json(res, 404, { ok: false, error: 'BUSINESS_NOT_FOUND' });
    if (mayReply !== true) return json(res, 409, { ok: false, error: 'AI_REPLY_BLOCKED_BY_HANDOFF_STATE' });

    const intent = intentFor(business.business_type, message);
    const customerRows = await rest(accessToken, 'pilot_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ business_id: businessId, conversation_id: conversationId, sender_type: 'customer', body: message, intent, simulated: false }),
    }, 'CUSTOMER_MESSAGE_PERSIST_FAILED');
    const customerMessage = customerRows?.[0] || null;

    const aiStarted = Date.now();
    const aiResult = await generatePilotAiReply({
      project: projectFor(business.business_type),
      message,
      language: languageFor(message, business.locale),
      businessContext: buildContext(business, knowledge),
      history: Array.isArray(historyDesc) ? historyDesc.slice().reverse() : [],
    });
    const aiMs = Date.now() - aiStarted;

    if (!aiResult.ok) {
      await rest(accessToken, `pilot_conversations?business_id=eq.${businessId}&id=eq.${conversationId}`, {
        method: 'PATCH',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ state: 'action_required', updated_at: new Date().toISOString() }),
      }, 'CONVERSATION_STATE_UPDATE_FAILED').catch(() => null);
      console.warn('pilot_chat_ai_failed', { state: aiResult.state, error: aiResult.error, model: aiResult.model, lookup_ms: lookupMs, ai_ms: aiMs, total_ms: Date.now() - started });
      return json(res, 503, {
        ok: false,
        error: aiResult.error || aiResult.state || 'AI_PROVIDER_FAILED',
        ai_state: aiResult.state,
        retryable: true,
        customer_message_persisted: true,
        customer_message: customerMessage,
        timing: { lookup_ms: lookupMs, ai_ms: aiMs, total_ms: Date.now() - started },
      });
    }

    const finalStarted = Date.now();
    const [aiRows] = await Promise.all([
      rest(accessToken, 'pilot_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at', {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({ business_id: businessId, conversation_id: conversationId, sender_type: 'ai', body: aiResult.reply, intent, simulated: false }),
      }, 'AI_MESSAGE_PERSIST_FAILED'),
      rest(accessToken, `pilot_conversations?business_id=eq.${businessId}&id=eq.${conversationId}`, {
        method: 'PATCH',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ state: 'waiting_customer', updated_at: new Date().toISOString() }),
      }, 'CONVERSATION_STATE_UPDATE_FAILED'),
    ]);
    const finalMs = Date.now() - finalStarted;
    const totalMs = Date.now() - started;

    console.info('pilot_chat_completed', { model: aiResult.model, lookup_ms: lookupMs, ai_ms: aiMs, final_ms: finalMs, total_ms: totalMs });
    return json(res, 200, {
      ok: true,
      provider: aiResult.provider,
      model: aiResult.model,
      customer_message: customerMessage,
      ai_message: aiRows?.[0] || null,
      timing: { lookup_ms: lookupMs, ai_ms: aiMs, final_ms: finalMs, total_ms: totalMs },
      external_side_effects: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 413, 429, 502, 503].includes(status) ? status : 500;
    console.error('pilot_chat_failed', { error: cleanText(error?.message || 'CHAT_SEND_FAILED', 120), status: safeStatus, total_ms: Date.now() - started });
    return json(res, safeStatus, { ok: false, error: cleanText(error?.message || 'CHAT_SEND_FAILED', 120), detail: error?.detail || undefined });
  }
}
