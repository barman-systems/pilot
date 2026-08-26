import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getWhatsAppConfig } from '../api/dabbir-whatsapp-status.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const managedKeys = [
  'DABBIR_WHATSAPP_VERIFY_TOKEN',
  'DABBIR_WHATSAPP_APP_SECRET',
  'PILOT_WHATSAPP_VERIFY_TOKEN',
  'PILOT_WHATSAPP_APP_SECRET',
  'DABBIR_WHATSAPP_ACCESS_TOKEN',
  'PILOT_WHATSAPP_ACCESS_TOKEN',
  'DABBIR_WHATSAPP_PHONE_NUMBER_ID',
  'PILOT_WHATSAPP_PHONE_NUMBER_ID',
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
    process.env.PILOT_WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
    process.env.PILOT_WHATSAPP_APP_SECRET = 'test-app-secret';
    const config = getWhatsAppConfig();
    assert.equal(config.webhookConfigured, true);
    assert.equal(config.configured, true);
  });
});

test('DABBIR WhatsApp credentials take precedence when both generations exist', () => {
  withCleanEnv(() => {
    process.env.PILOT_WHATSAPP_VERIFY_TOKEN = 'legacy-verify';
    process.env.PILOT_WHATSAPP_APP_SECRET = 'legacy-secret';
    process.env.DABBIR_WHATSAPP_VERIFY_TOKEN = 'dabbir-verify';
    process.env.DABBIR_WHATSAPP_APP_SECRET = 'dabbir-secret';
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

test('webhook accepts both DABBIR and legacy PILOT credential names', async () => {
  const webhook = await read('api/dabbir-whatsapp-webhook.js');
  assert.match(webhook, /DABBIR_WHATSAPP_VERIFY_TOKEN/);
  assert.match(webhook, /PILOT_WHATSAPP_VERIFY_TOKEN/);
  assert.match(webhook, /DABBIR_WHATSAPP_APP_SECRET/);
  assert.match(webhook, /PILOT_WHATSAPP_APP_SECRET/);
  assert.match(webhook, /pilot_clinics/);
  assert.match(webhook, /dabbir_clinics/);
});
