import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getWhatsAppConfig } from '../api/dabbir-whatsapp-status.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const dabbirVerifyKey = ['DABBIR', 'WHATSAPP', 'VERIFY', 'TOKEN'].join('_');
const dabbirSecretKey = ['DABBIR', 'WHATSAPP', 'APP', 'SECRET'].join('_');
const pilotVerifyKey = ['PILOT', 'WHATSAPP', 'VERIFY', 'TOKEN'].join('_');
const pilotSecretKey = ['PILOT', 'WHATSAPP', 'APP', 'SECRET'].join('_');
const managedKeys = [
  dabbirVerifyKey,
  dabbirSecretKey,
  pilotVerifyKey,
  pilotSecretKey,
  ['DABBIR', 'WHATSAPP', 'ACCESS', 'TOKEN'].join('_'),
  ['PILOT', 'WHATSAPP', 'ACCESS', 'TOKEN'].join('_'),
  ['DABBIR', 'WHATSAPP', 'PHONE', 'NUMBER', 'ID'].join('_'),
  ['PILOT', 'WHATSAPP', 'PHONE', 'NUMBER', 'ID'].join('_'),
];

function withCleanEnv(fn) {
  const before = Object.fromEntries(managedKeys.map(key => [key, process.env[key]]));
  for (const key of managedKeys) delete process.env[key];
  try { return fn(); }
  finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('legacy PILOT WhatsApp webhook credentials remain recognized after DABBIR rename', () => {
  withCleanEnv(() => {
    process.env[pilotVerifyKey] = 'test-verify-token';
    process.env[pilotSecretKey] = 'test-app-secret';
    const config = getWhatsAppConfig();
    assert.equal(config.webhookConfigured, true);
    assert.equal(config.configured, true);
  });
});

test('DABBIR WhatsApp credentials take precedence when both generations exist', () => {
  withCleanEnv(() => {
    process.env[pilotVerifyKey] = 'legacy-verify';
    process.env[pilotSecretKey] = 'legacy-secret';
    process.env[dabbirVerifyKey] = 'dabbir-verify';
    process.env[dabbirSecretKey] = 'dabbir-secret';
    const config = getWhatsAppConfig();
    assert.equal(config.verifyToken, 'dabbir-verify');
    assert.equal(config.appSecret, 'dabbir-secret');
  });
});

test('WhatsApp UI reads live status instead of trusting the stale static red card', async () => {
  const brandUi = await read('api/brand-ui.js');
  assert.match(brandUi, /\/api\/dabbir-whatsapp-status/);
  assert.match(brandUi, /WEBHOOK_LINKED/);
  assert.match(brandUi, /META_AUTHORIZED/);
  assert.match(brandUi, /مربوط/);
  assert.match(brandUi, /Linked/);
});

test('WhatsApp integrations UI explicitly shows the active Meta phone number', async () => {
  const brandUi = await read('api/brand-ui.js');
  assert.match(brandUi, /display_phone_number/);
  assert.match(brandUi, /رقم WhatsApp المفعّل/);
  assert.match(brandUi, /Active WhatsApp number/);
  assert.match(brandUi, /verified_name/);
  assert.match(brandUi, /Waiting for Meta verification/);
});

test('webhook accepts both DABBIR and legacy PILOT credential names', async () => {
  const webhook = await read('api/dabbir-whatsapp-webhook.js');
  assert.match(webhook, /DABBIR_WHATSAPP_VERIFY_TOKEN/);
  assert.match(webhook, /PILOT_WHATSAPP_VERIFY_TOKEN/);
  assert.match(webhook, /DABBIR_WHATSAPP_APP_SECRET/);
  assert.match(webhook, /PILOT_WHATSAPP_APP_SECRET/);
  assert.match(webhook, /pilot_clinics/);
  assert.match(webhook, /dabbir_clinics/);
});
