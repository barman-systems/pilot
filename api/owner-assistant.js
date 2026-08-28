import {
  accessTokenFromRequest,
  getBusinessMemberships,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';
import { generateDABBIRAiReply } from './_ai-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId = value => UUID_RE.test(String(value || '').trim()) ? String(value).trim() : null;
const cleanText = (value, max = 2000) => String(value || '').trim().slice(0, max);

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

function normalize(value = '') {
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

async function readRows(response, fallback) {
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : []; } catch { payload = null; }
  if (!response.ok || !Array.isArray(payload)) {
    const error = new Error(fallback);
    error.status = Number(response.status || 502);
    throw error;
  }
  return payload;
}

const rest = (token, path, fallback) =>
  supabaseRest(path, token).then(response => readRows(response, fallback));

function upcomingAppointments(appointments = []) {
  const now = Date.now();
  return appointments
    .filter(item => {
      const when = new Date(item.starts_at || 0).getTime();
      return Number.isFinite(when) && when >= now && !['cancelled', 'canceled'].includes(String(item.status || '').toLowerCase());
    })
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 5);
}

function buildContext({ business, conversations, customers, appointments, handoffs, followups }) {
  const activeHandoffs = handoffs.filter(item => !['RESOLVED', 'CLOSED'].includes(String(item.state || '').toUpperCase()));
  const openFollowups = followups.filter(item => !['completed', 'cancelled', 'sent'].includes(String(item.status || '').toLowerCase()));
  const upcoming = upcomingAppointments(appointments);
  return {
    audience: 'AUTHENTICATED_BUSINESS_OWNER',
    business: {
      name: business.name,
      type: business.business_type,
      locale: business.locale,
    },
    operational_snapshot: {
      conversations_loaded: conversations.length,
      customers_loaded: customers.length,
      appointments_loaded: appointments.length,
      upcoming_appointments_loaded: upcoming.length,
      active_handoffs_loaded: activeHandoffs.length,
      open_followups_loaded: openFollowups.length,
      needs_owner_attention_loaded: activeHandoffs.length + openFollowups.length,
    },
    needs_attention: [
      ...activeHandoffs.slice(0, 8).map(item => ({ type: 'handoff', route: item.route_class, reason: item.reason, state: item.state })),
      ...openFollowups.slice(0, 8).map(item => ({ type: 'followup', reason: item.reason, due_at: item.due_at, status: item.status })),
    ],
    upcoming_appointments: upcoming.map(item => ({ starts_at: item.starts_at, status: item.status })),
    recent_customers: customers.slice(0, 10).map(item => ({ name: item.display_name, lead_status: item.lead_status })),
    truth_rule: 'These are bounded authenticated tenant reads. Never claim totals beyond the loaded rows unless explicitly described as loaded counts. Never invent missing facts or claim an external action happened.',
  };
}

