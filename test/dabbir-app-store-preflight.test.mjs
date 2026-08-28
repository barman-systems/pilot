import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(ROOT, relative), 'utf8');

function runPreflight(extraEnv = {}) {
  const clean = {
    ...process.env,
    DABBIR_APP_STORE_RELEASE_PREFLIGHT: '',
    DABBIR_IOS_BUNDLE_ID: '',
    DABBIR_IOS_APP_APPLE_ID: '',
    DABBIR_IOS_SUBSCRIPTION_PRODUCT_ID: '',
    EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID: '',
    EXPO_PUBLIC_IOS_IAP_ENABLED: '',
    EXPO_PUBLIC_DABBIR_API_BASE_URL: '',
    EXPO_PUBLIC_DABBIR_PRIVACY_URL: '',
    EXPO_PUBLIC_DABBIR_TERMS_URL: '',
    EXPO_PUBLIC_DABBIR_SUPPORT_URL: '',
    APPLE_ROOT_CERTIFICATES_BASE64: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    ...extraEnv,
  };
  return spawnSync(process.execPath, ['scripts/dabbir-app-store-preflight.mjs'], {
    cwd: ROOT,
    env: clean,
    encoding: 'utf8',
  });
}

test('static App Store preflight passes internal invariants while reporting external Apple blockers', () => {
  const result = runPreflight();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.mode, 'STATIC');
  assert.equal(report.verdict, 'INTERNAL_PASS_EXTERNAL_BLOCKED');
  assert.ok(report.passes.includes('NATIVE_NOT_WEBVIEW'));
  assert.ok(report.passes.includes('NO_UNVERIFIED_ENTITLEMENT'));
  assert.ok(report.passes.includes('SUBSCRIPTION_LEGAL_LINKS'));
  assert.ok(report.passes.includes('STOREKIT_INTRO_OFFER_DISCLOSURE'));
  assert.ok(report.external_blockers.some(item => item.code === 'APP_STORE_APPLE_ID'));
  assert.ok(report.external_blockers.some(item => item.code === 'PUBLIC_PRODUCTION_API'));
  assert.equal(report.signed_distribution_testflight, 'EXTERNAL_APPLE_GATE');
});

test('release App Store preflight fails closed when Apple/public release configuration is absent', () => {
  const result = runPreflight({ DABBIR_APP_STORE_RELEASE_PREFLIGHT: '1' });
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.mode, 'RELEASE');
  assert.equal(report.verdict, 'FAIL');
  const codes = new Set(report.failures.map(item => item.code));
  for (const required of ['APPLE_BUNDLE_REGISTERED_VALUE', 'APP_STORE_APPLE_ID', 'IAP_PRODUCT_MATCH', 'IAP_ENABLED_RELEASE', 'PUBLIC_PRODUCTION_API', 'PUBLIC_PRIVACY_URL', 'PUBLIC_TERMS_URL', 'PUBLIC_SUPPORT_URL', 'APPLE_ROOT_CERTIFICATES', 'IAP_SERVER_STORAGE_CREDENTIAL']) {
    assert.ok(codes.has(required), `missing fail-closed release blocker ${required}`);
  }
});

test('subscription UI discloses StoreKit-derived period/offer and legal links without external payment CTA', async () => {
  const source = await read('mobile/src/SubscriptionCard.tsx');
  assert.match(source, /subscriptionPeriodNumberIOS|subscriptionInfoIOS/);
  assert.match(source, /introductoryOffer/);
  assert.match(source, /free-trial/);
  assert.match(source, /EXPO_PUBLIC_DABBIR_PRIVACY_URL/);
  assert.match(source, /EXPO_PUBLIC_DABBIR_TERMS_URL/);
  assert.match(source, /Linking\.openURL/);
  assert.match(source, /verified !== true \|\| result\?\.entitled !== true/);
  assert.match(source, /finishTransaction/);
  assert.doesNotMatch(source, /stripe|checkout|buy on web|subscribe on web/i);
  assert.doesNotMatch(source, /7\s*(day|days|يوم|أيام)/i);
});

test('mobile CI permanently runs the static App Store preflight and watches its contract paths', async () => {
  const workflow = await read('.github/workflows/dabbir-mobile-ci.yml');
  assert.match(workflow, /scripts\/dabbir-app-store-preflight\.mjs/);
  assert.match(workflow, /test\/dabbir-app-store-preflight\.test\.mjs/);
  assert.match(workflow, /Run App Store static preflight/);
  assert.match(workflow, /node scripts\/dabbir-app-store-preflight\.mjs/);
});
