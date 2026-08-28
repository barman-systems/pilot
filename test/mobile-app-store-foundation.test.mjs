import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('DABBIR iOS is native and not a WebView wrapper', async () => {
  const app = await read('mobile/App.tsx');
  const pkg = await read('mobile/package.json');
  assert.match(pkg, /"react-native"/);
  assert.doesNotMatch(app, /\bWebView\b|react-native-webview/);
});

test('mobile bearer bridge fails closed without Authorization bearer token', async () => {
  const source = await read('api/mobile/_native-core.js');
  assert.match(source, /Bearer\\s\+/);
  assert.match(source, /AUTH_REQUIRED/);
  assert.match(source, /injectNativeBearerSession/);
});

test('Apple server verifier module loads with the locked official library', async () => {
  const module = await import('../api/_apple-iap-core.js');
  assert.equal(typeof module.verifyAppleTransaction, 'function');
  assert.equal(typeof module.persistAppleEntitlement, 'function');
  assert.equal(typeof module.verifyAppleNotification, 'function');
});

test('Apple IAP requires Apple JWS verification, account binding, server persistence, and verified notifications', async () => {
  const client = await read('mobile/src/SubscriptionCard.tsx');
  const server = await read('api/mobile/iap/verify.js');
  const notification = await read('api/apple/app-store-notifications.js');
  const core = await read('api/_apple-iap-core.js');
  const entitlement = await read('supabase/migrations/20260828091500_dabbir_apple_entitlements_v1.sql');

  assert.match(client, /verified !== true \|\| result\?\.entitled !== true/);
  assert.match(client, /appAccountToken: accountToken/);
  assert.match(client, /finishTransaction/);
  assert.match(server, /verifyAppleTransaction/);
  assert.match(server, /persistAppleEntitlement/);
  assert.match(server, /APPLE_SIGNED_TRANSACTION_JWS/);
  assert.doesNotMatch(server, /IMPLEMENTATION_REQUIRED|verified:\s*true[^]*without/i);
  assert.match(notification, /verifyAppleNotification/);
  assert.match(notification, /signedPayload/);
  assert.match(notification, /persistAppleEntitlement/);
  assert.match(core, /SignedDataVerifier/);
  assert.match(core, /verifyAndDecodeTransaction/);
  assert.match(core, /verifyAndDecodeNotification/);
  assert.match(core, /APPLE_ROOT_CERTIFICATES_BASE64/);
  assert.match(core, /appAccountToken\.toLowerCase\(\) !== userId\.toLowerCase\(\)/);
  assert.match(core, /DABBIR_IOS_SUBSCRIPTION_PRODUCT_ID/);
  assert.match(core, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(entitlement, /force row level security/i);
  assert.match(entitlement, /app_account_token = user_id/);
  assert.match(entitlement, /grant select on public\.dabbir_apple_entitlements to authenticated/i);
  assert.doesNotMatch(entitlement, /grant\s+(insert|update|delete)/i);
});

test('DABBIR account deletion is product-scoped, de-identifying, access revoking, and public invoker only', async () => {
  const migration = await read('supabase/migrations/20260828092000_dabbir_product_scoped_account_deletion_v1.sql');
  const appleCleanup = await read('supabase/migrations/20260828092100_dabbir_account_deletion_apple_cleanup_v1.sql');
  const identityCleanup = await read('supabase/migrations/20260828095100_dabbir_account_deletion_identity_cleanup_v2.sql');
  const hardening = await read('supabase/migrations/20260828095200_dabbir_account_delete_private_executor_v2.sql');
  const endpoint = await read('api/mobile/account-delete.js');
  const mobileLogin = await read('api/mobile/auth/login.js');
  const mobileRefresh = await read('api/mobile/auth/refresh.js');
  const mobileRuntime = await read('api/mobile/runtime.js');
  const webLogin = await read('api/auth/login.js');

  assert.match(migration, /DABBIR_PRODUCT_ACCOUNT/);
  assert.match(migration, /ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD/);
  assert.match(migration, /status in \('active','suspended','deleted'\)/);
  assert.match(migration, /status='deleted'/);
  assert.match(migration, /s\.status in \('suspended','deleted'\)/);
  assert.match(migration, /delete from public\.dabbir_businesses/i);
  assert.match(migration, /delete from public\.dabbir_user_accounts/i);
  assert.doesNotMatch(migration, /delete\s+from\s+auth\.users/i);
  assert.match(appleCleanup, /delete from public\.dabbir_apple_entitlements/i);
  assert.match(appleCleanup, /after insert or update of status/i);
  assert.match(identityCleanup, /alter column owner_user_id drop not null/i);
  assert.match(identityCleanup, /on delete set null/i);
  assert.match(identityCleanup, /set owner_user_id = null/i);
  assert.match(identityCleanup, /dabbir_account_delete_identity_cleanup/);
  assert.match(hardening, /dabbir_private\.dabbir_delete_current_user_account_impl/);
  assert.match(hardening, /create or replace function public\.dabbir_delete_current_user_account/);
  assert.match(hardening, /security invoker/i);
  assert.doesNotMatch(hardening, /create or replace function public\.dabbir_delete_current_user_account[^]*security definer/i);
  assert.match(endpoint, /dabbir_delete_current_user_account/);
  assert.match(endpoint, /product: null/);
  assert.match(mobileLogin, /getVerifiedUser/);
  assert.match(mobileRefresh, /getVerifiedUser/);
  assert.match(mobileRuntime, /getVerifiedUser/);
  assert.match(webLogin, /getVerifiedUser/);
  assert.match(mobileLogin, /DABBIR_ACCOUNT_UNAVAILABLE/);
  assert.match(mobileRefresh, /DABBIR_ACCOUNT_UNAVAILABLE/);
});
