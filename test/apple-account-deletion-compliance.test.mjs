import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

const accountDelete = read('api/mobile/account-delete.js');
const appleSignIn = read('api/_apple-signin-core.js');
const mobileApi = read('mobile/src/api.ts');
const subscription = read('mobile/src/SubscriptionCard.tsx');
const migration = read('supabase/migrations/20260905011500_dabbir_account_deletion_apple_revoke_preflight_v1.sql');

test('Apple-linked account deletion revokes Sign in with Apple before destructive DABBIR deletion', () => {
  assert.match(accountDelete, /dabbir_delete_current_user_account_preflight/);
  assert.match(accountDelete, /appleIdentitySubject/);
  assert.match(accountDelete, /revokeAppleAuthorizationForDeletion/);
  assert.match(accountDelete, /APPLE_REAUTH_REQUIRED/);
  assert.match(accountDelete, /dabbir_delete_current_user_account/);

  const preflight = accountDelete.indexOf("supabaseRpc('dabbir_delete_current_user_account_preflight'");
  const revoke = accountDelete.indexOf('await revokeAppleAuthorizationForDeletion(');
  const destructive = accountDelete.lastIndexOf("supabaseRpc('dabbir_delete_current_user_account'");
  assert.ok(preflight >= 0 && revoke > preflight && destructive > revoke, 'preflight -> Apple revoke -> DABBIR delete order must remain fail-closed');
});

test('Sign in with Apple server implementation uses Apple token and revocation endpoints with a signed client secret', () => {
  assert.match(appleSignIn, /https:\/\/appleid\.apple\.com\/auth\/token/);
  assert.match(appleSignIn, /https:\/\/appleid\.apple\.com\/auth\/revoke/);
  assert.match(appleSignIn, /alg:\s*'ES256'/);
  assert.match(appleSignIn, /DABBIR_APPLE_SIGN_IN_TEAM_ID/);
  assert.match(appleSignIn, /DABBIR_APPLE_SIGN_IN_KEY_ID/);
  assert.match(appleSignIn, /DABBIR_APPLE_SIGN_IN_PRIVATE_KEY/);
  assert.match(appleSignIn, /refresh_token/);
  assert.match(appleSignIn, /String\(identity\?\.sub \|\| ''\) !== expected/);
});

test('iOS deletion path reauthenticates with Apple only when backend requires it', () => {
  assert.match(mobileApi, /APPLE_REAUTH_REQUIRED/);
  assert.match(mobileApi, /AppleAuthentication\.signInAsync/);
  assert.match(mobileApi, /credential\.authorizationCode/);
  assert.match(mobileApi, /apple_authorization_code/);
});

test('auto-renewable subscription users get a direct Apple subscription-management path', () => {
  assert.match(subscription, /https:\/\/apps\.apple\.com\/account\/subscriptions/);
  assert.match(subscription, /حذف حساب دبّر لا يلغي اشتراك App Store تلقائيًا/);
  assert.match(subscription, /إدارة أو إلغاء اشتراك App Store/);
});

test('deletion preflight checks known legal and platform-admin blockers without mutating account data', () => {
  assert.match(migration, /ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD/);
  assert.match(migration, /PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF/);
  assert.match(migration, /DABBIR_ACCOUNT_ALREADY_DELETED/);
  assert.match(migration, /revoke all on function public\.dabbir_delete_current_user_account_preflight\(text\) from public, anon/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.dabbir_businesses/i);
});
