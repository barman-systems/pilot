import { openAccessToken, embeddedPlatformConfig } from './_whatsapp-embedded-core.js';
import { applyDabbirMetaPublicIdentifiers } from './_dabbir-meta-public-config.js';

const SUPABASE_URL = 'https://spohjzrsymsmzsseygtw.supabase.co';
const META_STATUS_VERIFIED = new Set(['sent', 'delivered', 'read']);

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

export async function persistSignedInbound(event) {
  if (!event?.messageId || !event?.phoneNumberId || !event?.from || !clean(event?.text)) {
    const error = new Error('WHATSAPP_INBOUND_EVENT_INCOMPLETE');
    error.status = 400;
    throw error;
  }
  const rows = await serviceRpc('dabbir_whatsapp_persist_inbound', {
    p_phone_number_id: clean(event.phoneNumberId, 160),
    p_provider_message_id: clean(event.messageId, 320),
    p_sender_handle: clean(event.from, 160),
    p_display_name: clean(event.contactName, 120) || null,
    p_body: clean(event.text, 4000),
    p_intent: clean(event.classification, 120) || null,
    p_occurred_at: occurredAt(event.timestamp),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
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
  const rows = await serviceRpc('dabbir_whatsapp_apply_status', {
    p_phone_number_id: clean(event.phoneNumberId, 160),
    p_provider_message_id: clean(event.messageId, 320),
    p_status: status,
    p_occurred_at: occurredAt(event.timestamp),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    matched: row?.matched === true,
    providerVerified: row?.provider_verified === true || META_STATUS_VERIFIED.has(status) && row?.matched === true,
  };
}

export async function recordProviderAcceptedReply({ businessId, conversationId, providerMessageId, body, senderUserId }) {
  const rows = await serviceRpc('dabbir_whatsapp_record_outbound', {
    p_business_id: String(businessId),
    p_conversation_id: String(conversationId),
    p_provider_message_id: clean(providerMessageId, 320),
    p_body: clean(body, 4000),
    p_sender_user_id: String(senderUserId),
    p_occurred_at: new Date().toISOString(),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.message_id || !row?.event_id) {
    const error = new Error('WHATSAPP_OUTBOUND_PERSISTENCE_UNVERIFIED');
    error.status = 502;
    throw error;
  }
  return { messageId: row.message_id, eventId: row.event_id, duplicate: row.duplicate === true };
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
      throw error;
    }
    const providerMessageId = clean(payload?.messages?.[0]?.id, 320);
    if (!providerMessageId) {
      const error = new Error('META_WHATSAPP_SEND_UNVERIFIED');
      error.status = 502;
      throw error;
    }
    return { providerMessageId, providerStatus: response.status };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('META_WHATSAPP_SEND_TIMEOUT');
      timeoutError.status = 502;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
