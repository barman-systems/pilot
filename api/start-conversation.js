import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId = value => UUID_RE.test(String(value || '').trim()) ? String(value).trim() : null;
const cleanText = (value, max = 120) => String(value || '').trim().slice(0, max);

function normalizeName(value = '') {
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
    const displayName = cleanText(body.display_name || 'Web Customer') || 'Web Customer';
    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_ID_REQUIRED' });
    if (!memberships.some(item => item.business_id === businessId)) return json(res, 403, { ok: false, error: 'BUSINESS_ACCESS_DENIED' });

    const [customers, conversations] = await Promise.all([
      rest(
        accessToken,
        `dabbir_customers?select=id,display_name,lead_status,metadata,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=80`,
        {},
        'CUSTOMER_LOOKUP_FAILED',
      ),
      rest(
        accessToken,
        `dabbir_conversations?select=id,customer_id,channel_type,state,demo_mode,created_at,updated_at&business_id=eq.${businessId}&channel_type=eq.web&state=neq.closed&order=updated_at.desc&limit=80`,
        {},
        'CONVERSATION_LOOKUP_FAILED',
      ),
    ]);

    const wantedName = normalizeName(displayName);
    const matchingCustomers = (customers || []).filter(customer => {
      const source = String(customer?.metadata?.source || '');
      return source === 'dabbir_web_runtime' && normalizeName(customer.display_name) === wantedName;
    });
    const matchingIds = new Set(matchingCustomers.map(customer => customer.id));
    const existingConversation = (conversations || []).find(conversation => matchingIds.has(conversation.customer_id));

    if (existingConversation) {
      const customer = matchingCustomers.find(item => item.id === existingConversation.customer_id) || null;
      return json(res, 200, {
        ok: true,
        action: 'start_conversation',
        customer,
        conversation: existingConversation,
        channel: 'web',
        reused: true,
        verified_persisted: true,
        external_side_effects: false,
      });
    }

    let customer = matchingCustomers[0] || null;
    if (!customer) {
      const customerRows = await rest(accessToken, 'dabbir_customers?select=id,display_name,lead_status,metadata,created_at', {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({
          business_id: businessId,
          display_name: displayName,
          lead_status: 'new',
          metadata: { source: 'dabbir_web_runtime' },
        }),
      }, 'CUSTOMER_CREATE_FAILED');
      customer = customerRows?.[0] || null;
    }
    if (!customer?.id) throw Object.assign(new Error('CUSTOMER_CREATE_FAILED'), { status: 502 });

    const conversationRows = await rest(accessToken, 'dabbir_conversations?select=id,customer_id,channel_type,state,demo_mode,created_at,updated_at', {
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
    const conversation = conversationRows?.[0] || null;
    if (!conversation?.id) throw Object.assign(new Error('CONVERSATION_CREATE_FAILED'), { status: 502 });

    return json(res, 200, {
      ok: true,
      action: 'start_conversation',
      customer,
      conversation,
      channel: 'web',
      reused: false,
      verified_persisted: true,
      external_side_effects: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 413, 429, 502, 503].includes(status) ? status : 500;
    return json(res, safeStatus, {
      ok: false,
      error: String(error?.message || 'START_CONVERSATION_FAILED').slice(0, 120),
      detail: error?.detail || undefined,
    });
  }
}