function fastOwnerReply(message, language, context) {
  const text = normalize(message);
  const ar = language === 'ar';
  const snapshot = context.operational_snapshot;

  if (/(ما الذي يحتاج|وش يحتاج|يحتاج تدخلي|يحتاج انتباهي|needs my attention|need my attention|what needs attention)/i.test(text)) {
    if (!snapshot.needs_owner_attention_loaded) {
      return ar ? 'حسب البيانات المحمّلة الآن، لا توجد حالات تحتاج تدخلك المباشر.' : 'Based on the currently loaded data, nothing requires your direct intervention right now.';
    }
    return ar
      ? `لديك ${snapshot.needs_owner_attention_loaded} حالة تحتاج انتباهك ضمن البيانات المحمّلة الآن: ${snapshot.active_handoffs_loaded} تحويلات بشرية و${snapshot.open_followups_loaded} متابعات مفتوحة.`
      : `There are ${snapshot.needs_owner_attention_loaded} loaded items that need your attention: ${snapshot.active_handoffs_loaded} human handoffs and ${snapshot.open_followups_loaded} open follow-ups.`;
  }

  if (/(المواعيد|موعد|appointments|schedule)/i.test(text)) {
    const items = context.upcoming_appointments;
    if (!items.length) return ar ? 'لا توجد مواعيد قادمة ظاهرة ضمن البيانات المحمّلة الآن.' : 'There are no upcoming appointments in the currently loaded data.';
    const formatter = new Intl.DateTimeFormat(ar ? 'ar-AE' : 'en-AE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' });
    const lines = items.slice(0, 3).map(item => `${formatter.format(new Date(item.starts_at))} — ${item.status || (ar ? 'غير محدد' : 'unknown')}`);
    return ar ? `أقرب المواعيد:\n${lines.join('\n')}` : `Nearest appointments:\n${lines.join('\n')}`;
  }

  if (/(العملاء|عملائي|customers|leads)/i.test(text) && /(لخص|ملخص|كم|summary|summar|how many)/i.test(text)) {
    const names = context.recent_customers.slice(0, 3).map(item => item.name).filter(Boolean);
    return ar
      ? `يوجد ${snapshot.customers_loaded} عميلًا ضمن البيانات المحمّلة حاليًا${names.length ? `، وآخر الأسماء الظاهرة: ${names.join('، ')}` : ''}.`
      : `There are ${snapshot.customers_loaded} customers in the currently loaded data${names.length ? `; recent visible names include ${names.join(', ')}` : ''}.`;
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });

  try {
    const accessToken = accessTokenFromRequest(req);
    if (!accessToken) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

    const body = await readJsonBody(req, 24_000);
    const businessId = safeId(body.business_id);
    const message = cleanText(body.message);
    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    if (!message) return json(res, 400, { ok: false, error: 'MESSAGE_REQUIRED' });

    const memberships = await getBusinessMemberships(accessToken);
    const membership = memberships.find(item => item.business_id === businessId) || null;
    if (!membership) return json(res, 403, { ok: false, error: 'BUSINESS_ACCESS_DENIED' });

    const b = encodeURIComponent(businessId);
    const [businessRows, conversations, customers, appointments, handoffs, followups] = await Promise.all([
      rest(accessToken, `dabbir_businesses?select=id,name,business_type,locale&id=eq.${b}&limit=1`, 'BUSINESS_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_conversations?select=id,state,updated_at&business_id=eq.${b}&channel_type=eq.web&state=neq.closed&order=updated_at.desc&limit=40`, 'CONVERSATIONS_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_customers?select=id,display_name,lead_status,created_at&business_id=eq.${b}&order=created_at.desc&limit=80`, 'CUSTOMERS_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_appointments?select=id,starts_at,status&business_id=eq.${b}&order=starts_at.asc&limit=40`, 'APPOINTMENTS_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_handoffs?select=id,state,route_class,reason&business_id=eq.${b}&order=created_at.desc&limit=40`, 'HANDOFFS_LOOKUP_FAILED'),
      rest(accessToken, `dabbir_followups?select=id,status,reason,due_at&business_id=eq.${b}&order=created_at.desc&limit=40`, 'FOLLOWUPS_LOOKUP_FAILED'),
    ]);

    const business = businessRows[0];
    if (!business) return json(res, 404, { ok: false, error: 'BUSINESS_NOT_FOUND' });

    const language = languageFor(message, business.locale);
    const context = buildContext({ business, conversations, customers, appointments, handoffs, followups });
    const fastReply = fastOwnerReply(message, language, context);
    if (fastReply) return json(res, 200, { ok: true, reply: fastReply, source: 'VERIFIED_OWNER_RUNTIME', guarded: true });

    const history = Array.isArray(body.history)
      ? body.history.slice(-8).map(item => ({ role: item?.role === 'assistant' ? 'assistant' : 'user', content: cleanText(item?.content, 1200) })).filter(item => item.content)
      : [];

    const ai = await generateDABBIRAiReply({
      project: projectFor(business.business_type),
      message: `You are now speaking to the authenticated business owner inside the DABBIR control center, not to a customer. Answer the owner's operational question using only VERIFIED BUSINESS CONTEXT. If the owner asks you to perform an action that this endpoint cannot verify as completed, explain the safe next step and do not claim execution.\n\nOwner question: ${message}`,
      language,
      businessContext: JSON.stringify(context),
      history,
    });

    if (!ai.ok) {
      const status = ai.state === 'UNCONFIGURED' ? 503 : ai.state === 'RATE_LIMITED' ? 429 : 502;
      return json(res, status, { ok: false, error: ai.error || 'AI_UNAVAILABLE', state: ai.state || 'AI_UNAVAILABLE' });
    }

    return json(res, 200, {
      ok: true,
      reply: ai.reply,
      source: 'DABBIR_OWNER_AI',
      guarded: Boolean(ai.guarded),
      grounding_state: ai.grounding_state || null,
    });
  } catch (error) {
    const status = Number(error?.status || error?.code || 500);
    return json(res, status >= 400 && status < 600 ? status : 500, { ok: false, error: error?.message || 'OWNER_ASSISTANT_FAILED' });
  }
}
