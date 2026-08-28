import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const releaseMode = String(process.env.DABBIR_GOOGLE_PLAY_RELEASE_PREFLIGHT || '').trim() === '1';
const reportPath = String(process.env.DABBIR_GOOGLE_PLAY_PREFLIGHT_REPORT_PATH || '').trim();
const failures = [];
const external = [];
const passes = [];

const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
function requireStatic(condition, code, detail) {
  if (condition) passes.push({ code, detail });
  else failures.push({ code, detail });
}
function requireRelease(condition, code, detail) {
  if (condition) passes.push({ code, detail });
  else if (releaseMode) failures.push({ code, detail });
  else external.push({ code, detail });
}
function httpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return null;
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null;
    return url;
  } catch { return null; }
}
function isProtectedPrelaunchHost(url) {
  if (!url) return false;
  return /-3619s-projects\.vercel\.app$/i.test(url.hostname) || /-nd56cm4j5v-/i.test(url.hostname);
}
function routeDestination(vercelConfig, source) {
  const route = (vercelConfig.routes || []).find(item => item?.src === source);
  return route?.dest || null;
}

const appConfig = read('mobile/app.config.ts');
const eas = JSON.parse(read('mobile/eas.json'));
const mobilePackage = JSON.parse(read('mobile/package.json'));
const app = read('mobile/App.tsx');
const subscription = read('mobile/src/SubscriptionCard.tsx');
const mobileApi = read('mobile/src/api.ts');
const verifyEndpoint = read('api/mobile/iap/verify.js');
const statusEndpoint = read('api/mobile/iap/status.js');
const googleCore = read('api/_google-play-iap-core.js');
const accountDelete = read('api/mobile/account-delete.js');
const googleMigration = read('supabase/migrations/20260829152000_dabbir_google_entitlements_v1.sql');
const deletePage = read('delete-account.html');
const privacyPage = read('privacy.html');
const vercelConfig = JSON.parse(read('vercel.json'));
const dataSafety = JSON.parse(read('compliance/google-play-data-safety-candidate.json'));

