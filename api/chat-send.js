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
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

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

function inventoryMap(inventory = []) {
  return new Map((inventory || []).map(row => [row.product_id, row]));
}

function activeProducts(products = []) {
  return (products || []).filter(product => product.active !== false);
}

function productOperationalFact(product, inventory = []) {
  const stock = inventoryMap(inventory).get(product?.id) || { quantity: 0, reserved: 0 };
  const quantity = Math.max(0, number(stock.quantity));
  const reserved = Math.max(0, number(stock.reserved));
  return {
    id: product?.id || null,
    name: product?.name || '',
    sku: product?.sku || '',
    price_aed: Number(number(product?.price_aed).toFixed(2)),
    quantity,
    reserved,
    available: Math.max(0, quantity - reserved),
  };
}

function findProduct(message, products = []) {
  const text = normalizeLocal(message);
  const active = activeProducts(products);
  const exact = active.filter(product => {
    const name = normalizeLocal(product.name);
    const sku = normalizeLocal(product.sku);
    return (name && text.includes(name)) || (sku && text.includes(sku));
  });
  if (exact.length === 1) return exact[0];
  if (active.length === 1) return active[0];
  return null;
}

function buildContext(business, knowledge = [], products = [], inventory = [], services = []) {
  const verified = verifiedKnowledge(knowledge)
    .slice(0, 12)
    .map(item => ({ key: item.knowledge_key, type: item.knowledge_type, value: item.value, source: item.source }));
  const catalog = activeProducts(products).slice(0, 30).map(product => productOperationalFact(product, inventory));
  const serviceRows = (services || []).filter(service => service.active !== false).slice(0, 20).map(service => ({
    name: service.name,
    duration_minutes: service.duration_minutes,
  }));
  return JSON.stringify({
    business: { name: business.name, type: business.business_type, locale: business.locale },
    knowledge: verified,
    live_operations: {
      products: catalog,
      services: serviceRows,
      source: 'DABBIR live tenant data',
      rule: 'Treat product price and available stock here as authoritative for this response. Never invent missing values.',
    },
  });
}

function containsContactKnowledge(knowledge = []) {
  return verifiedKnowledge(knowledge).some(item => {
    const descriptor = `${item.knowledge_key || ''} ${item.knowledge_type || ''}`.toLowerCase();
    return /(phone|mobile|contact|email|whatsapp|website|url|هاتف|جوال|تواصل|بريد|واتساب|موقع)/i.test(descriptor);
  });
}

function productReply({ message, language, business, products, inventory }) {
  if (business.business_type !== 'store') return null;
  const text = normalizeLocal(message);
  const asksPrice = /(سعر|price|cost|كم ب|بكم)/i.test(text);
  const asksAvailability = /(متوفر|توفر|availability|available|stock)/i.test(text);
  if (!asksPrice && !asksAvailability) return null;

  const active = activeProducts(products);
  const product = findProduct(message, active);
  const ar = language === 'ar';
  if (!product) {
    if (!active.length) return null;
    const names = active.slice(0, 3).map(item => item.name).filter(Boolean).join('، ');
    return ar
      ? `عندي أكثر من منتج في النظام. حدد اسم المنتج الذي تقصده${names ? `، مثل: ${names}` : ''}، وسأعطيك السعر والتوفر الموثقين.`
      : `There is more than one product in the system. Tell me which product you mean${names ? `, for example: ${names}` : ''}, and I’ll give you its verified price and availability.`;
  }

  const fact = productOperationalFact(product, inventory);
  const price = `${fact.price_aed.toFixed(2)} ${ar ? 'د.إ' : 'AED'}`;
  const availabilityAr = fact.available > 0 ? `ومتوفر حاليًا، والكمية المتاحة ${fact.available}` : 'وغير متوفر حاليًا في المخزون';
  const availabilityEn = fact.available > 0 ? `and it is currently available (${fact.available} available)` : 'and it is currently out of stock';

  if (asksPrice && asksAvailability) {
    return ar ? `${fact.name} سعره ${price}، ${availabilityAr}.` : `${fact.name} is ${price}, ${availabilityEn}.`;
  }
  if (asksPrice) return ar ? `${fact.name} سعره الموثق في دَبِّر هو ${price}.` : `The verified price for ${fact.name} in DABBIR is ${price}.`;
  return ar ? `${fact.name} ${availabilityAr}.` : `${fact.name} is ${availabilityEn}.`;
}

