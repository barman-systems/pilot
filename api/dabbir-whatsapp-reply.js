import { json, readJsonBody, requireSameOrigin, supabaseRest } from './_auth-core.js';
import { loadBusinessConnection, ownerContext } from './_whatsapp-embedded-core.js';
import {
  beginOutboundAttempt,
  finalizeProviderAcceptedReply,
  markOutboundUnknown,
  sendMetaText,
} from './_whatsapp-live-core.js';

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

function duplicateSideEffectState(providerStatus) {
  const state = String(providerStatus || '').toLowerCase();
  if (['accepted', 'sent', 'delivered', 'read', 'failed', 'deleted'].includes(state)) return true;
  return 'unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });

  let businessId = null;
  let attempt = null;
  let externalSideEffects = false;

  try {
    const body = await readJsonBody(req, 12 * 1024);
    businessId = safeId(body?.business_id);
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
    if (!conversation || conversation.channel_type !== 'whatsapp' || conversation.demo_mode === true || conversation.state === 'closed') {
      return json(res, 404, { ok: false, error: 'REAL_WHATSAPP_CONVERSATION_NOT_FOUND' });
    }
    if (!conversation.customer_id) return json(res, 409, { ok: false, error: 'WHATSAPP_CUSTOMER_REQUIRED' });

    const customers = await rest(
      owner.accessToken,
      `dabbir_customers?select=id,channel_handle&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(String(conversation.customer_id))}&limit=1`,
    );
    const recipient = cleanText(customers[0]?.channel_handle, 160);
    if (!recipient) return json(res, 409, { ok: false, error: 'WHATSAPP_CUSTOMER_HANDLE_REQUIRED' });

    // The durable reservation is created BEFORE Meta is contacted. A retry of
    // the same owner/conversation/body within the reservation window returns the
    // existing attempt instead of producing a second real WhatsApp message.
    attempt = await beginOutboundAttempt({
      businessId,
      conversationId,
      senderUserId: owner.user.id,
      body: message,
    });
    if (attempt.duplicate) {
      return json(res, 409, {
        ok: false,
        state: 'DUPLICATE_REPLY_SUPPRESSED',
        error: 'WHATSAPP_DUPLICATE_REPLY_SUPPRESSED',
        retry_safe: false,
        retry_after_seconds: 300,
        external_side_effects: duplicateSideEffectState(attempt.providerStatus),
        truth: { state: 'EXISTING_OUTBOUND_ATTEMPT', provider_status: attempt.providerStatus },
      });
    }

    let sent;
    try {
      sent = await sendMetaText({ connection, businessId, recipient, body: message });
      externalSideEffects = true;
    } catch (error) {
      externalSideEffects = error?.externalSideEffects ?? 'unknown';
      if (externalSideEffects !== false) {
        await markOutboundUnknown({ businessId, attemptId: attempt.attemptId, reason: error?.message || 'PROVIDER_OUTCOME_UNKNOWN' });
      }
      const status = Number(error?.status || 502);
      return json(res, [400, 401, 403, 404, 409, 413, 429, 502, 503].includes(status) ? status : 502, {
        ok: false,
        state: externalSideEffects === false ? 'PROVIDER_REJECTED' : 'PROVIDER_OUTCOME_UNKNOWN',
        error: cleanText(error?.message || 'WHATSAPP_REPLY_FAILED', 160),
        provider_status: error?.providerStatus || null,
        provider_code: error?.providerCode || null,
        external_side_effects: externalSideEffects,
        retry_safe: false,
        retry_after_seconds: 300,
        truth: { state: externalSideEffects === false ? 'VERIFIED_NOT_SENT' : 'UNVERIFIED_EXTERNAL_OUTCOME' },
      });
    }

    let finalized;
    try {
      finalized = await finalizeProviderAcceptedReply({
        businessId,
        attemptId: attempt.attemptId,
        providerMessageId: sent.providerMessageId,
        body: message,
        senderUserId: owner.user.id,
      });
    } catch (error) {
      await markOutboundUnknown({ businessId, attemptId: attempt.attemptId, reason: 'PROVIDER_ACCEPTED_LOCAL_FINALIZE_FAILED' });
      return json(res, 502, {
        ok: false,
        state: 'PROVIDER_ACCEPTED_LOCAL_FINALIZE_UNVERIFIED',
        error: 'WHATSAPP_REPLY_FINALIZE_UNVERIFIED',
        external_side_effects: true,
        retry_safe: false,
        retry_after_seconds: 300,
        truth: { state: 'PROVIDER_ACCEPTED_LOCAL_UNVERIFIED' },
      });
    }

    const persisted = await rest(
      owner.accessToken,
      `dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at,sender_user_id&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(finalized.messageId)}&limit=1`,
    );
    const humanMessage = persisted[0];
    if (!humanMessage?.id || humanMessage.simulated !== false || humanMessage.sender_type !== 'human') {
      return json(res, 502, {
        ok: false,
        state: 'PROVIDER_ACCEPTED_LOCAL_READBACK_UNVERIFIED',
        error: 'WHATSAPP_REPLY_READBACK_UNVERIFIED',
        external_side_effects: true,
        retry_safe: false,
        retry_after_seconds: 300,
        truth: { state: 'PROVIDER_ACCEPTED_LOCAL_UNVERIFIED' },
      });
    }

    return json(res, 200, {
      ok: true,
      state: 'OUTBOUND_ACCEPTED_AWAITING_DELIVERY',
      channel: 'whatsapp',
      provider_accepted: true,
      provider_status_verified: false,
      message: humanMessage,
      truth: {
        state: 'VERIFIED_PERSISTED_PROVIDER_ACCEPTED',
        source: 'RESERVATION_META_MESSAGES_API_AND_SUPABASE_READBACK',
        verified_at: new Date().toISOString(),
      },
      external_side_effects: true,
      retry_safe: false,
      secrets_exposed: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 413, 429, 502, 503].includes(status) ? status : 500;
    if (attempt?.attemptId && businessId && externalSideEffects !== false) {
      await markOutboundUnknown({ businessId, attemptId: attempt.attemptId, reason: error?.message || 'REPLY_HANDLER_UNCERTAIN' });
    }
    return json(res, safeStatus, {
      ok: false,
      state: 'FAILED_OR_UNVERIFIED',
      error: cleanText(error?.message || 'WHATSAPP_REPLY_FAILED', 160),
      external_side_effects: externalSideEffects,
      retry_safe: false,
      truth: { state: 'UNVERIFIED' },
    });
  }
}
