import crypto from 'node:crypto';
import { json, readJsonBody, requireSameOrigin, supabaseRest } from './_auth-core.js';
import { loadBusinessConnection, ownerContext } from './_whatsapp-embedded-core.js';
import { withServerReadTimeout } from './_server-read-timeout.js';
import {
  finalizeOutboundReply,
  markOutboundResult,
  reserveOutboundReply,
  sendMetaText,
} from './_whatsapp-live-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_RE = /^[A-Za-z0-9:_-]{16,160}$/;
const WHATSAPP_READBACK_TIMEOUT_MS = 10_000;
const safeId = value => UUID_RE.test(String(value || '').trim()) ? String(value).trim() : null;
const cleanText = (value, max = 4000) => String(value || '').trim().slice(0, max);

function payloadHash(businessId, conversationId, message) {
  return crypto.createHash('sha256')
    .update(String(businessId)).update('\0')
    .update(String(conversationId)).update('\0')
    .update(String(message))
    .digest('hex');
}

async function readRows(response, fallback) {
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw Object.assign(new Error(fallback), { status: response.status });
  return Array.isArray(payload) ? payload : [];
}

async function readPersistedMessage(token, businessId, messageId) {
  if (!messageId) return null;
  const response = await withServerReadTimeout(
    signal => supabaseRest(
      `dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at,sender_user_id&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(messageId)}&limit=1`,
      token,
      { signal },
    ),
    { label: 'WHATSAPP_REPLY_READBACK', timeoutMs: WHATSAPP_READBACK_TIMEOUT_MS },
  );
  const rows = await readRows(response, 'WHATSAPP_REPLY_READBACK_FAILED');
  const message = rows[0] || null;
  return message?.id && message.sender_type === 'human' && message.simulated === false ? message : null;
}

