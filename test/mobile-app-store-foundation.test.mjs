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

test('Apple IAP cannot grant entitlement without server verification', async () => {
  const client = await read('mobile/src/SubscriptionCard.tsx');
  const server = await read('api/mobile/iap/verify.js');
  assert.match(client, /verified !== true/);
  assert.match(client, /finishTransaction/);
  assert.match(server, /APPLE_IAP_SERVER_VERIFICATION_NOT_CONFIGURED/);
  assert.match(server, /APPLE_IAP_SERVER_VERIFICATION_IMPLEMENTATION_REQUIRED/);
});

test('DABBIR account deletion is product-scoped and legal-hold aware', async () => {
  const migration = await read('supabase/migrations/20260828092000_dabbir_product_scoped_account_deletion_v1.sql');
  const endpoint = await read('api/mobile/account-delete.js');
  assert.match(migration, /DABBIR_PRODUCT_ACCOUNT/);
  assert.match(migration, /ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD/);
  assert.match(migration, /delete from public\.dabbir_businesses/i);
  assert.match(migration, /delete from public\.dabbir_user_accounts/i);
  assert.doesNotMatch(migration, /delete\s+from\s+auth\.users/i);
  assert.match(endpoint, /dabbir_delete_current_user_account/);
  assert.match(endpoint, /product: null/);
});
