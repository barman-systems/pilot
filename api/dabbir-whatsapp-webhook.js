import { singleQueryValue } from './_request-query.js';
import crypto from 'node:crypto';
import { classifyClinicMessage, classifyCelebrityMessage } from './dabbir-runtime.js';
import { attachCorrelation, correlationId, logEvent } from './_observability.js';
import { applySignedStatus, persistSignedInbound } from './_whatsapp-live-core.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function json(res, status, body, cid) {
  attachCorrelation(res, cid);
  return res.status(status).setHeader('cache-control', 'no-store').json(body);
}

function secureEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function normalizeProject(value = 'generic') {
  const project = String(value || 'generic').toLowerCase();
  if (project === 'pilot_clinics') return 'dabbir_clinics';
  if (project === 'pilot_celebrities') return 'dabbir_celebrities';
  if (project === 'pilot_businesses') return 'dabbir_businesses';
  return project;
}

export function verifyWebhookChallenge(query = {}, verifyToken = '') {
  const mode = String(query['hub.mode'] || '');
  const token = String(query['hub.verify_token'] || '');
  const challenge = String(query['hub.challenge'] || '');
  if (mode !== 'subscribe' || !verifyToken || !secureEqual(token, verifyToken)) return { ok: false };
  return { ok: true, challenge };
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody);
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);

  const chunks = [];
  try {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    return null;
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

export function verifyMetaSignature(rawBody, headers = {}, appSecret = '') {
  if (!appSecret) return { ok: false, reason: 'app_secret_missing' };
  const signature = String(headers?.['x-hub-signature-256'] || '');
  if (!signature.startsWith('sha256=')) return { ok: false, reason: 'signature_missing' };
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return { ok: false, reason: 'raw_body_unavailable' };
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  return secureEqual(signature, expected) ? { ok: true } : { ok: false, reason: 'signature_invalid' };
}

function parseRawBody(rawBody) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return null;
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }
}

export function extractWhatsAppEvents(payload = {}) {
  const events = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id || null;
      const displayPhoneNumber = value.metadata?.display_phone_number || null;
      const contactNames = new Map((Array.isArray(value.contacts) ? value.contacts : [])
        .map(contact => [String(contact?.wa_id || ''), String(contact?.profile?.name || '').slice(0, 120)]));
      for (const message of value.messages || []) {
        const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
        events.push({
          type: 'message',
          messageId: message.id || null,
          from: message.from || null,
          contactName: contactNames.get(String(message.from || '')) || null,
          timestamp: message.timestamp || null,
          messageType: message.type || null,
          text: String(text || '').slice(0, 4000),
          phoneNumberId,
          displayPhoneNumber,
        });
      }
      for (const status of value.statuses || []) {
        events.push({
          type: 'status',
          messageId: status.id || null,
          recipientId: status.recipient_id || null,
          status: status.status || null,
          timestamp: status.timestamp || null,
          phoneNumberId,
          displayPhoneNumber,
        });
      }
    }
  }
  return events;
}

export function classifyDABBIREvent(event, project = 'generic') {
  if (event.type !== 'message') return { classification: 'MESSAGE_STATUS', workflow: ['STATUS_UPDATE'] };
  if (project === 'dabbir_clinics') {
    const classification = classifyClinicMessage(event.text);
    return { classification, workflow: classification === 'APPOINTMENT_REQUEST' ? ['CLASSIFY', 'CUSTOMER', 'CONVERSATION', 'BOOKING', 'TASK', 'FOLLOW_UP'] : ['CLASSIFY', 'CUSTOMER', 'CONVERSATION', 'TASK', 'FOLLOW_UP'] };
  }
  if (project === 'dabbir_celebrities') {
    const classification = classifyCelebrityMessage(event.text);
    return { classification, workflow: ['CLASSIFY', 'CUSTOMER', 'CONVERSATION', 'TASK', 'FOLLOW_UP'] };
  }
  return { classification: 'GENERAL_INQUIRY', workflow: ['CLASSIFY', 'CUSTOMER', 'CONVERSATION', 'TASK'] };
}

function unlinkedTenant(error) {
  return String(error?.code || error?.message || '').includes('WHATSAPP_TENANT_CONNECTION_NOT_FOUND');
}

