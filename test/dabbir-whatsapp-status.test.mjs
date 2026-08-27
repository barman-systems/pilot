import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tenantUnconfiguredStatus } from '../api/dabbir-whatsapp-status.js';
import { embeddedPlatformConfig } from '../api/_whatsapp-embedded-core.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { return fn(); }
  finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('tenant without Embedded Signup never inherits a phone identity', () => {
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

test('customer-facing WhatsApp status requires explicit business context', async () => {
  const source = await read('api/dabbir-whatsapp-status.js');
  assert.match(source, /BUSINESS_REQUIRED/);
  assert.doesNotMatch(source, /getBusinessMemberships/);
  assert.doesNotMatch(source, /legacy_server_config/);
  assert.doesNotMatch(source, /PILOT_WHATSAPP/);
  assert.doesNotMatch(source, /WHATSAPP_ACCESS_TOKEN/);
  assert.doesNotMatch(source, /OUTBOUND_CONFIGURED/);
  assert.doesNotMatch(source, /WEBHOOK_LINKED/);
});

test('Embedded Signup identity is DABBIR-only and cannot be inferred from legacy tokens', async () => {
  const source = await read('api/_whatsapp-embedded-core.js');
  assert.match(source, /DABBIR_PUBLIC_RUNTIME/);
  assert.doesNotMatch(source, /discoverAppIdFromExistingToken/);
  assert.doesNotMatch(source, /legacyWhatsAppAccessToken/);
  assert.doesNotMatch(source, /PILOT_META_APP_ID/);
  assert.doesNotMatch(source, /PILOT_WHATSAPP_APP_ID/);
  assert.doesNotMatch(source, /FACEBOOK_APP_ID/);
  assert.doesNotMatch(source, /META_WHATSAPP_ACCESS_TOKEN/);
});

test('legacy generic env cannot override the DABBIR Meta identity', () => {
  withEnv({
    DABBIR_META_APP_ID: undefined,
    DABBIR_WHATSAPP_APP_ID: undefined,
    DABBIR_WHATSAPP_EMBEDDED_CONFIG_ID: undefined,
    DABBIR_META_CONFIG_ID: undefined,
    PILOT_META_APP_ID: '999999999999999',
    META_APP_ID: '888888888888888',
    FACEBOOK_APP_ID: '777777777777777',
    PILOT_WHATSAPP_EMBEDDED_CONFIG_ID: '666666666666666',
    META_CONFIG_ID: '555555555555555',
  }, () => {
    const config = embeddedPlatformConfig();
    assert.equal(config.appId, '1876008666699823');
    assert.equal(config.configId, '1984552462260787');
    assert.equal(config.appIdSource, 'dabbir_public_runtime');
    assert.equal(config.configIdSource, 'dabbir_public_runtime');
  });
});

test('invalid provider verification is never presented as connected', async () => {
  const source = await read('api/dabbir-whatsapp-status.js');
  assert.match(source, /state:\s*'AUTHORIZATION_INVALID'/);
  assert.match(source, /connected:\s*false/);
  assert.match(source, /phone:\s*null/);
  assert.doesNotMatch(source, /CONNECTED_VERIFICATION_FAILED/);
});

test('webhook readiness is tenant-derived instead of global-server-derived', async () => {
  const source = await read('api/dabbir-whatsapp-status.js');
  assert.match(source, /subscriptionRecorded/);
  assert.match(source, /webhook_configured:\s*authorized\s*&&\s*subscriptionRecorded/);
  assert.doesNotMatch(source, /DABBIR_WHATSAPP_VERIFY_TOKEN/);
});
