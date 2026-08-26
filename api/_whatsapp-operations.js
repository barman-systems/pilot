import {
  getServerConfig,
  hashCustomerIdentity,
  hashProviderEvent,
  parseRestResponse,
  serverRest,
  serverRuntimeReadiness,
} from './_server-data.js';

function occurredAt(timestamp) {
  const seconds = Number(timestamp || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function safeRpcError(data, fallback = 'WHATSAPP_PERSISTENCE_FAILED') {
  const raw = String(data?.message || data?.hint || '').toUpperCase();
  for (const code of [
    'UNKNOWN_CONNECTION','CHANNEL_NOT_CONNECTED','PATIENT_DATA_GATE_CLOSED','INVALID_EXTERNAL_HASH',
    'INVALID_MESSAGE_BODY','METADATA_TOO_LARGE','UNSUPPORTED_DELIVERY_STATE',
  ]) {
    if (raw.includes(code)) return code;
  }
  return fallback;
}

async function callRpc(name, body, env) {
  const response = await serverRest(`rpc/${name}`, {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(body),
  }, env);
  const result = await parseRestResponse(response);
  if (!result.ok) {
    const code = safeRpcError(result.data);
    throw Object.assign(new Error(code), { code, status: result.status });
  }
  return result.data;
}

export async function processWhatsAppOperationalEvent(event, classification = 'GENERAL_INQUIRY', env = process.env) {
  const readiness = serverRuntimeReadiness(env);
  if (!readiness.runtime_enabled) {
    return { state: 'CONFIGURED_NOT_OPERATIONAL', persisted: false, updated: false, duplicate: false };
  }
  if (!readiness.ready_for_persistence) {
    const missing = !readiness.server_credential ? 'SERVER_CREDENTIAL_MISSING' : 'IDENTITY_HMAC_KEY_MISSING';
    throw Object.assign(new Error(missing), { code: missing });
  }

  const { identityKey } = getServerConfig(env);
  if (event?.type === 'message') {
    const externalMessageHash = hashProviderEvent('whatsapp', 'message-id', event.messageId);
    const externalEventHash = hashProviderEvent('whatsapp', 'message', event.messageId);
    const identityHash = hashCustomerIdentity(event.from, identityKey);
    const data = await callRpc('pilot_ingest_whatsapp_message', {
      p_phone_number_id: event.phoneNumberId,
      p_external_event_hash: externalEventHash,
      p_external_message_hash: externalMessageHash,
      p_customer_identity_hash: identityHash,
      p_customer_handle: String(event.from || '').slice(0, 128),
      p_body: String(event.text || '').slice(0, 4000),
      p_intent: String(classification || 'GENERAL_INQUIRY').slice(0, 120),
      p_message_type: String(event.messageType || 'unknown').slice(0, 64),
      p_occurred_at: occurredAt(event.timestamp),
      p_safe_metadata: { source: 'meta_webhook', signature_verified: true },
    }, env);
    return {
      state: data?.duplicate ? 'DUPLICATE_IGNORED' : data?.persisted ? 'PERSISTED' : 'UNKNOWN',
      persisted: Boolean(data?.persisted),
      updated: false,
      duplicate: Boolean(data?.duplicate),
    };
  }

  if (event?.type === 'status') {
    const providerStatus = String(event.status || '').toLowerCase();
    const externalMessageHash = hashProviderEvent('whatsapp', 'message-id', event.messageId);
    const externalEventHash = hashProviderEvent('whatsapp', 'status', event.messageId, providerStatus);
    const data = await callRpc('pilot_apply_whatsapp_status', {
      p_phone_number_id: event.phoneNumberId,
      p_external_event_hash: externalEventHash,
      p_external_message_hash: externalMessageHash,
      p_status: providerStatus,
      p_occurred_at: occurredAt(event.timestamp),
      p_safe_metadata: { source: 'meta_webhook', signature_verified: true, provider_status: providerStatus.slice(0, 32) },
    }, env);
    return {
      state: data?.duplicate ? 'DUPLICATE_IGNORED' : data?.updated ? 'STATUS_APPLIED' : data?.waiting_for_message ? 'WAITING_FOR_MESSAGE' : 'UNKNOWN',
      persisted: false,
      updated: Boolean(data?.updated),
      duplicate: Boolean(data?.duplicate),
    };
  }

  throw Object.assign(new Error('UNSUPPORTED_WHATSAPP_EVENT'), { code: 'UNSUPPORTED_WHATSAPP_EVENT' });
}

export function whatsappRuntimeReadiness(env = process.env) {
  const base = serverRuntimeReadiness(env);
  const appSecret = Boolean(String(env.PILOT_WHATSAPP_APP_SECRET || '').trim());
  const verifyToken = Boolean(String(env.PILOT_WHATSAPP_VERIFY_TOKEN || '').trim());
  const metaAccessToken = Boolean(String(env.PILOT_WHATSAPP_ACCESS_TOKEN || '').trim());
  const graphVersion = /^v\d+\.\d+$/.test(String(env.PILOT_META_GRAPH_VERSION || '').trim());
  return {
    ...base,
    app_secret: appSecret,
    verify_token: verifyToken,
    meta_access_token: metaAccessToken,
    graph_version: graphVersion,
    ready_for_signed_inbound: base.ready_for_persistence && appSecret && verifyToken,
    ready_for_outbound: base.ready_for_persistence && metaAccessToken && graphVersion,
  };
}
