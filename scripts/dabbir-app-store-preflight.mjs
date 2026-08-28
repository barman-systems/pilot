import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const releaseMode = String(process.env.DABBIR_APP_STORE_RELEASE_PREFLIGHT || '').trim() === '1';
const reportPath = String(process.env.DABBIR_APP_STORE_PREFLIGHT_REPORT_PATH || '').trim();

const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const failures = [];
const external = [];
const passes = [];

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
  } catch {
    return null;
  }
}

function isProtectedPrelaunchHost(url) {
  if (!url) return false;
  return /-3619s-projects\.vercel\.app$/i.test(url.hostname) || /-nd56cm4j5v-/i.test(url.hostname);
}

const appConfig = read('mobile/app.config.ts');
const app = read('mobile/App.tsx');
const subscription = read('mobile/src/SubscriptionCard.tsx');
const mobileApi = read('mobile/src/api.ts');
const mobilePackage = read('mobile/package.json');
const appleCore = read('api/_apple-iap-core.js');
const appleVerify = read('api/mobile/iap/verify.js');
const appleNotifications = read('api/apple/app-store-notifications.js');
const accountDelete = read('api/mobile/account-delete.js');
const entitlementMigration = read('supabase/migrations/20260828091500_dabbir_apple_entitlements_v1.sql');

