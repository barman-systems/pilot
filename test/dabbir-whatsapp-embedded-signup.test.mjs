import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openAccessToken, sealAccessToken } from '../api/_whatsapp-embedded-core.js';
import { DABBIR_PUBLIC_RUNTIME } from '../config/dabbir-public-runtime.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('canonical DABBIR public runtime pins the Meta and production identities', () => {
  assert.equal(DABBIR_PUBLIC_RUNTIME.productionOrigin, 'https://dabbir-nd56cm4j5v-3619s-projects.vercel.app');
  assert.equal(DABBIR_PUBLIC_RUNTIME.metaAppId, '1876008666699823');
  assert.equal(DABBIR_PUBLIC_RUNTIME.whatsappEmbeddedConfigId, '1984552462260787');
  assert.equal(DABBIR_PUBLIC_RUNTIME.vercelProjectId, 'prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq');
});

test('WhatsApp tenant access token is sealed and can be opened only with the server secret', () => {
  const config = { encryptionSecret: 'unit-test-only-encryption-material' };
  const businessId = '0b540176-8dd6-44b4-a5b7-aea4933e88f6';
  const token = ['EA', 'test', 'token', 'not-real'].join('-');
  const sealed = sealAccessToken(token, config, businessId);
  assert.notEqual(sealed.access_token_ciphertext, token);
  assert.equal(openAccessToken(sealed, config, businessId), token);
  assert.throws(() => openAccessToken(sealed, { encryptionSecret: 'wrong-key' }, businessId));
});

test('Embedded Signup UI connects through Meta inside DABBIR without manual token fields', async () => {
  const ui = await read('api/dabbir-whatsapp-embedded-ui.js');
  assert.match(ui, /FB\.login/);
  assert.match(ui, /config_id/);
  assert.match(ui, /override_default_response_type/);
  assert.match(ui, /WA_EMBEDDED_SIGNUP/);
  assert.match(ui, /\/api\/dabbir-whatsapp-embedded-complete/);
  assert.match(ui, /ربط WhatsApp/);
  assert.match(ui, /تغيير رقم WhatsApp/);
  assert.match(ui, /فصل WhatsApp/);
  assert.doesNotMatch(ui, /type=["']password["']/);
});

test('Embedded Signup does not time out during a normal multi-step Meta mobile journey', async () => {
  const ui = await read('api/dabbir-whatsapp-embedded-ui.js');
  assert.match(ui, /SESSION_TIMEOUT_MS=15\*60\*1000/);
  assert.doesNotMatch(ui, /waitForSession\(timeoutMs=12000\)/);
  assert.match(ui, /https:\/\/m\.facebook\.com/);
  assert.match(ui, /https:\/\/business\.facebook\.com/);
});

test('Embedded Signup reports safe client stages without tokens or Meta asset IDs', async () => {
  const ui = await read('api/dabbir-whatsapp-embedded-ui.js');
  const events = await read('api/dabbir-whatsapp-client-event.js');
  assert.match(ui, /\/api\/dabbir-whatsapp-client-event/);
  for (const stage of ['connect_start','login_callback','session_finish','complete_start','connect_error']) {
    assert.match(ui, new RegExp(stage));
  }
  assert.match(events, /DABBIR_WHATSAPP_EMBEDDED_CLIENT/);
  assert.match(events, /has_code/);
  assert.match(events, /has_waba/);
  assert.match(events, /has_phone/);
  assert.doesNotMatch(events, /access_token/);
  assert.doesNotMatch(events, /phone_number_id/);
  assert.doesNotMatch(events, /waba_id/);
});

test('Embedded completion is canonical-origin-only, server-side, and never returns access tokens', async () => {
  const endpoint = await read('api/dabbir-whatsapp-embedded-complete.js');
  assert.match(endpoint, /isCanonicalProductionRequest/);
  assert.match(endpoint, /CANONICAL_PRODUCTION_ORIGIN_REQUIRED/);
  assert.match(endpoint, /exchangeEmbeddedCode/);
  assert.match(endpoint, /sealAccessToken/);
  assert.match(endpoint, /verifyEmbeddedAssets/);
  assert.match(endpoint, /secrets_exposed:\s*false/);
  assert.doesNotMatch(endpoint, /access_token:\s*exchanged\.accessToken/);
});

test('WhatsApp connection storage remains tenant-scoped and RLS protected', async () => {
  const migration = await read('supabase/migrations/20260826195230_dabbir_whatsapp_embedded_signup_v17.sql');
  assert.match(migration, /dabbir_whatsapp_connections/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /role in \('owner','admin'\)/);
  assert.match(migration, /revoke all on table public\.dabbir_whatsapp_connections from anon/i);
  assert.doesNotMatch(migration, /grant .* to anon/i);
});

test('production shell and CSP cover the supported Meta browser origins', async () => {
  const shell = await read('api/app-recovery.js');
  const vercel = await read('vercel.json');
  assert.match(shell, /\/api\/dabbir-whatsapp-embedded-ui/);
  assert.match(vercel, /https:\/\/connect\.facebook\.net/);
  for (const origin of ['www\\.facebook\\.com','web\\.facebook\\.com','m\\.facebook\\.com','business\\.facebook\\.com']) {
    assert.match(vercel, new RegExp(origin));
  }
});

test('Embedded Signup platform config is canonical-origin gated', async () => {
  const endpoint = await read('api/dabbir-whatsapp-embedded-config.js');
  assert.match(endpoint, /isCanonicalProductionRequest/);
  assert.match(endpoint, /canonical_origin_active/);
  assert.match(endpoint, /expected_origin/);
  assert.match(endpoint, /platformReady/);
});

test('Embedded Signup no longer discovers DABBIR identity from old WhatsApp credentials', async () => {
  const core = await read('api/_whatsapp-embedded-core.js');
  assert.match(core, /DABBIR_PUBLIC_RUNTIME/);
  assert.match(core, /dabbir_public_runtime/);
  assert.doesNotMatch(core, /discoverAppIdFromExistingToken/);
  assert.doesNotMatch(core, /legacyWhatsAppAccessToken/);
  assert.doesNotMatch(core, /PILOT_META_/);
  assert.doesNotMatch(core, /PILOT_WHATSAPP_APP_ID/);
  assert.doesNotMatch(core, /FACEBOOK_APP_ID/);
  assert.doesNotMatch(core, /META_APP_ID/);
});

test('browser config exposes public Meta IDs only and never server secrets', async () => {
  const endpoint = await read('api/dabbir-whatsapp-embedded-config.js');
  assert.match(endpoint, /app_id:/);
  assert.match(endpoint, /config_id:/);
  assert.doesNotMatch(endpoint, /access_token\s*:/i);
  assert.doesNotMatch(endpoint, /app_secret\s*:/i);
  assert.match(endpoint, /secrets_exposed:\s*false/);
});
