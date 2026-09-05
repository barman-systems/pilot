import { singleQueryValue } from './_request-query.js';
import { attachCorrelation, correlationId, logEvent } from './_observability.js';
import {
  extractWhatsAppEvents,
  verifyMetaSignature,
  verifyWebhookChallenge,
} from './dabbir-whatsapp-webhook.js';
import { metaTestConfig, sendMetaTestReply } from './_whatsapp-meta-test-core.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function json(res, status, body, cid) {
  attachCorrelation(res, cid);
  return res.status(status).setHeader('cache-control', 'no-store').json(body);
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

function parseRawBody(rawBody) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return null;
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const cid = correlationId(req);
  attachCorrelation(res, cid);

  const testConfig = metaTestConfig();
  const verifyToken = firstEnv('DABBIR_WHATSAPP_VERIFY_TOKEN', 'PILOT_WHATSAPP_VERIFY_TOKEN');
  const appSecret = firstEnv('DABBIR_WHATSAPP_APP_SECRET', 'PILOT_WHATSAPP_APP_SECRET');

  if (!testConfig.enabled) {
    return json(res, 503, {
      ok: false,
      service: 'dabbir-whatsapp-meta-test-webhook',
      state: 'META_TEST_MODE_DISABLED',
      correlation_id: cid,
    }, cid);
  }

  if (req.method === 'GET') {
    const result = verifyWebhookChallenge({
      'hub.mode': singleQueryValue(req, 'hub.mode'),
      'hub.verify_token': singleQueryValue(req, 'hub.verify_token'),
      'hub.challenge': singleQueryValue(req, 'hub.challenge'),
    }, verifyToken);
    if (!result.ok) return res.status(403).setHeader('x-dabbir-correlation-id', cid).send('forbidden');
    return res.status(200).setHeader('x-dabbir-correlation-id', cid).send(result.challenge);
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'method_not_allowed', correlation_id: cid }, cid);
  }

  const rawBody = await readRawBody(req);
  const signature = verifyMetaSignature(rawBody, req.headers || {}, appSecret);
  if (!signature.ok) {
    logEvent('warn', {
      correlation_id: cid,
      component: 'whatsapp_meta_test',
      operation: 'signature_verification',
      outcome: 'FAILED',
      failure_class: 'SECURITY',
      reason: signature.reason,
    });
    return json(res, 401, {
      ok: false,
      error: 'invalid_meta_signature',
      reason: signature.reason,
      correlation_id: cid,
    }, cid);
  }

  const payload = parseRawBody(rawBody);
  if (!payload || payload.object !== 'whatsapp_business_account') {
    return json(res, 400, { ok: false, error: 'invalid_whatsapp_payload', correlation_id: cid }, cid);
  }

  const messages = extractWhatsAppEvents(payload).filter(event => event.type === 'message');
  const results = [];
  for (const event of messages) {
    results.push(await sendMetaTestReply(event, testConfig));
  }

  const sent = results.filter(result => result.sent).length;
  const attempted = results.filter(result => result.attempted).length;
  const failures = results.filter(result => result.attempted && !result.sent).length;

  logEvent(failures > 0 ? 'warn' : 'info', {
    correlation_id: cid,
    component: 'whatsapp_meta_test',
    operation: 'test_number_round_trip',
    outcome: failures > 0 ? 'PARTIAL' : 'VERIFIED_SUCCESS',
    inbound_messages: messages.length,
    outbound_attempted: attempted,
    outbound_sent: sent,
    outbound_failures: failures,
  });

  // Return 200 after a valid signed webhook so Meta does not retry and create
  // duplicate test replies. Provider-send failures remain visible in logs/results.
  return json(res, 200, {
    ok: true,
    service: 'dabbir-whatsapp-meta-test-webhook',
    state: sent > 0 ? 'META_TEST_REPLY_SENT' : (messages.length ? 'META_TEST_REPLY_NOT_SENT' : 'SIGNED_EVENT_NO_MESSAGE'),
    signature_verified: true,
    inbound_messages: messages.length,
    outbound_attempted: attempted,
    outbound_sent: sent,
    outbound_failures: failures,
    results: results.map(result => ({
      attempted: result.attempted,
      sent: result.sent,
      reason: result.reason || null,
      provider_status: result.providerStatus || null,
      provider_code: result.providerCode || null,
      message_id: result.messageId || null,
    })),
    correlation_id: cid,
    timestamp: new Date().toISOString(),
  }, cid);
}
