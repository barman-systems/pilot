import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import whatsappHandler from '../api/dabbir-whatsapp-webhook.js';
import { classifyFailure, correlationId, FAILURE_CLASSES } from '../api/_observability.js';

const root = new URL('../', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');

const migration = await read('db/pilot_phase2_operational_outcomes_v3.sql');
const translation = await read('api/translate.js');
const whatsapp = await read('api/dabbir-whatsapp-webhook.js');
const appSecretEnv = ['DABBIR', 'WHATSAPP', 'APP', 'SECRET'].join('_');
const projectEnv = ['DABBIR', 'PROJECT'].join('_');

test('failure taxonomy includes authorization and classifies provider 403 as external provider', () => {
  assert.equal(FAILURE_CLASSES.has('AUTHORIZATION'), true);
  const error = Object.assign(new Error('GatewayInternalServerError RestrictedModelsError no_providers_available'), { statusCode: 403 });
  assert.equal(classifyFailure(error, 'AI'), 'EXTERNAL_PROVIDER');
  assert.equal(classifyFailure(Object.assign(new Error('unauthorized session'), { statusCode: 403 }), 'UNKNOWN'), 'AUTH');
});

test('correlation ids preserve safe incoming ids and replace malformed ones', () => {
  assert.equal(correlationId({ headers: { 'x-correlation-id': 'pilot:req-12345678' } }), 'pilot:req-12345678');
  const generated = correlationId({ headers: { 'x-correlation-id': 'bad id with spaces' } });
  assert.match(generated, /^[0-9a-f-]{36}$/i);
});

test('operational outcome ledger counts only verified autonomous successes for outcome metrics', () => {
  for (const outcome of ['VERIFIED_SUCCESS','FAILED','PARTIAL','UNKNOWN']) assert.match(migration, new RegExp(`'${outcome}'`));
  assert.match(migration, /safe_eligible and autonomous and outcome='VERIFIED_SUCCESS'/i);
  assert.match(migration, /sum\(estimated_manual_seconds\) filter \(where autonomous and outcome='VERIFIED_SUCCESS'\)/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /security_invoker=true/i);
  assert.match(migration, /no synthetic\/demo credit/i);
});

test('translation failure is truthful and degraded rather than silently switching models', () => {
  assert.match(translation, /state: 'DEGRADED'/);
  assert.match(translation, /translation_unavailable/);
  assert.match(translation, /classifyFailure/);
  assert.match(translation, /original_preserved: true/);
  assert.doesNotMatch(translation, /fallbackModels|models:\s*\[/i);
});

test('signed WhatsApp webhook response never echoes customer content or identifiers', async () => {
  const oldSecret = process.env[appSecretEnv];
  const oldProject = process.env[projectEnv];
  process.env[appSecretEnv] = 'synthetic-test-app-key';
  process.env[projectEnv] = 'pilot_clinics';

  try {
    const sensitive = {
      text: 'ابا موعد باجر العصر CUSTOMER_PRIVATE_TEXT',
      sender: '971500000000',
      phoneId: 'phone-id-private-123',
      messageId: 'wamid.private-message-123',
      displayPhone: '+971 50 000 0000',
    };
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: sensitive.phoneId, display_phone_number: sensitive.displayPhone },
          messages: [{
            id: sensitive.messageId,
            from: sensitive.sender,
            timestamp: '1787720000',
            type: 'text',
            text: { body: sensitive.text },
          }],
        },
      }] }],
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = `sha256=${crypto.createHmac('sha256', process.env[appSecretEnv]).update(rawBody).digest('hex')}`;
    const req = { method: 'POST', headers: { 'x-hub-signature-256': signature }, rawBody, query: {} };
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) { this.statusCode = code; return this; },
      setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this; },
      json(body) { this.body = body; return this; },
      send(body) { this.body = body; return this; },
    };

    await whatsappHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.signature_verified, true);
    assert.equal(res.body.state, 'CONFIGURED_NOT_OPERATIONAL');
    assert.equal(res.body.persisted, false);
    assert.equal(res.body.outbound_messages_sent, false);
    assert.equal(res.body.classifications.includes('APPOINTMENT_REQUEST'), true);
    assert.ok(res.headers['x-dabbir-correlation-id']);

    const responseText = JSON.stringify(res.body);
    for (const value of Object.values(sensitive)) assert.equal(responseText.includes(value), false);
  } finally {
    if (oldSecret === undefined) delete process.env[appSecretEnv];
    else process.env[appSecretEnv] = oldSecret;
    if (oldProject === undefined) delete process.env[projectEnv];
    else process.env[projectEnv] = oldProject;
  }
});

test('WhatsApp source does not claim persistence, outbound delivery, or operational connection', () => {
  assert.match(whatsapp, /state: 'CONFIGURED_NOT_OPERATIONAL'/);
  assert.match(whatsapp, /persisted: false/);
  assert.match(whatsapp, /outbound_messages_sent: false/);
  assert.doesNotMatch(whatsapp, /state: 'CONNECTED'/);
});
