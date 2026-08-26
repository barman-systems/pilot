import crypto from 'node:crypto';
import { classifyClinicMessage, classifyCelebrityMessage } from './pilot-runtime.js';

function json(res, status, body) {
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
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id || null;
      const displayPhoneNumber = value.metadata?.display_phone_number || null;
      for (const message of value.messages || []) {
        const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
        events.push({ type: 'message', messageId: message.id || null, from: message.from || null, timestamp: message.timestamp || null, messageType: message.type || null, text: String(text || '').slice(0, 4000), phoneNumberId, displayPhoneNumber });
      }
      for (const status of value.statuses || []) {
        events.push({ type: 'status', messageId: status.id || null, recipientId: status.recipient_id || null, status: status.status || null, timestamp: status.timestamp || null, phoneNumberId, displayPhoneNumber });
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

export default async function handler(req, res) {
  const verifyToken = process.env.PILOT_WHATSAPP_VERIFY_TOKEN || '';
  const appSecret = process.env.PILOT_WHATSAPP_APP_SECRET || '';
  const project = String(process.env.PILOT_PROJECT || 'generic').toLowerCase();

  if (req.method === 'GET') {
    const result = verifyWebhookChallenge(req.query || {}, verifyToken);
    if (!result.ok) return res.status(403).send('forbidden');
    return res.status(200).send(result.challenge);
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const signature = verifyMetaSignature(req, appSecret);
  if (!signature.ok) return json(res, 401, { ok: false, error: 'invalid_meta_signature', reason: signature.reason });

  const payload = normalizeBody(req);
  if (!payload || payload.object !== 'whatsapp_business_account') return json(res, 400, { ok: false, error: 'invalid_whatsapp_payload' });

  const events = extractWhatsAppEvents(payload);
  const routed = events.map((event) => ({ ...event, ...classifyPilotEvent(event, project) }));
  return json(res, 200, { ok: true, service: 'pilot-whatsapp-webhook', project, event_count: routed.length, routed, persisted: false, outbound_messages_sent: false, external_side_effects: false, timestamp: new Date().toISOString() });
}
