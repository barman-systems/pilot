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

test('Embedded Signup UI connects WhatsApp Business through Meta inside DABBIR without manual token fields', async () => {
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

test('WhatsApp connect guard defers to official Embedded Signup message flow', async () => {
  const guard = await read('api/dabbir-whatsapp-connect-guard-ui.js');
  assert.match(guard, /__dabbirWhatsAppEmbeddedUiLoaded/);
  assert.match(guard, /returns WABA\/phone IDs through WA_EMBEDDED_SIGNUP message events/);
  assert.match(guard, /if\(window\.__dabbirWhatsAppEmbeddedUiLoaded\)return/);
});

test('DABBIR prefers WhatsApp Business app coexistence so verification happens through the existing WhatsApp Business account', async () => {
  const ui = await read('api/dabbir-whatsapp-embedded-ui.js');
  const endpoint = await read('api/dabbir-whatsapp-embedded-complete.js');

  assert.match(ui, /whatsapp_business_app_onboarding/);
  assert.match(ui, /EMBEDDED_SIGNUP_VERSION='v4'/);
  assert.match(ui, /FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING/);
  assert.match(ui, /FINISH_ONLY_WABA/);
  assert.match(ui, /onboarding_mode:COEXISTENCE_FEATURE/);
  assert.match(ui, /extras:\{setup:\{\},featureType:COEXISTENCE_FEATURE\}/);
  assert.doesNotMatch(ui, /sessionInfoVersion:'3'/);

  assert.match(endpoint, /resolveCoexistencePhoneNumberId/);
  assert.match(endpoint, /is_on_biz_app/);
  assert.match(endpoint, /platform_type/);
  assert.match(endpoint, /META_COEXISTENCE_PHONE_RESOLUTION_REQUIRED/);
  assert.match(endpoint, /coexistence:\s*onboardingMode === 'whatsapp_business_app_onboarding'/);
});

test('iPhone Meta login preserves the original user activation by prewarming the SDK before tap', async () => {
  const ui = await read('api/dabbir-whatsapp-embedded-ui.js');
  const start = ui.indexOf('async function connectWhatsApp');
  const end = ui.indexOf('async function disconnectWhatsApp', start);
  assert.ok(start >= 0 && end > start);
  const body = ui.slice(start, end);
  const login = body.indexOf('FB.login');
  const firstAwait = body.indexOf('await ');
  assert.ok(login >= 0);
  assert.ok(firstAwait === -1 || login < firstAwait, 'FB.login must run before the first await in the click path');
  assert.doesNotMatch(body, /await loadConfig|await loadSdk/);
  assert.match(ui, /async function prepareMeta/);
  assert.match(ui, /sdk_preload_start/);
  assert.match(ui, /Meta secure onboarding/);
  assert.match(body, /const sessionPromise=waitForSession\(\)/);
  assert.match(body, /login_invoked/);
});

test('Embedded Signup does not time out during a normal multi-step Meta mobile journey and trusts only HTTPS facebook.com hosts', async () => {
  const ui = await read('api/dabbir-whatsapp-embedded-ui.js');
  assert.match(ui, /SESSION_TIMEOUT_MS=15\*60\*1000/);
  assert.doesNotMatch(ui, /waitForSession\(timeoutMs=12000\)/);
  assert.match(ui, /function trustedMetaOrigin\(origin\)/);
  assert.match(ui, /url\.protocol==='https:'/);
  assert.match(ui, /host==='facebook\.com'\|\|host\.endsWith\('\.facebook\.com'\)/);
});

test('Embedded Signup reports safe client stages to production logs without tokens or asset IDs', async () => {
  const ui = await read('api/dabbir-whatsapp-embedded-ui.js');
  const events = await read('api/dabbir-whatsapp-client-event.js');
  assert.match(ui, /\/api\/dabbir-whatsapp-client-event/);
  assert.match(ui, /connect_start/);
  assert.match(ui, /login_invoked/);
  assert.match(ui, /login_callback/);
  assert.match(ui, /session_finish/);
  assert.match(ui, /complete_start/);
  assert.match(ui, /connect_error/);
  assert.match(events, /DABBIR_WHATSAPP_EMBEDDED_CLIENT/);
  assert.match(events, /has_code/);
  assert.match(events, /has_waba/);
  assert.match(events, /has_phone/);
  assert.doesNotMatch(events, /access_token/);
  assert.doesNotMatch(events, /phone_number_id/);
  assert.doesNotMatch(events, /waba_id/);
});

test('WhatsApp uses the current Graph API version by default and surfaces actionable Meta link errors', async () => {
  const core = await read('api/_whatsapp-embedded-core.js');
  const status = await read('api/dabbir-whatsapp-status.js');
  const ui = await read('api/dabbir-whatsapp-embedded-ui.js');
  const endpoint = await read('api/dabbir-whatsapp-embedded-complete.js');
  assert.match(core, /configuredGraphVersion === 'v23\.0' \? 'v26\.0'/);
  assert.match(status, /configuredGraphVersion === 'v23\.0' \? 'v26\.0'/);
  assert.match(ui, /dabbir\.bmalman\.com/);
  assert.match(ui, /Allowed domains/);
  assert.match(ui, /Valid OAuth Redirect URIs/);
  assert.match(ui, /provider_code/);
  assert.match(ui, /function canonicalRedirectUri\(\)/);
  assert.doesNotMatch(ui, /redirect_uri:canonicalRedirectUri\(\)/);
  assert.match(endpoint, /url\.search = ''/);
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

test('Embedded completion exchanges v4 authorization code with the exact request-derived redirect URI', async () => {
  const endpoint = await read('api/dabbir-whatsapp-embedded-complete.js');
  const handlerStart = endpoint.indexOf('export default async function handler');
  assert.ok(handlerStart >= 0);
  const handler = endpoint.slice(handlerStart);
  assert.match(handler, /oauthRedirectUriFromRequest\(req\)/);
  assert.match(handler, /exchangeEmbeddedCodeWithDomainRepair\(platform, code, redirectUri, \{ exchangeMode \}\)/);
  assert.doesNotMatch(handler, /exchangeEmbeddedCode\(platform, code\)/);
  assert.match(endpoint, /providerSubcode/);
});

test('FB.login code exchange uses the JavaScript SDK xd_arbiter redirect and keeps manual OAuth isolated', async () => {
  const ui = await read('api/dabbir-whatsapp-embedded-ui.js');
  const guard = await read('api/dabbir-whatsapp-connect-guard-ui.js');
  const endpoint = await read('api/dabbir-whatsapp-embedded-complete.js');

  assert.match(ui, /exchange_mode:'facebook_js_sdk'/);
  assert.match(guard, /exchange_mode:'redirect'/);
  assert.match(endpoint, /https:\/\/staticxx\.facebook\.com\/x\/connect\/xd_arbiter\/\?version=\$\{version\}/);
  assert.match(endpoint, /DABBIR_META_SDK_XD_VERSION/);
  assert.match(endpoint, /exchangeMode === 'facebook_js_sdk'/);
  assert.match(endpoint, /sdkRedirectCandidates\(redirectUri, exchangeMode\)/);
  assert.match(endpoint, /providerSubcode \|\| 0\) === 36008/);
});

test('Embedded completion self-heals only the authoritative production Meta App Domain after provider error 191', async () => {
  const endpoint = await read('api/dabbir-whatsapp-embedded-complete.js');
  assert.match(endpoint, /function productionMetaRepairHost\(redirectUri\)/);
  assert.match(endpoint, /VERCEL_PROJECT_PRODUCTION_URL/);
  assert.match(endpoint, /VERCEL_ENV/);
  assert.match(endpoint, /redirectHost !== configuredHost/);
  assert.match(endpoint, /Number\(error\?\.providerCode \|\| 0\) === 191/);
  assert.match(endpoint, /fields', 'app_domains'/);
  assert.match(endpoint, /body\.set\('app_domains', JSON\.stringify\(domains\)\)/);
  assert.match(endpoint, /META_APP_DOMAIN_UPDATE_UNVERIFIED/);
  assert.match(endpoint, /exchangeEmbeddedCodeWithDomainRepair/);
  assert.match(endpoint, /meta_app_domain_repaired/);
  assert.doesNotMatch(endpoint, /app_secret:/i);
});

test('WhatsApp connection storage is tenant-scoped and RLS protected', async () => {
  const migration = await read('supabase/migrations/20260826195230_dabbir_whatsapp_embedded_signup_v17.sql');
  assert.match(migration, /dabbir_whatsapp_connections/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /role in \('owner','admin'\)/);
  assert.match(migration, /revoke all on table public\.dabbir_whatsapp_connections from anon/i);
  assert.doesNotMatch(migration, /grant .* to anon/i);
});

test('WhatsApp connection persistence uses the tenant-checked database RPC', async () => {
  const core = await read('api/_whatsapp-embedded-core.js');
  const migration = await read('supabase/migrations/20260831032000_dabbir_whatsapp_connection_upsert_rpc_v1.sql');
  assert.match(core, /supabaseRpc\('dabbir_whatsapp_upsert_connection'/);
  assert.doesNotMatch(core, /supabaseRest\('dabbir_whatsapp_connections\?on_conflict=business_id'/);
  assert.match(migration, /create or replace function public\.dabbir_whatsapp_upsert_connection/);
  assert.match(migration, /dabbir_private\.is_active_member\(p_business_id\)/);
  assert.match(migration, /WHATSAPP_PHONE_ALREADY_CONNECTED/);
  assert.match(migration, /on conflict \(business_id\) do update/);
  assert.match(migration, /grant execute on function public\.dabbir_whatsapp_upsert_connection/);
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
