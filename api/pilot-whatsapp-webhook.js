import crypto from 'node:crypto';
import { classifyClinicMessage, classifyCelebrityMessage } from './pilot-runtime.js';
import { attachCorrelation, correlationId, logEvent } from './_observability.js';
import { processWhatsAppOperationalEvent, whatsappRuntimeReadiness } from './_whatsapp-operations.js';

const MAX_EVENTS = 100;

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

export function verifyWebhookChallenge(query = {}, verifyToken = '') {
  const mode = String(query['hub.mode'] || '');
  const token = String(query['hub.verify_token'] || '');
  const challenge = String(query['hub.challenge'] || '');
  if (mode !== 'subscribe' || !verifyToken || !secureEqual(token, verifyToken)) return { ok: false };
  return { ok: true, challenge };
}

function getRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody);
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  return null;
}

export function verifyMetaSignature(req, appSecret = '') {
  if (!appSecret) return { ok: false, reason: 'app_secret_missing' };
  const signature = String(req.headers?.['x-hub-signature-256'] || '');
  if (!signature.startsWith('sha256=')) return { ok: false, reason: 'signature_missing' };
  const raw = getRawBody(req);
  if (!raw) return { ok: false, reason: 'raw_body_unavailable' };
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(raw).digest('hex')}`;
  return secureEqual(signature, expected) ? { ok: true } : { ok: false, reason: 'signature_invalid' };
}

function normalizeBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = getRawBody(req);
  if (!raw) return null;
  try { return JSON.parse(raw.toString('utf8')); } catch { return null; }
}

export function extractWhatsAppEvents(payload = {}) {
  const events = [];
  outer: for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id || null;
      for (const message of value.messages || []) {
        const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
        events.push({ type: 'message', messageId: message.id || null, from: message.from || null, timestamp: message.timestamp || null, messageType: message.type || null, text: String(text || '').slice(0, 4000), phoneNumberId });
        if (events.length >= MAX_EVENTS) break outer;
      }
      for (const status of value.statuses || []) {
        events.push({ type: 'status', messageId: status.id || null, status: status.status || null, timestamp: status.timestamp || null, phoneNumberId });
        if (events.length >= MAX_EVENTS) break outer;
      }
    }
  }
  return events;
}

export function classifyPilotEvent(event, project = 'generic') {
  if (event.type !== 'message') return { classification: 'MESSAGE_STATUS', workflow: ['STATUS_UPDATE'] };
  if (project === 'pilot_clinics') {
    const classification = classifyClinicMessage(event.text);
    return { classification, workflow: classification === 'APPOINTMENT_REQUEST' ? ['CLASSIFY', 'CUSTOMER', 'CONVERSATION', 'BOOKING', 'TASK', 'FOLLOW_UP'] : ['CLASSIFY', 'CUSTOMER', 'CONVERSATION', 'TASK', 'FOLLOW_UP'] };
  }
  if (project === 'pilot_celebrities') {
    const classification = classifyCelebrityMessage(event.text);
    return { classification, workflow: ['CLASSIFY', 'CUSTOMER', 'CONVERSATION', 'TASK', 'FOLLOW_UP'] };
  }
  return { classification: 'GENERAL_INQUIRY', workflow: ['CLASSIFY', 'CUSTOMER', 'CONVERSATION', 'TASK'] };
}

function operationalFailureStatus(code) {
  if (code === 'PATIENT_DATA_GATE_CLOSED') return 200; // policy-blocked data is deliberately not persisted or retried.
  if (code === 'UNSUPPORTED_DELIVERY_STATE') return 200;
  return 503;
}

export default async function handler(req, res) {
  const cid = correlationId(req);
  attachCorrelation(res, cid);
  const verifyToken = process.env.PILOT_WHATSAPP_VERIFY_TOKEN || '';
  const appSecret = process.env.PILOT_WHATSAPP_APP_SECRET || '';
  const project = String(process.env.PILOT_PROJECT || 'generic').toLowerCase();

  if (req.method === 'GET') {
    const result = verifyWebhookChallenge(req.query || {}, verifyToken);
    if (!result.ok) {
      logEvent('warn', { correlation_id: cid, component: 'whatsapp_webhook', operation: 'challenge_verification', outcome: 'FAILED', failure_class: 'AUTH' });
      return res.status(403).setHeader('x-pilot-correlation-id', cid).send('forbidden');
    }
    logEvent('info', { correlation_id: cid, component: 'whatsapp_webhook', operation: 'challenge_verification', outcome: 'VERIFIED_SUCCESS' });
    return res.status(200).setHeader('x-pilot-correlation-id', cid).send(result.challenge);
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed', correlation_id: cid }, cid);

  const signature = verifyMetaSignature(req, appSecret);
  if (!signature.ok) {
    logEvent('warn', { correlation_id: cid, component: 'whatsapp_webhook', operation: 'signature_verification', outcome: 'FAILED', failure_class: 'SECURITY', reason: signature.reason });
    return json(res, 401, { ok: false, error: 'invalid_meta_signature', reason: signature.reason, correlation_id: cid }, cid);
  }

  const payload = normalizeBody(req);
  if (!payload || payload.object !== 'whatsapp_business_account') {
    logEvent('warn', { correlation_id: cid, component: 'whatsapp_webhook', operation: 'payload_validation', outcome: 'FAILED', failure_class: 'USER_INPUT' });
    return json(res, 400, { ok: false, error: 'invalid_whatsapp_payload', correlation_id: cid }, cid);
  }

  const events = extractWhatsAppEvents(payload);
  const routed = events.map((event) => ({ ...event, ...classifyPilotEvent(event, project) }));
  const messageCount = routed.filter(e => e.type === 'message').length;
  const statusCount = routed.filter(e => e.type === 'status').length;
  const classifications = [...new Set(routed.map(e => e.classification).filter(Boolean))].slice(0, 20);
  const readiness = whatsappRuntimeReadiness(process.env);

  if (!readiness.runtime_enabled) {
    logEvent('info', {
      correlation_id: cid, component: 'whatsapp_webhook', operation: 'signed_inbound_normalization',
      outcome: 'PARTIAL', project, event_count: routed.length, message_count: messageCount, status_count: statusCount,
      classifications, persisted: false, outbound_messages_sent: false, runtime_enabled: false,
    });
    return json(res, 200, {
      ok: true, service: 'pilot-whatsapp-webhook', project, state: 'CONFIGURED_NOT_OPERATIONAL',
      signature_verified: true, event_count: routed.length, message_count: messageCount, status_count: statusCount,
      classifications, persisted: false, outbound_messages_sent: false, external_side_effects: false,
      correlation_id: cid, timestamp: new Date().toISOString(),
    }, cid);
  }

  const results = [];
  try {
    for (const event of routed) {
      results.push(await processWhatsAppOperationalEvent(event, event.classification, process.env));
    }
  } catch (error) {
    const code = String(error?.code || error?.message || 'WHATSAPP_OPERATION_FAILED').slice(0, 80);
    const policyBlocked = code === 'PATIENT_DATA_GATE_CLOSED';
    logEvent(policyBlocked ? 'warn' : 'error', {
      correlation_id: cid, component: 'whatsapp_webhook', operation: 'operational_ingest',
      outcome: policyBlocked ? 'FAILED' : 'UNKNOWN',
      failure_class: policyBlocked ? 'POLICY' : code.includes('CREDENTIAL') || code.includes('HMAC') ? 'AUTH' : code.includes('CONNECTION') ? 'DATA' : 'API',
      reason: code, event_count: routed.length,
    });
    return json(res, operationalFailureStatus(code), {
      ok: false,
      service: 'pilot-whatsapp-webhook',
      state: policyBlocked ? 'BLOCKED_BY_POLICY' : 'DEGRADED',
      error: code,
      signature_verified: true,
      persisted: false,
      outbound_messages_sent: false,
      correlation_id: cid,
    }, cid);
  }

  const persistedCount = results.filter(r => r.persisted).length;
  const updatedCount = results.filter(r => r.updated).length;
  const duplicateCount = results.filter(r => r.duplicate).length;
  logEvent('info', {
    correlation_id: cid, component: 'whatsapp_webhook', operation: 'operational_ingest',
    outcome: 'VERIFIED_SUCCESS', project, event_count: routed.length, persisted_count: persistedCount,
    status_updated_count: updatedCount, duplicate_count: duplicateCount,
  });
  return json(res, 200, {
    ok: true,
    service: 'pilot-whatsapp-webhook',
    project,
    state: 'OPERATIONAL_INGEST_VERIFIED',
    signature_verified: true,
    event_count: routed.length,
    message_count: messageCount,
    status_count: statusCount,
    classifications,
    persisted_count: persistedCount,
    status_updated_count: updatedCount,
    duplicate_count: duplicateCount,
    outbound_messages_sent: false,
    correlation_id: cid,
    timestamp: new Date().toISOString(),
  }, cid);
}
