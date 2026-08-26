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
import { generateDABBIRAiReply } from './_ai-core.js';

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
  if (/[\u0600-\u06FF]/.test(String(message || ''))) return 'ar';
  if (/[A-Za-z]/.test(String(message || ''))) return 'en';
  return String(locale).toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function projectFor(type) {
  if (type === 'clinic') return 'dabbir_clinics';
  if (type === 'creator') return 'dabbir_celebrities';
  return 'dabbir_businesses';
}

function verifiedKnowledge(knowledge = []) {
  return knowledge.filter(item => !item.status || ['active', 'verified', 'approved'].includes(String(item.status).toLowerCase()));
}

function buildContext(business, knowledge = []) {
  return JSON.stringify({
    business: { name: business.name, type: business.business_type, locale: business.locale },
    knowledge: verifiedKnowledge(knowledge).slice(0, 12).map(item => ({
      key: item.knowledge_key,
      type: item.knowledge_type,
      value: item.value,
      source: item.source,
    })),
  });
}

function fallbackReply(language) {
  return language === 'ar'
    ? 'وصلت رسالتك. أقدر أكمل معك الآن، وسأستخدم فقط المعلومات الموثقة في DABBIR بدون تخمين.'
    : 'I received your message. I can continue now using only verified information in DABBIR without guessing.';
}

export default async function handler(req, res) {
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
    if (!businessId || !conversationId) return json(res, 400, { ok: false, error: 'RECOVERY_INPUT_REQUIRED' });
    if (!memberships.some(item => item.business_id === businessId)) return json(res, 403, { ok: false, error: 'BUSINESS_ACCESS_DENIED' });

    const [conversations, businesses, knowledge, historyDesc, mayReply] = await Promise.all([
      rest(accessToken, `dabbir_conversations?select=id,channel_type,state,demo_mode&business_id=eq.${businessId}&id=eq.${conversationId}&limit=1`, {}, 'CONVERSATION_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_businesses?select=id,name,business_type,locale,demo_mode&id=eq.${businessId}&limit=1`, {}, 'BUSINESS_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_business_knowledge?select=knowledge_key,knowledge_type,value,source,status&business_id=eq.${businessId}&order=updated_at.desc&limit=12`, {}, 'KNOWLEDGE_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_messages?select=id,sender_type,body,intent,created_at&business_id=eq.${businessId}&conversation_id=eq.${conversationId}&order=created_at.desc&limit=8`, {}, 'MESSAGE_HISTORY_FAILED'),
      rpc(accessToken, 'dabbir_ai_may_reply', { p_business_id: businessId, p_conversation_id: conversationId }, 'AI_POLICY_CHECK_FAILED'),
    ]);

    const conversation = conversations?.[0];
    const business = businesses?.[0];
    if (!conversation || conversation.channel_type !== 'web') return json(res, 404, { ok: false, error: 'WEB_CONVERSATION_NOT_FOUND' });
    if (!business) return json(res, 404, { ok: false, error: 'BUSINESS_NOT_FOUND' });
    if (conversation.demo_mode) return json(res, 409, { ok: false, error: 'REAL_RUNTIME_REQUIRES_NON_DEMO_CONVERSATION' });
    if (mayReply !== true) return json(res, 409, { ok: false, error: 'AI_REPLY_BLOCKED_BY_HANDOFF_STATE' });

    const latest = Array.isArray(historyDesc) ? historyDesc[0] : null;
    if (!latest || latest.sender_type !== 'customer') {
      return json(res, 200, { ok: true, recovered: false, reason: 'NO_ORPHANED_CUSTOMER_MESSAGE' });
    }

    const message = cleanText(latest.body, 2000);
    const language = languageFor(message, business.locale);
    const history = historyDesc.slice(1).reverse();
    const aiResult = await generateDABBIRAiReply({
      project: projectFor(business.business_type),
      message,
      language,
      businessContext: buildContext(business, knowledge),
      history,
    });
    const reply = aiResult.ok ? aiResult.reply : fallbackReply(language);

    const aiRows = await rest(accessToken, 'dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        business_id: businessId,
        conversation_id: conversationId,
        sender_type: 'ai',
        body: reply,
        intent: latest.intent || 'GENERAL_INQUIRY',
        simulated: false,
      }),
    }, 'AI_MESSAGE_PERSIST_FAILED');

    await rest(accessToken, `dabbir_conversations?business_id=eq.${businessId}&id=eq.${conversationId}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ state: 'waiting_customer', updated_at: new Date().toISOString() }),
    }, 'CONVERSATION_STATE_UPDATE_FAILED');

    console.info('dabbir_chat_recovered', {
      upstream_state: aiResult.state || 'SUCCESS',
      upstream_model: aiResult.model || null,
      fallback: !aiResult.ok,
    });

    return json(res, 200, {
      ok: true,
      recovered: true,
      degraded: !aiResult.ok,
      ai_message: aiRows?.[0] || null,
      upstream_ai_state: aiResult.state || 'SUCCESS',
      external_side_effects: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 413, 429, 502, 503].includes(status) ? status : 500;
    console.error('dabbir_chat_recovery_failed', { error: cleanText(error?.message || 'CHAT_RECOVERY_FAILED', 120), status: safeStatus });
    return json(res, safeStatus, { ok: false, error: cleanText(error?.message || 'CHAT_RECOVERY_FAILED', 120), detail: error?.detail || undefined });
  }
}
