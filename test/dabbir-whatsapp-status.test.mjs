import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getWhatsAppConfig, tenantUnconfiguredStatus } from '../api/dabbir-whatsapp-status.js';

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

test('tenant without an Embedded Signup connection never inherits the legacy global WhatsApp number', () => {
  const status = tenantUnconfiguredStatus();
  assert.equal(status.source, 'embedded_signup');
  assert.equal(status.configured, false);
  assert.equal(status.connected, false);
  assert.equal(status.state, 'NOT_CONFIGURED');
  assert.equal(status.phone, null);
  assert.equal(status.waba_id, null);
  assert.equal(status.phone_number_id, null);
  assert.equal(status.meta_check_reason, 'TENANT_WHATSAPP_NOT_LINKED');
});

test('authenticated WhatsApp status fails closed instead of exposing legacy global identity', async () => {
  const statusApi = await read('api/dabbir-whatsapp-status.js');
  assert.match(statusApi, /getBusinessMemberships/);
  assert.match(statusApi, /BUSINESS_CONTEXT_REQUIRED/);
  assert.doesNotMatch(statusApi, /source:\s*['"]legacy_server_config['"]/);
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