function instantGroundedReply({ message, language, intent, business, knowledge, products, inventory }) {
  const text = normalizeLocal(message);
  const ar = language === 'ar';
  const hasKnowledge = verifiedKnowledge(knowledge).length > 0;

  if (/^(هلا|هلا والله|مرحبا|مرحبا بك|السلام عليكم|سلام|hello|hi|hey)[!.،,\s]*$/i.test(text)) {
    return ar ? 'هلا وغلا! كيف أقدر أساعدك؟' : 'Hi! How can I help you?';
  }
  if (/^(شكرا|شكرا لك|مشكور|يعطيك العافيه|thanks|thank you|thx)[!.،,\s]*$/i.test(text)) {
    return ar ? 'العفو، أنا حاضر. إذا تحتاج أي شيء إضافي قل لي.' : 'You’re welcome. I’m here if you need anything else.';
  }

  const liveProductReply = productReply({ message, language, business, products, inventory });
  if (liveProductReply) return liveProductReply;

  const asksContact = /(كيف اتواصل|تواصل مع|رقم|واتساب|whatsapp|contact|phone|email|ايميل)/i.test(text);
  if (asksContact && !containsContactKnowledge(knowledge)) {
    return ar
      ? 'ما عندي وسيلة تواصل موثقة لهذا النشاط داخل DABBIR حاليًا، لذلك ما بعطيك رقم أو رابط غير مؤكد. أقدر أساعدك من هنا بالطلب أو الاستفسار.'
      : 'I do not have a verified contact method for this business in DABBIR yet, so I will not invent a number or link. I can still help you here with the request.';
  }

  if (business.business_type === 'store' && !hasKnowledge && /(توصيل|شحن|توصلون|delivery|shipping|ship)/i.test(text)) {
    return ar
      ? 'تفاصيل التوصيل والشحن غير موثقة في بيانات المتجر عندي حاليًا، لذلك ما بخمّنها. اذكر المنطقة أو الطلب الذي تقصده وسأكمل بالمعلومة المتاحة فقط.'
      : 'Delivery and shipping details are not verified in the store data yet, so I will not guess. Tell me the area or order you mean and I will continue using only available information.';
  }

  if (intent === 'PRICE_INQUIRY' && !hasKnowledge) {
    return ar
      ? 'الأسعار غير مضافة كبيانات موثقة للنشاط عندي حاليًا. اذكر اسم المنتج أو الخدمة التي تقصدها، ولن أعطيك سعرًا غير مؤكد.'
      : 'Verified pricing has not been added to this business yet. Tell me the product or service you mean, and I will not give you an unverified price.';
  }

  if (intent === 'AVAILABILITY_INQUIRY' && !hasKnowledge) {
    return ar
      ? 'المخزون أو التوفر غير موثق في بيانات النشاط عندي حاليًا. اذكر المنتج الذي تقصده، ولن أؤكد توفرًا غير موجود في النظام.'
      : 'Stock or availability is not verified in the business data yet. Tell me which product you mean, and I will not claim availability that is not in the system.';
  }

  return null;
}