requireStatic(/name:\s*['"]DABBIR \| دبّر['"]/.test(appConfig), 'APP_NAME_LOCKED', 'Native app name is DABBIR | دبّر.');
requireStatic(/supportsTablet:\s*false/.test(appConfig), 'IPHONE_ONLY', 'iPad distribution is disabled for v1.');
requireStatic(/scheme:\s*['"]dabbir['"]/.test(appConfig), 'DEEPLINK_SCHEME', 'dabbir:// scheme exists.');
requireStatic(/version:\s*['"]1\.0\.0['"]/.test(appConfig), 'VERSION_1_0_0', 'Version 1.0.0 is explicit.');
requireStatic(/com\.barmansystems\.dabbir/.test(appConfig), 'BUNDLE_DEFAULT', 'Canonical bundle identifier default exists.');
requireStatic(/privacyManifests/.test(appConfig) && /NSPrivacyTracking:\s*false/.test(appConfig), 'PRIVACY_MANIFEST_BASE', 'Privacy manifest base exists and tracking is disabled.');
requireStatic(/"react-native"/.test(mobilePackage) && !/\bWebView\b|react-native-webview/.test(app), 'NATIVE_NOT_WEBVIEW', 'The iOS client is React Native and not a WebView wrapper.');
requireStatic(/deleteDabbirAccount/.test(app) && /api\.deleteDabbirAccount/.test(app) && /dabbir_delete_current_user_account/.test(accountDelete), 'IN_APP_ACCOUNT_DELETION', 'Product-scoped account deletion is reachable inside the app.');
requireStatic(/requestPasswordRecovery/.test(app) && /Forgot password|نسيت كلمة المرور/.test(app), 'PASSWORD_RECOVERY', 'Native password recovery is present.');
requireStatic(/SignedDataVerifier/.test(appleCore) && /verifyAndDecodeTransaction/.test(appleCore), 'APPLE_JWS_TRANSACTION_VERIFY', 'Apple transaction JWS is verified server-side.');
requireStatic(/verifyAndDecodeNotification/.test(appleCore) && /verifyAppleNotification/.test(appleNotifications), 'APPLE_SERVER_NOTIFICATIONS_VERIFY', 'App Store Server Notifications are verified server-side.');
requireStatic(/appAccountToken\.toLowerCase\(\) !== userId\.toLowerCase\(\)/.test(appleCore), 'APPLE_ACCOUNT_BINDING', 'Apple transactions are bound to the DABBIR user UUID.');
requireStatic(/persistAppleEntitlement/.test(appleVerify) && /persistAppleEntitlement/.test(appleNotifications), 'APPLE_ENTITLEMENT_PERSISTENCE', 'Verified purchase and notification paths persist entitlements.');
requireStatic(/force row level security/i.test(entitlementMigration), 'APPLE_ENTITLEMENT_RLS', 'Apple entitlement table is protected by forced RLS.');
requireStatic(/verified !== true \|\| result\?\.entitled !== true/.test(subscription) && /finishTransaction/.test(subscription), 'NO_UNVERIFIED_ENTITLEMENT', 'Client never finishes/grants a purchase before server entitlement verification.');
requireStatic(/restorePurchases/.test(subscription), 'RESTORE_PURCHASES', 'Restore Purchases is exposed.');
requireStatic(/EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID/.test(subscription), 'STOREKIT_PRODUCT_CONFIG', 'Client subscription product is configuration-driven.');
requireStatic(/subscriptionPeriodNumberIOS|subscriptionInfoIOS/.test(subscription), 'STOREKIT_PERIOD_DISCLOSURE', 'Subscription billing period is derived from StoreKit product data.');
requireStatic(/introductoryOffer|introOffer/.test(subscription) && /free-trial/.test(subscription), 'STOREKIT_INTRO_OFFER_DISCLOSURE', 'Introductory/free-trial text is derived from StoreKit offer metadata.');
requireStatic(/EXPO_PUBLIC_DABBIR_PRIVACY_URL/.test(subscription) && /EXPO_PUBLIC_DABBIR_TERMS_URL/.test(subscription), 'SUBSCRIPTION_LEGAL_LINKS', 'Subscription screen requires privacy and Terms links.');
requireStatic(!/stripe|checkout|payment[_ -]?link|buy on web|subscribe on web/i.test(subscription), 'NO_EXTERNAL_PAYMENT_CTA', 'The iOS subscription component contains no Stripe/external purchase CTA.');
requireStatic(mobileApi.includes('DABBIR_API_BASE_URL_NOT_CONFIGURED') && mobileApi.includes('configuredBase') && mobileApi.includes('https:'), 'HTTPS_API_FAIL_CLOSED', 'Native API requires an explicit HTTPS base URL.');

const bundleId = String(process.env.DABBIR_IOS_BUNDLE_ID || '').trim();
const appAppleId = String(process.env.DABBIR_IOS_APP_APPLE_ID || '').trim();
const serverProductId = String(process.env.DABBIR_IOS_SUBSCRIPTION_PRODUCT_ID || '').trim();
const clientProductId = String(process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID || '').trim();
const iapEnabled = String(process.env.EXPO_PUBLIC_IOS_IAP_ENABLED || '').trim();
const apiUrl = httpsUrl(process.env.EXPO_PUBLIC_DABBIR_API_BASE_URL);
const privacyUrl = httpsUrl(process.env.EXPO_PUBLIC_DABBIR_PRIVACY_URL);
const termsUrl = httpsUrl(process.env.EXPO_PUBLIC_DABBIR_TERMS_URL);
const supportUrl = httpsUrl(process.env.EXPO_PUBLIC_DABBIR_SUPPORT_URL);
const rootCerts = String(process.env.APPLE_ROOT_CERTIFICATES_BASE64 || '').trim();
const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

requireRelease(bundleId === 'com.barmansystems.dabbir', 'APPLE_BUNDLE_REGISTERED_VALUE', 'Release bundle ID must be com.barmansystems.dabbir.');
requireRelease(/^\d{5,20}$/.test(appAppleId), 'APP_STORE_APPLE_ID', 'App Store numeric Apple ID must be configured.');
requireRelease(serverProductId.length > 2 && clientProductId === serverProductId, 'IAP_PRODUCT_MATCH', 'Client and server must use the exact same App Store subscription product ID.');
requireRelease(iapEnabled === 'true', 'IAP_ENABLED_RELEASE', 'Production candidate must enable Apple IAP.');
requireRelease(Boolean(apiUrl) && !isProtectedPrelaunchHost(apiUrl), 'PUBLIC_PRODUCTION_API', 'Production iOS API base must be public HTTPS and not a protected/prelaunch Vercel host.');
requireRelease(Boolean(privacyUrl) && !isProtectedPrelaunchHost(privacyUrl), 'PUBLIC_PRIVACY_URL', 'Privacy Policy URL must be public HTTPS.');
requireRelease(Boolean(termsUrl) && !isProtectedPrelaunchHost(termsUrl), 'PUBLIC_TERMS_URL', 'Terms of Use URL must be public HTTPS.');
requireRelease(Boolean(supportUrl) && !isProtectedPrelaunchHost(supportUrl), 'PUBLIC_SUPPORT_URL', 'Support URL must be public HTTPS.');
requireRelease(rootCerts.split(',').map(v => v.trim()).filter(Boolean).length >= 2, 'APPLE_ROOT_CERTIFICATES', 'Apple root certificates must be configured server-side.');
requireRelease(Boolean(serviceRole) && !serviceRole.startsWith('sb_publishable_'), 'IAP_SERVER_STORAGE_CREDENTIAL', 'Server-side entitlement persistence credential must exist.');

const report = {
  ok: failures.length === 0,
  mode: releaseMode ? 'RELEASE' : 'STATIC',
  verdict: failures.length ? 'FAIL' : (external.length ? 'INTERNAL_PASS_EXTERNAL_BLOCKED' : 'PASS'),
  passes: passes.map(item => item.code),
  failures,
  external_blockers: external,
  privacy_manifest_final_binary_reconciliation: 'REQUIRED_BEFORE_SUBMISSION',
  signed_distribution_testflight: 'EXTERNAL_APPLE_GATE',
};

const json = JSON.stringify(report, null, 2);
if (reportPath) fs.writeFileSync(path.resolve(ROOT, reportPath), `${json}\n`);
console.log(json);
if (failures.length) process.exit(2);
