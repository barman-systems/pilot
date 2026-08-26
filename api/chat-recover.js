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

function normalizeLocal(value = '') {
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

function intentFor(type, message) {
  const text = normalizeLocal(message);
  if (type === 'clinic' && /(موعد|حجز|appointment|booking)/i.test(text)) return 'APPOINTMENT_REQUEST';
  if (type === 'creator' && /(اعلان|advert|campaign|sponsor)/i.test(text)) return 'ADVERTISING_REQUEST';
  if (/(سعر|price|cost|كم ب|بكم)/i.test(text)) return 'PRICE_INQUIRY';
  if (/(متوفر|توفر|availability|available|stock)/i.test(text)) return 'AVAILABILITY_INQUIRY';
  if (/(شكوى|مشكله|complaint|problem)/i.test(text)) return 'SUPPORT_REQUEST';
  return 'GENERAL_INQUIRY';
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

function containsContactKnowledge(knowledge = []) {
  return verifiedKnowledge(knowledge).some(item => {
    const descriptor = `${item.knowledge_key || ''} ${item.knowledge_type || ''}`.toLowerCase();
    return /(phone|mobile|contact|email|whatsapp|website|url|هاتف|جوال|تواصل|بريد|واتساب|موقع)/i.test(descriptor);
  });
}

function recentCustomerText(history = []) {
  return normalizeLocal(
    (history || [])
      .filter(item => item?.sender_type === 'customer')
      .slice(-4)
      .map(item => item.body || '')
      .join(' '),
  );
}

function deterministicRecoveryReply({ message, language, intent, business, knowledge, history }) {
  const text = normalizeLocal(message);
  const ar = language === 'ar';
  const previousCustomer = recentCustomerText(history);
  const hasKnowledge = verifiedKnowledge(knowledge).length > 0;

  if (/^(هلا|هلا والله|مرحبا|مرحبا بك|السلام عليكم|سلام|hello|hi|hey)[!.،,\s]*$/i.test(text)) {
    return ar ? 'هلا وغلا! كيف أقدر أساعدك؟' : 'Hi! How can I help you?';
  }
  if (/^(شكرا|شكرا لك|مشكور|يعطيك العافيه|thanks|thank you|thx)[!.،,\s]*$/i.test(text)) {
    return ar ? 'العفو، أنا حاضر. إذا تحتاج أي شيء إضافي قل لي.' : 'You’re welcome. I’m here if you need anything else.';
  }

  const contactPattern = /(كيف اتواصل|تواصل مع|رقم|واتساب|whatsapp|contact|phone|email|ايميل)/i;
  const shortFollowup = text.length <= 14;
  if ((contactPattern.test(text) || (shortFollowup && contactPattern.test(previousCustomer))) && !containsContactKnowledge(knowledge)) {
    return ar
      ? 'حالياً ما عندي وسيلة تواصل موثقة لهذا النشاط داخل DABBIR، لذلك ما بعطيك رقم أو رابط من عندي. أقدر أكمل معك هنا، وإذا أضيفت بيانات التواصل الموثقة سأستخدمها تلقائياً.'
      : 'I do not have a verified contact method for this business in DABBIR yet, so I will not invent a number or link. I can continue helping you here and will use verified contact details once they are added.';
  }

  const orderOrBring = /(ابا|ابي|أبي|اريد|أريد|بغيت|جيب|تييب|تجيب|اطلب|طلب|order|bring|deliver)/i.test(text);
  if (business.business_type === 'store' && orderOrBring) {
    return ar
      ? 'أقدر أساعدك بترتيب طلب المنتج، لكن ما أقدر أنفذ شراء أو توصيل خارجي من هذه المحادثة بدون إجراء موثّق. اذكر المنتج والكمية وسأكمل بالمعلومات المتاحة في النظام.'
      : 'I can help organize the product request, but I cannot claim an external purchase or delivery without a verified action. Tell me the product and quantity and I will continue with the information available in the system.';
  }

  if (business.business_type === 'store' && !hasKnowledge && /(توصيل|شحن|توصلون|delivery|shipping|ship)/i.test(text)) {
    return ar
      ? 'تفاصيل التوصيل والشحن غير موثقة في بيانات المتجر عندي حالياً، لذلك ما بخمّنها. اذكر المنطقة أو الطلب الذي تقصده وسأكمل بالمعلومة المتاحة فقط.'
      : 'Delivery and shipping details are not verified in the store data yet, so I will not guess. Tell me the area or order you mean and I will continue using only available information.';
  }

  if (intent === 'PRICE_INQUIRY' && !hasKnowledge) {
    return ar
      ? 'الأسعار غير مضافة كبيانات موثقة للنشاط عندي حالياً. اذكر اسم المنتج أو الخدمة التي تقصدها، ولن أعطيك سعراً غير مؤكد.'
      : 'Verified pricing has not been added to this business yet. Tell me the product or service you mean, and I will not give you an unverified price.';
  }

  if (intent === 'AVAILABILITY_INQUIRY' && !hasKnowledge) {
    return ar
      ? 'المخزون أو التوفر غير موثق في بيانات النشاط عندي حالياً. اذكر المنتج الذي تقصده، ولن أؤكد توفرًا غير موجود في النظام.'
      : 'Stock or availability is not verified in the business data yet. Tell me which product you mean, and I will not claim availability that is not in the system.';
  }

  return null;
}

function failureFallbackReply({ language, business }) {
  const ar = language === 'ar';
  if (business.business_type === 'store') {
    return ar
      ? 'أقدر أكمل معك، لكن ما عندي معلومة موثقة كافية للإجابة الدقيقة على هذا الطلب. وضّح المنتج أو الطلب أو المشكلة المطلوبة وسأعطيك فقط ما هو مؤكد.'
      : 'I can continue, but I do not have enough verified information to answer this request precisely. Clarify the product, order, or issue and I will use only confirmed information.';
  }
  return ar
    ? 'أقدر أكمل معك، لكن ما عندي معلومة موثقة كافية للإجابة الدقيقة على هذا الطلب. وضّح المطلوب وسأعطيك فقط ما هو مؤكد.'
    : 'I can continue, but I do not have enough verified information to answer this request precisely. Clarify what you need and I will use only confirmed information.';
}

async function persistReply({ accessToken, businessId, conversationId, intent, reply }) {
  const aiRows = await rest(accessToken, 'dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      business_id: businessId,
      conversation_id: conversationId,
      sender_type: 'ai',
      body: reply,
      intent,
      simulated: false,
    }),
  }, 'AI_MESSAGE_PERSIST_FAILED');

  await rest(accessToken, `dabbir_conversations?business_id=eq.${businessId}&id=eq.${conversationId}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ state: 'waiting_customer', updated_at: new Date().toISOString() }),
  }, 'CONVERSATION_STATE_UPDATE_FAILED');

  return aiRows?.[0] || null;
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

  let claimed = false;
  let claimedBusinessId = null;
  let claimedConversationId = null;

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
    if (conversation.state !== 'action_required') return json(res, 200, { ok: true, recovered: false, reason: 'CONVERSATION_NOT_ACTION_REQUIRED' });
    if (mayReply !== true) return json(res, 409, { ok: false, error: 'AI_REPLY_BLOCKED_BY_HANDOFF_STATE' });

    const latest = Array.isArray(historyDesc) ? historyDesc[0] : null;
    if (!latest || latest.sender_type !== 'customer') {
      return json(res, 200, { ok: true, recovered: false, reason: 'NO_ORPHANED_CUSTOMER_MESSAGE' });
    }

    const claimRows = await rest(accessToken, `dabbir_conversations?select=id,state&business_id=eq.${businessId}&id=eq.${conversationId}&state=eq.action_required`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ state: 'ai_active', updated_at: new Date().toISOString() }),
    }, 'RECOVERY_CLAIM_FAILED');
    if (!claimRows?.length) return json(res, 200, { ok: true, recovered: false, reason: 'RECOVERY_ALREADY_CLAIMED' });

    claimed = true;
    claimedBusinessId = businessId;
    claimedConversationId = conversationId;

    const message = cleanText(latest.body, 2000);
    const language = languageFor(message, business.locale);
    const intent = latest.intent || intentFor(business.business_type, message);
    const history = historyDesc.slice(1).reverse();

    const deterministicReply = deterministicRecoveryReply({ message, language, intent, business, knowledge, history });
    if (deterministicReply) {
      const aiMessage = await persistReply({ accessToken, businessId, conversationId, intent, reply: deterministicReply });
      claimed = false;
      return json(res, 200, {
        ok: true,
        recovered: true,
        degraded: false,
        provider: 'dabbir-local-recovery',
        model: 'deterministic-v2',
        ai_message: aiMessage,
        external_side_effects: false,
      });
    }

    const aiResult = await generateDABBIRAiReply({
      project: projectFor(business.business_type),
      message,
      language,
      businessContext: buildContext(business, knowledge),
      history,
    });
    const reply = aiResult.ok ? aiResult.reply : failureFallbackReply({ language, business });
    const aiMessage = await persistReply({ accessToken, businessId, conversationId, intent, reply });
    claimed = false;

    console.info('dabbir_chat_recovered', {
      upstream_state: aiResult.state || 'SUCCESS',
      upstream_model: aiResult.model || null,
      fallback: !aiResult.ok,
    });

    return json(res, 200, {
      ok: true,
      recovered: true,
      degraded: !aiResult.ok,
      ai_message: aiMessage,
      upstream_ai_state: aiResult.state || 'SUCCESS',
      external_side_effects: false,
    });
  } catch (error) {
    if (claimed && claimedBusinessId && claimedConversationId) {
      try {
        await rest(accessToken, `dabbir_conversations?business_id=eq.${claimedBusinessId}&id=eq.${claimedConversationId}&state=eq.ai_active`, {
          method: 'PATCH',
          headers: { prefer: 'return=minimal' },
          body: JSON.stringify({ state: 'action_required', updated_at: new Date().toISOString() }),
        }, 'RECOVERY_STATE_RESTORE_FAILED');
      } catch {}
    }
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 413, 429, 502, 503].includes(status) ? status : 500;
    console.error('dabbir_chat_recovery_failed', { error: cleanText(error?.message || 'CHAT_RECOVERY_FAILED', 120), status: safeStatus });
    return json(res, safeStatus, { ok: false, error: cleanText(error?.message || 'CHAT_RECOVERY_FAILED', 120), detail: error?.detail || undefined });
  }
}