requireStatic(/name:\s*['"]DABBIR \| دبّر['"]/.test(appConfig), 'APP_NAME_LOCKED', 'Native app name is DABBIR | دبّر.');
requireStatic(/android:\s*\{[\s\S]*package:\s*androidPackage/.test(appConfig) && /com\.barmansystems\.dabbir/.test(appConfig), 'ANDROID_PACKAGE_LOCKED', 'Canonical Android package is com.barmansystems.dabbir.');
requireStatic(/compileSdkVersion:\s*36/.test(appConfig), 'ANDROID_COMPILE_SDK_36', 'Android compile SDK is 36.');
requireStatic(/targetSdkVersion:\s*36/.test(appConfig), 'ANDROID_TARGET_SDK_36', 'Android target SDK is 36 for the 31 Aug 2026 Play requirement.');
requireStatic(/usesCleartextTraffic:\s*false/.test(appConfig), 'ANDROID_CLEARTEXT_DISABLED', 'Android cleartext traffic is disabled.');
requireStatic(eas?.build?.production?.android?.buildType === 'app-bundle', 'PLAY_AAB_PRODUCTION', 'EAS production Android build emits an AAB.');
requireStatic(eas?.build?.production?.autoIncrement === true && eas?.cli?.appVersionSource === 'remote', 'PLAY_VERSION_CODE_REMOTE', 'Production version codes are remotely managed and auto-incremented.');
requireStatic(eas?.submit?.production?.android?.track === 'internal', 'PLAY_INTERNAL_TRACK', 'Initial automated Google Play submission targets Internal testing.');
requireStatic(eas?.submit?.production?.android?.releaseStatus === 'completed', 'PLAY_INTERNAL_RELEASE_COMPLETED', 'Internal testing release is made available to configured testers after submission.');
requireStatic(Boolean(mobilePackage?.scripts?.['build:android']) && Boolean(mobilePackage?.scripts?.['submit:android']), 'ANDROID_RELEASE_SCRIPTS', 'Android build and submit scripts exist.');
requireStatic(/deleteDabbirAccount/.test(app) && /api\.deleteDabbirAccount/.test(app) && /dabbir_delete_current_user_account/.test(accountDelete), 'ACCOUNT_DELETION_IN_APP', 'Account deletion can be initiated from inside the app.');
requireStatic(/\/api\/mobile\/auth\/login/.test(deletePage) && /\/api\/mobile\/account-delete/.test(deletePage) && /DELETE_DABBIR_ACCOUNT/.test(deletePage), 'ACCOUNT_DELETION_EXTERNAL_FUNCTIONAL', 'External deletion page authenticates the user and invokes the real DABBIR deletion endpoint.');
requireStatic(routeDestination(vercelConfig, '^/delete-account/?$') === '/delete-account.html', 'ACCOUNT_DELETION_EXTERNAL_ROUTE', 'Stable /delete-account route exists for Play Console.');
requireStatic(/verifyStorePurchase/.test(subscription) && /storePlatform/.test(subscription) && /google:\s*\{/.test(subscription), 'GOOGLE_PLAY_BILLING_CLIENT', 'Android subscription purchase uses the Google Play path in expo-iap.');
requireStatic(/subscriptionOffers/.test(subscription) && /subscriptionOfferDetailsAndroid/.test(subscription), 'GOOGLE_PLAY_SUBSCRIPTION_OFFER_TOKEN', 'Android subscriptions use Google Play offer tokens.');
requireStatic(/obfuscatedAccountId:\s*accountToken/.test(subscription), 'GOOGLE_PLAY_ACCOUNT_ID_ATTACHED', 'Google Play purchase is bound to the opaque DABBIR account UUID.');
requireStatic(/verifyGoogleSubscription/.test(verifyEndpoint) && /GOOGLE_PLAY_DEVELOPER_API/.test(verifyEndpoint), 'GOOGLE_PLAY_SERVER_VERIFY_ENDPOINT', 'Purchase endpoint verifies Android subscriptions server-side.');
requireStatic(/purchases\/subscriptionsv2\/tokens/.test(googleCore) && /androidpublisher/.test(googleCore), 'GOOGLE_PLAY_PUBLISHER_API_V2', 'Server verification uses Google Play Developer API subscriptionsv2.');
requireStatic(/obfuscatedExternalAccountId/.test(googleCore) && /GOOGLE_PLAY_ACCOUNT_MISMATCH/.test(googleCore), 'GOOGLE_PLAY_SERVER_ACCOUNT_BINDING', 'Verified Play purchase must match the authenticated DABBIR user.');
requireStatic(/persistGoogleEntitlement/.test(googleCore) && /loadGoogleEntitlement/.test(statusEndpoint), 'GOOGLE_PLAY_ENTITLEMENT_PERSISTENCE', 'Verified Google entitlement is persisted and refreshed server-side.');
requireStatic(/force row level security/i.test(googleMigration) && /revoke all on public\.dabbir_google_entitlements from anon, authenticated/i.test(googleMigration), 'GOOGLE_PLAY_TOKEN_SERVER_ONLY', 'Google purchase tokens are inaccessible to app/client database roles.');
requireStatic(/finishTransaction/.test(subscription) && /result\?\.verified !== true \|\| result\?\.entitled !== true/.test(subscription), 'NO_UNVERIFIED_GOOGLE_ENTITLEMENT', 'The client grants/finishes only after server verification confirms entitlement.');
requireStatic(!/stripe|checkout|payment[_ -]?link|buy on web|subscribe on web/i.test(subscription), 'NO_EXTERNAL_DIGITAL_PAYMENT_CTA', 'Subscription UI has no prohibited external digital-payment CTA.');
requireStatic(mobileApi.includes('DABBIR_API_BASE_URL_NOT_CONFIGURED') && mobileApi.includes('https:'), 'HTTPS_API_FAIL_CLOSED', 'Native API requires an explicit HTTPS base URL.');
requireStatic(!/\bWebView\b|react-native-webview/.test(app), 'NATIVE_NOT_WEBVIEW', 'DABBIR Android is not a repackaged web wrapper.');
requireStatic(/DABBIR \| دبّر/.test(privacyPage) && /lang=["']en["']/.test(privacyPage), 'PLAY_PRIVACY_POLICY_SOURCE', 'Public privacy page source is bilingual and DABBIR-specific.');
requireStatic(dataSafety?.package_name === 'com.barmansystems.dabbir' && dataSafety?.play_console_form_submission_required === true, 'DATA_SAFETY_INVENTORY', 'Code-derived Data Safety declaration candidate is tracked for final Play Console reconciliation.');

const packageEnv = String(process.env.DABBIR_ANDROID_PACKAGE || '').trim();
const serverProductId = String(process.env.DABBIR_ANDROID_SUBSCRIPTION_PRODUCT_ID || '').trim();
const clientProductId = String(process.env.EXPO_PUBLIC_ANDROID_SUBSCRIPTION_PRODUCT_ID || '').trim();
const iapEnabled = String(process.env.EXPO_PUBLIC_ANDROID_IAP_ENABLED || '').trim();
const apiUrl = httpsUrl(process.env.EXPO_PUBLIC_DABBIR_API_BASE_URL);
const privacyUrl = httpsUrl(process.env.EXPO_PUBLIC_DABBIR_PRIVACY_URL);
const termsUrl = httpsUrl(process.env.EXPO_PUBLIC_DABBIR_TERMS_URL);
const supportUrl = httpsUrl(process.env.EXPO_PUBLIC_DABBIR_SUPPORT_URL);
const deleteUrl = httpsUrl(process.env.EXPO_PUBLIC_DABBIR_DELETE_ACCOUNT_URL);

requireRelease(packageEnv === 'com.barmansystems.dabbir', 'PLAY_PACKAGE_RELEASE_VALUE', 'Release package must be com.barmansystems.dabbir.');
requireRelease(serverProductId === 'com.barmansystems.dabbir.owner.subscription' && clientProductId === serverProductId, 'PLAY_SUBSCRIPTION_PRODUCT_MATCH', 'Client/server Google Play subscription IDs must match the canonical product.');
requireRelease(iapEnabled === 'true', 'PLAY_BILLING_ENABLED_RELEASE', 'Production Android build must enable Google Play Billing.');
requireRelease(Boolean(apiUrl) && !isProtectedPrelaunchHost(apiUrl), 'PUBLIC_PRODUCTION_API', 'Android API URL must be public HTTPS, not a protected preview hostname.');
requireRelease(Boolean(privacyUrl) && !isProtectedPrelaunchHost(privacyUrl) && /^\/privacy\/?$/i.test(privacyUrl.pathname), 'PUBLIC_PRIVACY_URL', 'Privacy URL must be public HTTPS /privacy.');
requireRelease(Boolean(termsUrl) && !isProtectedPrelaunchHost(termsUrl) && /^\/terms\/?$/i.test(termsUrl.pathname), 'PUBLIC_TERMS_URL', 'Terms URL must be public HTTPS /terms.');
requireRelease(Boolean(supportUrl) && !isProtectedPrelaunchHost(supportUrl) && /^\/support\/?$/i.test(supportUrl.pathname), 'PUBLIC_SUPPORT_URL', 'Support URL must be public HTTPS /support.');
requireRelease(Boolean(deleteUrl) && !isProtectedPrelaunchHost(deleteUrl) && /^\/delete-account\/?$/i.test(deleteUrl.pathname), 'PUBLIC_ACCOUNT_DELETION_URL', 'Google Play account deletion URL must be public HTTPS /delete-account.');

const releaseExternalVerification = releaseMode && failures.length === 0 ? [
  { code: 'GOOGLE_PLAY_CONSOLE_APP_RECORD', detail: 'Verify/create the real Play Console app record for com.barmansystems.dabbir.' },
  { code: 'GOOGLE_PLAY_SERVICE_ACCOUNT', detail: 'Verify EAS Submit and the backend have appropriately scoped Google Play service-account credentials.' },
  { code: 'GOOGLE_PLAY_SUBSCRIPTION_PRODUCT', detail: 'Verify the canonical subscription and active base plan/offer in Play Console.' },
  { code: 'DATA_SAFETY_FINAL_FORM', detail: 'Reconcile the final AAB/SDK behavior and submit the Data Safety form in Play Console.' },
  { code: 'PLAY_APP_CONTENT_FORMS', detail: 'Complete App access, Ads, Content rating, Target audience/content, and other applicable App content forms.' },
  { code: 'PUBLIC_RELEASE_URL_LIVE_VERIFICATION', detail: 'Verify API, Privacy, Terms, Support, and Delete Account URLs from the final public hostname.' },
  { code: 'SIGNED_AAB_INTERNAL_TEST_VERIFICATION', detail: 'Produce the exact signed AAB and confirm successful Internal testing ingestion in Google Play.' },
] : [];

const releaseConfigOnly = releaseMode && failures.length === 0 && releaseExternalVerification.length > 0;
const report = {
  ok: failures.length === 0 && !releaseConfigOnly,
  mode: releaseMode ? 'RELEASE' : 'STATIC',
  verdict: failures.length
    ? 'FAIL'
    : releaseConfigOnly
      ? 'RELEASE_CONFIG_PASS_EXTERNAL_VERIFICATION_REQUIRED'
      : (external.length ? 'INTERNAL_PASS_EXTERNAL_BLOCKED' : 'PASS'),
  passes: passes.map(item => item.code),
  failures,
  external_blockers: [...external, ...releaseExternalVerification],
  release_config_only: releaseConfigOnly,
  google_play_ready: false,
  target_sdk_required: 36,
  final_aab_data_safety_reconciliation: 'REQUIRED_BEFORE_PRODUCTION',
  signed_aab_internal_testing: 'EXTERNAL_GOOGLE_GATE',
};

const json = JSON.stringify(report, null, 2);
if (reportPath) fs.writeFileSync(path.resolve(ROOT, reportPath), `${json}\n`);
console.log(json);
if (failures.length) process.exit(2);
if (releaseConfigOnly) process.exit(3);