export default async function handler(req, res) {
  const cid = correlationId(req);
  attachCorrelation(res, cid);
  // Keep the credentials the owner already provisioned under PILOT working after the DABBIR rename.
  // DABBIR-prefixed values win when both generations are present.
  const verifyToken = firstEnv('DABBIR_WHATSAPP_VERIFY_TOKEN', 'PILOT_WHATSAPP_VERIFY_TOKEN');
  const appSecret = firstEnv('DABBIR_WHATSAPP_APP_SECRET', 'PILOT_WHATSAPP_APP_SECRET');
  const project = normalizeProject(firstEnv('DABBIR_PROJECT', 'PILOT_PROJECT') || 'generic');

  if (req.method === 'GET') {
    const result = verifyWebhookChallenge({
      'hub.mode': singleQueryValue(req, 'hub.mode'),
      'hub.verify_token': singleQueryValue(req, 'hub.verify_token'),
      'hub.challenge': singleQueryValue(req, 'hub.challenge'),
    }, verifyToken);
    if (!result.ok) {
      logEvent('warn', { correlation_id: cid, component: 'whatsapp_webhook', operation: 'challenge_verification', outcome: 'FAILED', failure_class: 'AUTH' });
      return res.status(403).setHeader('x-dabbir-correlation-id', cid).send('forbidden');
    }
    logEvent('info', { correlation_id: cid, component: 'whatsapp_webhook', operation: 'challenge_verification', outcome: 'VERIFIED_SUCCESS' });
    return res.status(200).setHeader('x-dabbir-correlation-id', cid).send(result.challenge);
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed', correlation_id: cid }, cid);

  const rawBody = await readRawBody(req);
  const signature = verifyMetaSignature(rawBody, req.headers || {}, appSecret);
  if (!signature.ok) {
    logEvent('warn', { correlation_id: cid, component: 'whatsapp_webhook', operation: 'signature_verification', outcome: 'FAILED', failure_class: 'SECURITY', reason: signature.reason });
    return json(res, 401, { ok: false, error: 'invalid_meta_signature', reason: signature.reason, correlation_id: cid }, cid);
  }

  const payload = parseRawBody(rawBody);
  if (!payload || payload.object !== 'whatsapp_business_account') {
    logEvent('warn', { correlation_id: cid, component: 'whatsapp_webhook', operation: 'payload_validation', outcome: 'FAILED', failure_class: 'USER_INPUT' });
    return json(res, 400, { ok: false, error: 'invalid_whatsapp_payload', correlation_id: cid }, cid);
  }

  const events = extractWhatsAppEvents(payload);
  const routed = events.map((event) => ({ ...event, ...classifyDABBIREvent(event, project) }));
  const messageCount = routed.filter(e => e.type === 'message').length;
  const statusCount = routed.filter(e => e.type === 'status').length;
  const classifications = [...new Set(routed.map(e => e.classification).filter(Boolean))].slice(0, 20);
  let persistedMessages = 0;
  let duplicateMessages = 0;
  let matchedStatuses = 0;
  let providerVerifiedStatuses = 0;
  let unlinkedMessages = 0;

  try {
    for (const event of routed) {
      if (event.type === 'message') {
        try {
          const result = await persistSignedInbound(event);
          if (result.persisted) persistedMessages += 1;
          if (result.duplicate) duplicateMessages += 1;
        } catch (error) {
          if (unlinkedTenant(error)) {
            unlinkedMessages += 1;
            continue;
          }
          throw error;
        }
      } else if (event.type === 'status') {
        const result = await applySignedStatus(event);
        if (result.matched) matchedStatuses += 1;
        if (result.providerVerified) providerVerifiedStatuses += 1;
      }
    }
  } catch (error) {
    const missingService = String(error?.code || error?.message || '').includes('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED');
    const status = missingService ? 503 : Number(error?.status || 502);
    logEvent('error', {
      correlation_id: cid,
      component: 'whatsapp_webhook',
      operation: 'signed_event_persistence',
      outcome: 'FAILED',
      failure_class: missingService ? 'CONFIGURATION' : 'DATABASE',
      event_count: routed.length,
      message_count: messageCount,
      status_count: statusCount,
    });
    return json(res, status, {
      ok: false,
      service: 'dabbir-whatsapp-webhook',
      state: missingService ? 'SERVER_PERSISTENCE_NOT_CONFIGURED' : 'SIGNED_EVENT_PERSISTENCE_FAILED',
      signature_verified: true,
      persisted: false,
      outbound_messages_sent: false,
      retryable: true,
      correlation_id: cid,
    }, cid);
  }

  const persistenceVerified = messageCount === 0 || persistedMessages === messageCount - unlinkedMessages;
  const state = unlinkedMessages > 0 && persistedMessages === 0
    ? 'TENANT_NOT_LINKED'
    : (persistedMessages > 0 || matchedStatuses > 0 ? 'LIVE_EVENT_PERSISTED' : 'SIGNED_EVENT_NO_ACTION');

  // Never log or echo message text, sender/recipient IDs, phone numbers, message IDs, or raw payloads.
  logEvent('info', {
    correlation_id: cid,
    component: 'whatsapp_webhook',
    operation: 'signed_event_persistence',
    outcome: persistenceVerified ? 'VERIFIED_SUCCESS' : 'PARTIAL',
    project,
    event_count: routed.length,
    message_count: messageCount,
    status_count: statusCount,
    classifications,
    persisted_messages: persistedMessages,
    duplicate_messages: duplicateMessages,
    matched_statuses: matchedStatuses,
    provider_verified_statuses: providerVerifiedStatuses,
    unlinked_messages: unlinkedMessages,
    outbound_messages_sent: false,
  });

  return json(res, 200, {
    ok: true,
    service: 'dabbir-whatsapp-webhook',
    project,
    state,
    signature_verified: true,
    event_count: routed.length,
    message_count: messageCount,
    status_count: statusCount,
    classifications,
    persisted: persistedMessages > 0,
    persistence_verified: persistenceVerified,
    duplicate_messages: duplicateMessages,
    matched_statuses: matchedStatuses,
    provider_verified_statuses: providerVerifiedStatuses,
    tenant_unlinked_events: unlinkedMessages,
    outbound_messages_sent: false,
    external_side_effects: false,
    correlation_id: cid,
    timestamp: new Date().toISOString(),
  }, cid);
}