function replayResponse(res, reservation, message) {
  const externallyVerified = ['DELIVERED', 'READ'].includes(reservation.state);
  return json(res, 200, {
    ok: true,
    state: reservation.state,
    channel: 'whatsapp',
    replayed: true,
    provider_accepted: true,
    provider_status_verified: externallyVerified,
    message,
    truth: {
      state: externallyVerified ? 'VERIFIED_EXTERNAL_DELIVERY' : 'VERIFIED_PERSISTED_PROVIDER_ACCEPTED',
      source: 'DABBIR_OUTBOUND_RESERVATION',
      verified_at: new Date().toISOString(),
    },
    external_side_effects: false,
    secrets_exposed: false,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });

  let reservation = null;
  let providerAccepted = false;
  try {
    const body = await readJsonBody(req, 16 * 1024);
    const businessId = safeId(body?.business_id);
    const conversationId = safeId(body?.conversation_id);
    const message = cleanText(body?.message, 4000);
    const idempotencyKey = cleanText(body?.idempotency_key, 160);
    if (!businessId || !conversationId || !message || !IDEMPOTENCY_RE.test(idempotencyKey)) {
      return json(res, 400, { ok: false, error: 'WHATSAPP_REPLY_INPUT_REQUIRED' });
    }

    const owner = await ownerContext(req, businessId);
    const connection = await loadBusinessConnection(owner.accessToken, businessId);
    if (!connection || connection.status !== 'connected') return json(res, 409, { ok: false, error: 'WHATSAPP_TENANT_NOT_LINKED' });

    reservation = await reserveOutboundReply({
      businessId,
      conversationId,
      senderUserId: owner.user.id,
      idempotencyKey,
      payloadHash: payloadHash(businessId, conversationId, message),
      body: message,
    });

    if (!reservation.shouldSend) {
      if (['PROVIDER_ACCEPTED', 'SENT', 'DELIVERED', 'READ'].includes(reservation.state) && reservation.messageId) {
        const persisted = await readPersistedMessage(owner.accessToken, businessId, reservation.messageId);
        if (!persisted) return json(res, 502, { ok: false, state: 'LOCAL_READBACK_UNVERIFIED', error: 'WHATSAPP_REPLY_READBACK_UNVERIFIED' });
        return replayResponse(res, reservation, persisted);
      }
      if (['SENDING', 'AMBIGUOUS'].includes(reservation.state)) {
        return json(res, 409, {
          ok: false,
          state: reservation.state,
          error: 'WHATSAPP_REPLY_REQUIRES_RECONCILIATION',
          retry_safe_with_same_key: true,
          automatic_resend_blocked: true,
          external_side_effects_possible: true,
        });
      }
      return json(res, 409, {
        ok: false,
        state: reservation.state || 'FAILED',
        error: 'WHATSAPP_REPLY_PREVIOUS_ATTEMPT_FAILED',
        retry_requires_new_operation: true,
        automatic_resend_blocked: true,
      });
    }

    if (String(connection.id) !== String(reservation.connectionId)
      || String(connection.phone_number_id) !== String(reservation.phoneNumberId)) {
      await markOutboundResult(reservation.reservationId, 'FAILED', 'WHATSAPP_CONNECTION_CHANGED_AFTER_RESERVATION');
      return json(res, 409, { ok: false, state: 'FAILED', error: 'WHATSAPP_CONNECTION_CHANGED_AFTER_RESERVATION' });
    }

    let sent;
    try {
      sent = await sendMetaText({ connection, businessId, recipient: reservation.recipient, body: message });
      providerAccepted = true;
    } catch (error) {
      await markOutboundResult(
        reservation.reservationId,
        error?.ambiguous === true ? 'AMBIGUOUS' : 'FAILED',
        cleanText(error?.message || 'META_WHATSAPP_SEND_FAILED', 160),
      );
      throw error;
    }

    let finalized;
    try {
      finalized = await finalizeOutboundReply({
        reservationId: reservation.reservationId,
        providerMessageId: sent.providerMessageId,
      });
    } catch (error) {
      await markOutboundResult(reservation.reservationId, 'AMBIGUOUS', 'LOCAL_FINALIZE_FAILED_AFTER_PROVIDER_ACCEPT');
      error.providerAccepted = true;
      error.ambiguous = true;
      throw error;
    }

    const persisted = await readPersistedMessage(owner.accessToken, businessId, finalized.messageId);
    if (!persisted) {
      return json(res, 502, {
        ok: false,
        state: 'PROVIDER_ACCEPTED_LOCAL_READBACK_UNVERIFIED',
        error: 'WHATSAPP_REPLY_READBACK_UNVERIFIED',
        provider_accepted: true,
        automatic_resend_blocked: true,
        external_side_effects: true,
      });
    }

    return json(res, 200, {
      ok: true,
      state: 'PROVIDER_ACCEPTED',
      channel: 'whatsapp',
      replayed: false,
      provider_accepted: true,
      provider_status_verified: false,
      message: persisted,
      truth: {
        state: 'VERIFIED_PERSISTED_PROVIDER_ACCEPTED',
        source: 'RESERVATION_META_SEND_FINALIZE_READBACK',
        verified_at: new Date().toISOString(),
      },
      automatic_resend_blocked: true,
      external_side_effects: true,
      secrets_exposed: false,
    });
  } catch (error) {
    const status = Number(error?.status || error?.code || 500);
    const safeStatus = [400, 401, 403, 404, 409, 413, 429, 502, 503, 504].includes(status) ? status : 500;
    const ambiguous = error?.ambiguous === true || error?.providerAccepted === true || (providerAccepted && reservation?.reservationId);
    return json(res, safeStatus, {
      ok: false,
      state: ambiguous ? 'AMBIGUOUS_NO_AUTOMATIC_RESEND' : 'FAILED',
      error: cleanText(error?.safeCode || error?.message || 'WHATSAPP_REPLY_FAILED', 160),
      provider_status: error?.providerStatus || null,
      provider_code: error?.providerCode || null,
      automatic_resend_blocked: Boolean(reservation?.reservationId),
      external_side_effects_possible: ambiguous,
      truth: { state: 'UNVERIFIED' },
    });
  }
}
