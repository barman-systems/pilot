import { openAccessToken, embeddedPlatformConfig } from './_whatsapp-embedded-core.js';
import { applyDabbirMetaPublicIdentifiers } from './_dabbir-meta-public-config.js';
import { withServerReadTimeout } from './_server-read-timeout.js';

const SUPABASE_URL = 'https://spohjzrsymsmzsseygtw.supabase.co';
const WHATSAPP_DATA_TIMEOUT_MS = 10_000;

function clean(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function serviceKey() {
  return clean(process.env.SUPABASE_SERVICE_ROLE_KEY, 4096);
}

export function whatsappLiveServerCapability() {
  return {
    service_data_access: Boolean(serviceKey()),
    meta_app_secret: Boolean(clean(process.env.DABBIR_WHATSAPP_APP_SECRET || process.env.PILOT_WHATSAPP_APP_SECRET, 4096)),
  };
}

async function readResponse(response, fallback) {
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const detail = clean(payload?.message || payload?.error_description || payload?.error || payload?.code || '', 300);
    const error = new Error(detail || fallback);
    error.status = Number(response.status || 500);
    error.code = detail || fallback;
    throw error;
  }
  return payload;
}

export async function serviceRpc(name, params = {}) {
  const key = serviceKey();
  if (!key) {
    const error = new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED');
    error.status = 503;
    error.code = 'WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED';
    throw error;
  }
  const response = await withServerReadTimeout(
    signal => fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: 'POST',
      cache: 'no-store',
      signal,
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(params),
    }),
    { label: 'WHATSAPP_SERVER_RPC', timeoutMs: WHATSAPP_DATA_TIMEOUT_MS },
  );
  return readResponse(response, 'WHATSAPP_SERVER_RPC_FAILED');
}

function oneRow(payload) {
  return Array.isArray(payload) ? payload[0] || null : payload || null;
}

function occurredAt(timestamp) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export async function persistSignedInbound(event) {
  if (!event?.messageId || !event?.phoneNumberId || !event?.from || !clean(event?.text)) {
    const error = new Error('WHATSAPP_INBOUND_EVENT_INCOMPLETE');
    error.status = 400;
    throw error;
  }
  const row = oneRow(await serviceRpc('dabbir_whatsapp_persist_inbound', {
    p_phone_number_id: clean(event.phoneNumberId, 160),
    p_provider_message_id: clean(event.messageId, 320),
    p_sender_handle: clean(event.from, 160),
    p_display_name: clean(event.contactName, 120) || null,
    p_body: clean(event.text, 4000),
    p_intent: clean(event.classification, 120) || null,
    p_occurred_at: occurredAt(event.timestamp),
  }));
  if (!row?.conversation_id || !row?.message_id) {
    const error = new Error('WHATSAPP_INBOUND_PERSISTENCE_UNVERIFIED');
    error.status = 502;
    throw error;
  }
  return {
    persisted: true,
    duplicate: row.duplicate === true,
    conversationId: row.conversation_id,
    messageId: row.message_id,
  };
}

export async function reserveOutboundReply({ businessId, conversationId, senderUserId, idempotencyKey, payloadHash, body }) {
  const row = oneRow(await serviceRpc('dabbir_whatsapp_reserve_outbound', {
    p_business_id: String(businessId),
    p_conversation_id: String(conversationId),
    p_sender_user_id: String(senderUserId),
    p_idempotency_key: clean(idempotencyKey, 160),
    p_payload_hash: clean(payloadHash, 64).toLowerCase(),
    p_body: clean(body, 4000),
  }));
  if (!row?.reservation_id || !row?.connection_id || !row?.recipient_handle) {
    const error = new Error('WHATSAPP_OUTBOUND_RESERVATION_UNVERIFIED');
    error.status = 502;
    throw error;
  }
  return {
    reservationId: row.reservation_id,
    shouldSend: row.should_send === true,
    state: clean(row.reservation_state, 40),
    connectionId: row.connection_id,
    phoneNumberId: clean(row.phone_number_id, 160),
    recipient: clean(row.recipient_handle, 160),
    providerMessageId: clean(row.provider_message_id, 320) || null,
    messageId: row.message_id || null,
  };
}

