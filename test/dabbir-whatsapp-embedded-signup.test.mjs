import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openAccessToken, sealAccessToken } from '../api/_whatsapp-embedded-core.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('WhatsApp tenant access token is sealed and can be opened only with the server secret', () => {
  const config = {
    encryptionSecret: 'unit-test-only-encryption-material',
  };
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

test('Embedded completion exchanges authorization code server-side and never returns access token', async () => {
  const endpoint = await read('api/dabbir-whatsapp-embedded-complete.js');
  assert.match(endpoint, /exchangeEmbeddedCode/);
  assert.match(endpoint, /sealAccessToken/);
  assert.match(endpoint, /verifyEmbeddedAssets/);
  assert.match(endpoint, /resolveEmbeddedPlatformConfig/);
  assert.match(endpoint, /await resolveEmbeddedPlatformConfig\(\)/);
  assert.match(endpoint, /secrets_exposed:\s*false/);
  assert.doesNotMatch(endpoint, /access_token:\s*exchanged\.accessToken/);
});

test('WhatsApp connection storage is tenant-scoped and RLS protected', async () => {
  const migration = await read('supabase/migrations/20260826195230_dabbir_whatsapp_embedded_signup_v17.sql');
  assert.match(migration, /dabbir_whatsapp_connections/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /role in \('owner','admin'\)/);
  assert.match(migration, /revoke all on table public\.dabbir_whatsapp_connections from anon/i);
  assert.doesNotMatch(migration, /grant .* to anon/i);
});

test('production shell mounts Embedded Signup and CSP permits only required Meta browser origins', async () => {
  const shell = await read('api/app-recovery.js');
  const vercel = await read('vercel.json');
  assert.match(shell, /\/api\/dabbir-whatsapp-embedded-ui/);
  assert.match(vercel, /https:\/\/connect\.facebook\.net/);
  assert.match(vercel, /frame-src https:\/\/www\.facebook\.com https:\/\/web\.facebook\.com/);
  assert.match(vercel, /connect-src 'self' https:\/\/graph\.facebook\.com/);
});

test('status endpoint prefers business-scoped Embedded Signup when business_id is supplied', async () => {
  const status = await read('api/dabbir-whatsapp-status.js');
  assert.match(status, /embeddedStatus/);
  assert.match(status, /source:\s*'embedded_signup'/);
  assert.match(status, /singleQueryValue\(req, 'business_id'\)/);
  assert.doesNotMatch(status, /req\.query/);
  assert.match(status, /loadBusinessConnection/);
});

test('Meta App ID can be discovered server-side from the existing WhatsApp authorization', async () => {
  const core = await read('api/_whatsapp-embedded-core.js');
  const configEndpoint = await read('api/dabbir-whatsapp-embedded-config.js');

  assert.match(core, /export async function resolveEmbeddedPlatformConfig/);
  assert.match(core, /discoverAppIdFromExistingToken/);
  assert.match(core, /\/app`\)/);
  assert.match(core, /fields', 'id'/);
  assert.match(core, /appIdSource:\s*appId \? 'existing_whatsapp_token'/);
  assert.match(core, /legacyAccessTokenAvailable/);
  assert.match(configEndpoint, /await resolveEmbeddedPlatformConfig\(\)/);
  assert.match(configEndpoint, /existing_whatsapp_token_available/);
  assert.match(configEndpoint, /app_id_source/);
});

test('automatic Meta App ID discovery never exposes the legacy access token to the browser', async () => {
  const core = await read('api/_whatsapp-embedded-core.js');
  const configEndpoint = await read('api/dabbir-whatsapp-embedded-config.js');

  assert.match(core, /legacyWhatsAppAccessToken/);
  assert.doesNotMatch(configEndpoint, /access_token\s*:/i);
  assert.doesNotMatch(configEndpoint, /legacyAccessToken\s*:/);
  assert.match(configEndpoint, /values_exposed:\s*false/);
  assert.match(configEndpoint, /secrets_exposed:\s*false/);
});