function failureFallbackReply({ language, intent, business }) {
  const ar = language === 'ar';
  if (intent === 'PRICE_INQUIRY') return ar ? 'اذكر اسم المنتج أو الخدمة التي تريد سعرها، وسأتعامل فقط مع السعر الموثق في النظام.' : 'Tell me the product or service whose price you need, and I will use only a verified price from the system.';
  if (intent === 'AVAILABILITY_INQUIRY') return ar ? 'اذكر اسم المنتج الذي تريد التأكد من توفره، ولن أؤكد مخزونًا غير موثق.' : 'Tell me the product you want to check, and I will not confirm unverified stock.';
  if (intent === 'APPOINTMENT_REQUEST') return ar ? 'اذكر اليوم والوقت المناسبين لك وتفاصيل الطلب. لن أعتبر الموعد مؤكدًا إلا بعد حفظ نتيجة مؤكدة.' : 'Tell me your preferred day, time, and request details. I will not treat the appointment as confirmed until there is a verified saved outcome.';
  if (intent === 'ADVERTISING_REQUEST') return ar ? 'أرسل تفاصيل التعاون أو الإعلان والموعد المطلوب، وسأرتب المعلومات دون افتراض موافقة أو سعر.' : 'Send the collaboration or advertising details and preferred timing. I will organize them without assuming approval or pricing.';
  if (intent === 'SUPPORT_REQUEST') return ar ? 'أرسل تفاصيل المشكلة ورقم الطلب إن وجد، وسأتعامل مع المعلومات المتاحة دون افتراض نتيجة غير مؤكدة.' : 'Send the issue details and an order number if available. I will work only with the information that is actually available.';
  if (business.business_type === 'store') return ar ? 'وصلت رسالتك. اذكر المنتج أو الطلب أو المشكلة التي تريد المساعدة فيها، وسأعطيك فقط المعلومات الموثقة.' : 'I received your message. Tell me the product, order, or issue you need help with, and I will use only verified information.';
  return ar ? 'وصلت رسالتك. اذكر المطلوب بشكل محدد وسأكمل معك بالمعلومات الموثقة فقط.' : 'I received your message. Tell me exactly what you need and I will continue using verified information only.';
}

