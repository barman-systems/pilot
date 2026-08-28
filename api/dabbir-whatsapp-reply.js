import { json, readJsonBody, requireSameOrigin, supabaseRest } from './_auth-core.js';
import { loadBusinessConnection, ownerContext } from './_whatsapp-embedded-core.js';
import { recordProviderAcceptedReply, sendMetaText } from './_whatsapp-live-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId = value => UUID_RE.test(String(value || '').trim()) ? String(value).trim() : null;
const cleanText = (value, max = 4000) => String(value || '').trim().slice(0, max);

async function readRows(response, fallback) {
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw Object.assign(new Error(fallback), { status: response.status });
  return Array.isArray(payload) ? payload : [];
}

async function rest(token, path) {
  return readRows(await supabaseRest(path, token), 'WHATSAPP_REPLY_DATA_READ_FAILED');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req, 12 * 1024);
    const businessId = safeId(body?.business_id);
    const conversationId = safeId(body?.conversation_id);
    const message = cleanText(body?.message, 4000);
    if (!businessId || !conversationId || !message) return json(res, 400, { ok: false, error: 'WHATSAPP_REPLY_INPUT_REQUIRED' });

    const owner = await ownerContext(req, businessId);
    const connection = await loadBusinessConnection(owner.accessToken, businessId);
    if (!connection || connection.status !== 'connected') return json(res, 409, { ok: false, error: 'WHATSAPP_TENANT_NOT_LINKED' });

    const conversations = await rest(
      owner.accessToken,
      `dabbir_conversations?select=id,customer_id,channel_type,state,demo_mode&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(conversationId)}&limit=1`,
    );
    const conversation = conversations[0];
    if (!conversation || conversation.channel_type !== 'whatsapp' || conversation.demo_mode === true) {
      return json(res, 404, { ok: false, error: 'REAL_WHATSAPP_CONVERSATION_NOT_FOUND' });
    }
    if (!conversation.customer_id) return json(res, 409, { ok: false, error: 'WHATSAPP_CUSTOMER_REQUIRED' });

    const customers = await rest(
      owner.accessToken,
      `dabbir_customers?select=id,channel_handle&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(String(conversation.customer_id))}&limit=1`,
    );
    const recipient = cleanText(customers[0]?.channel_handle, 160);
    if (!recipient) return json(res, 409, { ok: false, error: 'WHATSAPP_CUSTOMER_HANDLE_REQUIRED' });

    // Fail closed before creating a real external side effect unless DABBIR can
    // persist the provider-accepted result on the server-only path.
    const sent = await sendMetaText({ connection, businessId, recipient, body: message });
    const recorded = await recordProviderAcceptedReply({
      businessId,
      conversationId,
      providerMessageId: sent.providerMessageId,
      body: message,
      senderUserId: owner.user.id,
    });

    const persisted = await rest(
      owner.accessToken,
      `dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at,sender_user_id&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(recorded.messageId)}&limit=1`,
    );
    const humanMessage = persisted[0];
    if (!humanMessage?.id || humanMessage.simulated !== false || humanMessage.sender_type !== 'human') {
      return json(res, 502, {
        ok: false,
        state: 'PROVIDER_ACCEPTED_LOCAL_READBACK_UNVERIFIED',
        error: 'WHATSAPP_REPLY_READBACK_UNVERIFIED',
        external_side_effects: true,
      });
    }

    return json(res, 200, {
      ok: true,
      state: 'OUTBOUND_ACCEPTED_AWAITING_PROVIDER_STATUS',
      channel: 'whatsapp',
      provider_accepted: true,
      provider_status_verified: false,
      message: humanMessage,
      truth: {
        state: 'VERIFIED_PERSISTED_PROVIDER_ACCEPTED',
        source: 'META_MESSAGES_API_AND_SUPABASE_READBACK',
        verified_at: new Date().toISOString(),
      },
      external_side_effects: true,
      secrets_exposed: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 413, 429, 502, 503].includes(status) ? status : 500;
    return json(res, safeStatus, {
      ok: false,
      state: 'FAILED_OR_UNVERIFIED',
      error: cleanText(error?.message || 'WHATSAPP_REPLY_FAILED', 160),
      provider_status: error?.providerStatus || null,
      provider_code: error?.providerCode || null,
      truth: { state: 'UNVERIFIED' },
    });
  }
}