export async function finalizeOutboundReply({ reservationId, providerMessageId }) {
  const row = oneRow(await serviceRpc('dabbir_whatsapp_finalize_outbound', {
    p_reservation_id: String(reservationId),
    p_provider_message_id: clean(providerMessageId, 320),
  }));
  if (!row?.message_id || !row?.event_id) {
    const error = new Error('WHATSAPP_OUTBOUND_FINALIZE_UNVERIFIED');
    error.status = 502;
    throw error;
  }
  return {
    messageId: row.message_id,
    eventId: row.event_id,
    state: clean(row.reservation_state, 40),
    duplicate: row.duplicate === true,
  };
}

export async function markOutboundResult(reservationId, state, errorCode) {
  return serviceRpc('dabbir_whatsapp_mark_outbound_result', {
    p_reservation_id: String(reservationId),
    p_state: clean(state, 20).toUpperCase(),
    p_error_code: clean(errorCode, 160) || null,
  }).catch(() => null);
}

export async function applySignedStatus(event) {
  if (!event?.messageId || !event?.phoneNumberId || !event?.status) {
    const error = new Error('WHATSAPP_STATUS_EVENT_INCOMPLETE');
    error.status = 400;
    throw error;
  }
  const row = oneRow(await serviceRpc('dabbir_whatsapp_apply_status', {
    p_phone_number_id: clean(event.phoneNumberId, 160),
    p_provider_message_id: clean(event.messageId, 320),
    p_status: clean(event.status, 40).toLowerCase(),
    p_occurred_at: occurredAt(event.timestamp),
  }));
  return {
    matched: row?.matched === true,
    providerVerified: row?.provider_verified === true,
    state: clean(row?.reservation_state, 40) || null,
  };
}

export async function sendMetaText({ connection, businessId, recipient, body }) {
  const capability = whatsappLiveServerCapability();
  if (!capability.service_data_access) {
    const error = new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED');
    error.status = 503;
    throw error;
  }
  const platform = applyDabbirMetaPublicIdentifiers(embeddedPlatformConfig());
  if (!platform.appSecret || !platform.encryptionSecret) {
    const error = new Error('WHATSAPP_PLATFORM_SECRET_NOT_CONFIGURED');
    error.status = 503;
    throw error;
  }
  const token = openAccessToken(connection, platform, businessId);
  const phoneNumberId = clean(connection?.phone_number_id, 160);
  if (!token || !phoneNumberId || !clean(recipient, 160) || !clean(body, 4000)) {
    const error = new Error('WHATSAPP_OUTBOUND_CONTEXT_INCOMPLETE');
    error.status = 409;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: clean(recipient, 160),
        type: 'text',
        text: { preview_url: false, body: clean(body, 4000) },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('META_WHATSAPP_SEND_FAILED');
      error.status = response.status >= 500 ? 502 : 409;
      error.providerStatus = response.status;
      error.providerCode = payload?.error?.code || null;
      error.ambiguous = response.status >= 500;
      error.definitive = response.status >= 400 && response.status < 500;
      throw error;
    }
    const providerMessageId = clean(payload?.messages?.[0]?.id, 320);
    if (!providerMessageId) {
      const error = new Error('META_WHATSAPP_SEND_ACCEPTED_WITHOUT_ID');
      error.status = 502;
      error.ambiguous = true;
      throw error;
    }
    return { providerMessageId, providerStatus: response.status };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('META_WHATSAPP_SEND_TIMEOUT_AMBIGUOUS');
      timeoutError.status = 502;
      timeoutError.ambiguous = true;
      throw timeoutError;
    }
    if (error instanceof TypeError && error?.ambiguous !== false) error.ambiguous = true;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