async function persistAutomatedReply({ accessToken, businessId, conversationId, intent, reply }) {
  const [aiRows] = await Promise.all([
    rest(accessToken, 'dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ business_id: businessId, conversation_id: conversationId, sender_type: 'ai', body: reply, intent, simulated: false }),
    }, 'AI_MESSAGE_PERSIST_FAILED'),
    rest(accessToken, `dabbir_conversations?business_id=eq.${businessId}&id=eq.${conversationId}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ state: 'waiting_customer', updated_at: new Date().toISOString() }),
    }, 'CONVERSATION_STATE_UPDATE_FAILED'),
  ]);
  return aiRows?.[0] || null;
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
    const [conversations, businesses, knowledge, historyDesc, mayReply, products, inventory, services] = await Promise.all([
      rest(accessToken, `dabbir_conversations?select=id,customer_id,channel_type,state,demo_mode&business_id=eq.${businessId}&id=eq.${conversationId}&limit=1`, {}, 'CONVERSATION_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_businesses?select=id,name,business_type,locale,demo_mode&id=eq.${businessId}&limit=1`, {}, 'BUSINESS_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_business_knowledge?select=knowledge_key,knowledge_type,value,source,status&business_id=eq.${businessId}&order=updated_at.desc&limit=12`, {}, 'KNOWLEDGE_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_messages?select=sender_type,body,created_at&business_id=eq.${businessId}&conversation_id=eq.${conversationId}&order=created_at.desc&limit=8`, {}, 'MESSAGE_HISTORY_FAILED'),
      rpc(accessToken, 'dabbir_ai_may_reply', { p_business_id: businessId, p_conversation_id: conversationId }, 'AI_POLICY_CHECK_FAILED'),
      rest(accessToken, `dabbir_products?select=id,sku,name,price_aed,active&business_id=eq.${businessId}&active=eq.true&order=name.asc&limit=40`, {}, 'PRODUCTS_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_inventory?select=product_id,quantity,reserved,updated_at&business_id=eq.${businessId}&limit=80`, {}, 'INVENTORY_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_services?select=id,name,duration_minutes,active&business_id=eq.${businessId}&active=eq.true&limit=20`, {}, 'SERVICES_LOOKUP_FAILED'),
    ]);
    const lookupMs = Date.now() - lookupStarted;

    const conversation = conversations?.[0];
    const business = businesses?.[0];
    if (!conversation || conversation.channel_type !== 'web') return json(res, 404, { ok: false, error: 'WEB_CONVERSATION_NOT_FOUND' });
    if (conversation.demo_mode) return json(res, 409, { ok: false, error: 'REAL_RUNTIME_REQUIRES_NON_DEMO_CONVERSATION' });
    if (!business) return json(res, 404, { ok: false, error: 'BUSINESS_NOT_FOUND' });
    if (mayReply !== true) return json(res, 409, { ok: false, error: 'AI_REPLY_BLOCKED_BY_HANDOFF_STATE' });

    const language = languageFor(message, business.locale);
    const intent = intentFor(business.business_type, message);
    const customerRows = await rest(accessToken, 'dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ business_id: businessId, conversation_id: conversationId, sender_type: 'customer', body: message, intent, simulated: false }),
    }, 'CUSTOMER_MESSAGE_PERSIST_FAILED');
    const customerMessage = customerRows?.[0] || null;

    const fastReply = instantGroundedReply({ message, language, intent, business, knowledge, products, inventory });
    if (fastReply) {
      const finalStarted = Date.now();
      const aiMessage = await persistAutomatedReply({ accessToken, businessId, conversationId, intent, reply: fastReply });
      const finalMs = Date.now() - finalStarted;
      const totalMs = Date.now() - started;
      console.info('dabbir_chat_fast_path', { intent, live_products: Array.isArray(products) ? products.length : 0, lookup_ms: lookupMs, final_ms: finalMs, total_ms: totalMs });
      return json(res, 200, {
        ok: true,
        provider: 'dabbir-local-fastpath',
        model: 'deterministic-v2-live-operations',
        fast_path: true,
        live_operations_grounded: true,
        customer_message: customerMessage,
        ai_message: aiMessage,
        timing: { lookup_ms: lookupMs, ai_ms: 0, final_ms: finalMs, total_ms: totalMs },
        external_side_effects: false,
      });
    }

    const aiStarted = Date.now();
    const aiResult = await generateDABBIRAiReply({
      project: projectFor(business.business_type),
      message,
      language,
      businessContext: buildContext(business, knowledge, products, inventory, services),
      history: Array.isArray(historyDesc) ? historyDesc.slice().reverse() : [],
    });
    const aiMs = Date.now() - aiStarted;

    if (!aiResult.ok) {
      const fallbackReply = failureFallbackReply({ language, intent, business });
      const finalStarted = Date.now();
      const aiMessage = await persistAutomatedReply({ accessToken, businessId, conversationId, intent, reply: fallbackReply });
      const finalMs = Date.now() - finalStarted;
      const totalMs = Date.now() - started;
      console.warn('dabbir_chat_ai_degraded', { state: aiResult.state, error: aiResult.error, model: aiResult.model, lookup_ms: lookupMs, ai_ms: aiMs, final_ms: finalMs, total_ms: totalMs });
      return json(res, 200, {
        ok: true,
        provider: 'dabbir-local-fallback',
        model: 'deterministic-v1',
        degraded: true,
        upstream_ai_state: aiResult.state,
        upstream_ai_error: aiResult.error || null,
        customer_message: customerMessage,
        ai_message: aiMessage,
        timing: { lookup_ms: lookupMs, ai_ms: aiMs, final_ms: finalMs, total_ms: totalMs },
        external_side_effects: false,
      });
    }

    const finalStarted = Date.now();
    const aiMessage = await persistAutomatedReply({ accessToken, businessId, conversationId, intent, reply: aiResult.reply });
    const finalMs = Date.now() - finalStarted;
    const totalMs = Date.now() - started;

    console.info('dabbir_chat_completed', { model: aiResult.model, lookup_ms: lookupMs, ai_ms: aiMs, final_ms: finalMs, total_ms: totalMs });
    return json(res, 200, {
      ok: true,
      provider: aiResult.provider,
      model: aiResult.model,
      live_operations_grounded: true,
      customer_message: customerMessage,
      ai_message: aiMessage,
      timing: { lookup_ms: lookupMs, ai_ms: aiMs, final_ms: finalMs, total_ms: totalMs },
      external_side_effects: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 413, 429, 502, 503].includes(status) ? status : 500;
    console.error('dabbir_chat_failed', { error: cleanText(error?.message || 'CHAT_SEND_FAILED', 120), status: safeStatus, total_ms: Date.now() - started });
    return json(res, safeStatus, { ok: false, error: cleanText(error?.message || 'CHAT_SEND_FAILED', 120), detail: error?.detail || undefined });
  }
}
