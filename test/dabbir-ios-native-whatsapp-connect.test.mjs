import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mobileConnectStateHash, newMobileConnectState } from '../api/mobile/_whatsapp-connect-core.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260828225000_dabbir_whatsapp_mobile_connect_sessions_v2.sql');
const start = read('api/mobile/whatsapp-connect/start.js');
const capture = read('api/mobile/whatsapp-connect/capture.js');
const complete = read('api/mobile/whatsapp-connect/complete.js');
const page = read('api/mobile/whatsapp-connect/page.js');
const core = read('api/mobile/_whatsapp-connect-core.js');
const mobile = read('mobile/src/WhatsAppConnectCard.tsx');
const api = read('mobile/src/api.ts');
const mobilePackage = JSON.parse(read('mobile/package.json'));

test('native WhatsApp state is high entropy and stored only as SHA-256', () => {
  const state = newMobileConnectState();
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  const hash = mobileConnectStateHash(state);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, state);
  assert.match(migration, /state_hash text primary key/);
  assert.doesNotMatch(migration, /\bstate\s+text/i);
});

test('connect-session table is force-RLS service-only and never stores DABBIR or Meta access tokens', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke all on table public\.dabbir_whatsapp_mobile_connect_sessions from authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.dabbir_whatsapp_mobile_connect_sessions to service_role/i);
  assert.doesNotMatch(migration, /user_access_token|meta_access_token|refresh_token/i);
});

test('Meta authorization code exists only encrypted in transient states and is erased terminally', () => {
  assert.match(migration, /status in \('pending','consumed','failed'\)[\s\S]*code_ciphertext is null[\s\S]*code_iv is null[\s\S]*code_tag is null[\s\S]*code_key_version is null/i);
  assert.match(migration, /status in \('captured','completing'\)[\s\S]*code_ciphertext is not null/i);
  assert.match(core, /status=eq\.pending/);
  assert.match(core, /status=eq\.captured/);
  assert.match(core, /code_ciphertext: null[\s\S]*code_iv: null[\s\S]*code_tag: null[\s\S]*code_key_version: null/);
});

test('native start is Bearer-authenticated and bound to owner/admin business context', () => {
  assert.match(start, /requireNativeBearer\(req, res\)/);
  assert.match(start, /ownerContext\(req, businessId\)/);
  assert.match(start, /createMobileConnectSession/);
  assert.match(start, /return_url: 'dabbir:\/\/whatsapp-connect'/);
});

test('system-browser page keeps state in URL fragment and Meta code out of app deep link', () => {
  assert.match(start, /#state=/);
  assert.match(page, /location\.hash\.slice\(1\)/);
  assert.match(page, /meta name="referrer" content="no-referrer"/);
  assert.match(page, /\/api\/mobile\/whatsapp-connect\/capture/);
  assert.match(page, /finish\('captured'\)/);
  assert.doesNotMatch(page, /RETURN_URL\+[^\n]*code/);
  assert.match(capture, /requireSameOrigin\(req\)/);
});

test('native app uses ASWebAuthenticationSession bridge contract and completes with the retained one-time state', () => {
  assert.equal(mobilePackage.dependencies['expo-web-browser'], '~57.0.2');
  assert.match(mobile, /WebBrowser\.openAuthSessionAsync\(started\.url, started\.return_url\)/);
  assert.match(mobile, /returned\.searchParams\.get\('status'\) !== 'captured'/);
  assert.match(mobile, /completeWhatsAppConnect\(accessToken, started\.state\)/);
  assert.doesNotMatch(mobile, /searchParams\.get\(['"]code['"]\).*completeWhatsAppConnect/s);
  assert.match(api, /\/api\/mobile\/whatsapp-connect\/start/);
  assert.match(api, /\/api\/mobile\/whatsapp-connect\/complete/);
});

test('completion re-verifies current owner identity before consuming captured Meta code', () => {
  assert.match(complete, /readMobileConnectSession\(state, \['captured'\]\)/);
  assert.match(complete, /ownerContext\(req, pending\.business_id\)/);
  assert.match(complete, /owner\.user\.id[\s\S]*pending\.user_id/);
  assert.match(complete, /beginMobileConnectCompletion/);
  assert.match(complete, /finishMobileConnectSession\(reserved\.row\.state_hash, 'consumed'\)/);
  assert.match(complete, /finishMobileConnectSession\(reserved\.row\.state_hash, 'failed'/);
});
