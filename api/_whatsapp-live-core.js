import crypto from 'node:crypto';
import { openAccessToken, embeddedPlatformConfig } from './_whatsapp-embedded-core.js';
import { applyDabbirMetaPublicIdentifiers } from './_dabbir-meta-public-config.js';

const SUPABASE_URL = 'https://spohjzrsymsmzsseygtw.supabase.co';
const META_STATUS_VERIFIED = new Set(['delivered', 'read']);

function clean(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function serviceKey() {
  return clean(process.env.SUPABASE_SERVICE_ROLE_KEY, 4096);
}

function externalError(message, status, externalSideEffects = false) {
  const error = new Error(message);
  error.status = status;
  error.externalSideEffects = externalSideEffects;
  return error;
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(params),
  });
  return readResponse(response, 'WHATSAPP_SERVER_RPC_FAILED');
}

function occurredAt(timestamp) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function firstRow(rows) {
  return Array.isArray(rows) ? rows[0] : rows;
}

export function whatsappReplyFingerprint({ businessId, conversationId, senderUserId, body }) {
  const normalized = clean(body, 4000);
  if (!businessId || !conversationId || !senderUserId || !normalized) return '';
  return crypto.createHash('sha256')
    .update(String(businessId)).update('\0')
    .update(String(conversationId)).update('\0')
    .update(String(senderUserId)).update('\0')
    .update(normalized)
    .digest('hex');
}

export async function persistSignedInbound(event) {
  if (!event?.messageId || !event?.phoneNumberId || !event?.from || !clean(event?.text)) {
    const error = new Error('WHATSAPP_INBOUND_EVENT_INCOMPLETE');
    error.status = 400;
    throw error;
  }
  const row = firstRow(await serviceRpc('dabbir_whatsapp_persist_inbound', {
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

export async function applySignedStatus(event) {
  if (!event?.messageId || !event?.phoneNumberId || !event?.status) {
    const error = new Error('WHATSAPP_STATUS_EVENT_INCOMPLETE');
    error.status = 400;
    throw error;
  }
  const status = clean(event.status, 40).toLowerCase();
  const row = firstRow(await serviceRpc('dabbir_whatsapp_apply_status', {
    p_phone_number_id: clean(event.phoneNumberId, 160),
    p_provider_message_id: clean(event.messageId, 320),
    p_status: status,
    p_occurred_at: occurredAt(event.timestamp),
  }));
  return {
    matched: row?.matched === true,
    providerVerified: row?.provider_verified === true && META_STATUS_VERIFIED.has(status),
  };
}

export async function beginOutboundAttempt({ businessId, conversationId, senderUserId, body }) {
  const fingerprint = whatsappReplyFingerprint({ businessId, conversationId, senderUserId, body });
  if (!fingerprint) throw Object.assign(new Error('WHATSAPP_IDEMPOTENCY_CONTEXT_REQUIRED'), { status: 400 });
  const row = firstRow(await serviceRpc('dabbir_whatsapp_begin_outbound', {
    p_business_id: String(businessId),
    p_conversation_id: String(conversationId),
    p_sender_user_id: String(senderUserId),
    p_request_fingerprint: fingerprint,
  }));
  if (!row?.attempt_id || !row?.provider_status) {
    const error = new Error('WHATSAPP_OUTBOUND_RESERVATION_UNVERIFIED');
    error.status = 502;
    throw error;
  }
  return {
    attemptId: row.attempt_id,
    providerStatus: clean(row.provider_status, 40),
    duplicate: row.duplicate === true,
    fingerprint,
  };
}

export async function markOutboundUnknown({ businessId, attemptId, reason }) {
  try {
    await serviceRpc('dabbir_whatsapp_mark_outbound_unknown', {
      p_business_id: String(businessId),
      p_attempt_id: String(attemptId),
      p_reason: clean(reason, 120) || 'PROVIDER_OUTCOME_UNKNOWN',
    });
    return true;
  } catch {
    return false;
  }
}

export async function finalizeProviderAcceptedReply({ businessId, attemptId, providerMessageId, body, senderUserId }) {
  const row = firstRow(await serviceRpc('dabbir_whatsapp_finalize_outbound', {
    p_business_id: String(businessId),
    p_attempt_id: String(attemptId),
    p_provider_message_id: clean(providerMessageId, 320),
    p_body: clean(body, 4000),
    p_sender_user_id: String(senderUserId),
    p_occurred_at: new Date().toISOString(),
  }));
  if (!row?.message_id || !row?.event_id) {
    const error = new Error('WHATSAPP_OUTBOUND_FINALIZE_UNVERIFIED');
    error.status = 502;
    throw error;
  }
  return { messageId: row.message_id, eventId: row.event_id, duplicate: row.duplicate === true };
}

export async function sendMetaText({ connection, businessId, recipient, body }) {
  const capability = whatsappLiveServerCapability();
  if (!capability.service_data_access) throw externalError('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED', 503, false);
  const platform = applyDabbirMetaPublicIdentifiers(embeddedPlatformConfig());
  if (!platform.appSecret || !platform.encryptionSecret) throw externalError('WHATSAPP_PLATFORM_SECRET_NOT_CONFIGURED', 503, false);

  let token;
  try {
    token = openAccessToken(connection, platform, businessId);
  } catch {
    throw externalError('WHATSAPP_ACCESS_TOKEN_UNAVAILABLE', 503, false);
  }
  const phoneNumberId = clean(connection?.phone_number_id, 160);
  const target = clean(recipient, 160);
  const message = clean(body, 4000);
  if (!token || !phoneNumberId || !target || !message) throw externalError('WHATSAPP_OUTBOUND_CONTEXT_INCOMPLETE', 409, false);

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
        to: target,
        type: 'text',
        text: { preview_url: false, body: message },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = externalError('META_WHATSAPP_SEND_FAILED', response.status >= 500 ? 502 : 409, false);
      error.providerStatus = response.status;
      error.providerCode = payload?.error?.code || null;
      throw error;
    }
    const providerMessageId = clean(payload?.messages?.[0]?.id, 320);
    if (!providerMessageId) throw externalError('META_WHATSAPP_SEND_ACCEPTED_ID_UNVERIFIED', 502, true);
    return { providerMessageId, providerStatus: response.status, externalSideEffects: true };
  } catch (error) {
    if (error?.name === 'AbortError') throw externalError('META_WHATSAPP_SEND_TIMEOUT', 502, 'unknown');
    if (error?.externalSideEffects !== undefined) throw error;
    const networkError = externalError('META_WHATSAPP_SEND_NETWORK_OUTCOME_UNKNOWN', 502, 'unknown');
    throw networkError;
  } finally {
    clearTimeout(timeout);
  }
}
