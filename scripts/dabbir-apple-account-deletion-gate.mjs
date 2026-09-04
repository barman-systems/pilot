import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const releaseMode = String(process.env.DABBIR_APP_STORE_RELEASE_PREFLIGHT || '').trim() === '1';
const failures = [];
const passes = [];
const external = [];

const requireStatic = (condition, code, detail) => {
  if (condition) passes.push({ code, detail });
  else failures.push({ code, detail });
};
const requireRelease = (condition, code, detail) => {
  if (condition) passes.push({ code, detail });
  else if (releaseMode) failures.push({ code, detail });
  else external.push({ code, detail });
};

const accountDelete = read('api/mobile/account-delete.js');
const appleSignIn = read('api/_apple-signin-core.js');
const mobileApi = read('mobile/src/api.ts');
const subscription = read('mobile/src/SubscriptionCard.tsx');
const migration = read('supabase/migrations/20260905011500_dabbir_account_deletion_apple_revoke_preflight_v1.sql');

requireStatic(
  accountDelete.includes('dabbir_delete_current_user_account_preflight')
    && accountDelete.includes('revokeAppleAuthorizationForDeletion')
    && accountDelete.indexOf('dabbir_delete_current_user_account_preflight') < accountDelete.indexOf('revokeAppleAuthorizationForDeletion')
    && accountDelete.indexOf('revokeAppleAuthorizationForDeletion') < accountDelete.lastIndexOf("supabaseRpc('dabbir_delete_current_user_account'"),
  'APPLE_DELETE_ORDER',
  'Deletion runs DABBIR blocker preflight, then Apple token revocation, then destructive DABBIR deletion.',
);
requireStatic(
  appleSignIn.includes('https://appleid.apple.com/auth/token')
    && appleSignIn.includes('https://appleid.apple.com/auth/revoke')
    && appleSignIn.includes("alg: 'ES256'")
    && appleSignIn.includes("token_type_hint: 'refresh_token'"),
  'APPLE_REST_REVOCATION',
  'Server exchanges the fresh Apple authorization code and revokes the returned refresh token using Apple REST APIs.',
);
requireStatic(
  mobileApi.includes('APPLE_REAUTH_REQUIRED')
    && mobileApi.includes('AppleAuthentication.signInAsync')
    && mobileApi.includes('credential.authorizationCode')
    && mobileApi.includes('apple_authorization_code'),
  'APPLE_DELETE_REAUTH',
  'Apple-linked deletion reauthenticates in the native app and sends only the one-time authorization code to the server.',
);
requireStatic(
  subscription.includes('https://apps.apple.com/account/subscriptions')
    && subscription.includes('حذف حساب دبّر لا يلغي اشتراك App Store تلقائيًا'),
  'APPLE_SUBSCRIPTION_DELETE_GUIDANCE',
  'Auto-renewable subscription users are warned and given Apple subscription management before deletion.',
);
requireStatic(
  migration.includes('ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD')
    && migration.includes('PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF')
    && migration.includes('revoke all on function public.dabbir_delete_current_user_account_preflight(text) from public, anon'),
  'DELETE_PREFLIGHT_ACL',
  'Read-only deletion preflight handles legal/admin blockers and is not callable by anonymous users.',
);

const teamId = String(process.env.DABBIR_APPLE_SIGN_IN_TEAM_ID || '').trim();
const keyId = String(process.env.DABBIR_APPLE_SIGN_IN_KEY_ID || '').trim();
const privateKey = String(process.env.DABBIR_APPLE_SIGN_IN_PRIVATE_KEY_BASE64 || process.env.DABBIR_APPLE_SIGN_IN_PRIVATE_KEY || '').trim();
const bundleId = String(process.env.DABBIR_IOS_BUNDLE_ID || '').trim();

requireRelease(/^[A-Za-z0-9]{5,64}$/.test(teamId), 'APPLE_SIGN_IN_TEAM_ID', 'Apple Developer Team ID is configured server-side.');
requireRelease(/^[A-Za-z0-9]{5,64}$/.test(keyId), 'APPLE_SIGN_IN_KEY_ID', 'Sign in with Apple private-key ID is configured server-side.');
requireRelease(privateKey.length >= 64, 'APPLE_SIGN_IN_PRIVATE_KEY', 'Sign in with Apple private key is configured server-side and never shipped to the client.');
requireRelease(bundleId === 'com.barmansystems.dabbir', 'APPLE_SIGN_IN_CLIENT_ID', 'Native Sign in with Apple client ID is the DABBIR bundle identifier.');

if (releaseMode && failures.length === 0) {
  external.push({
    code: 'APPLE_DELETE_LIVE_REVOKE_PROOF',
    detail: 'Run a TestFlight/Sandbox Apple-linked account deletion and prove /auth/token + /auth/revoke succeed before App Store submission.',
  });
}

const report = {
  ok: failures.length === 0 && (!releaseMode || external.length === 0),
  mode: releaseMode ? 'RELEASE' : 'STATIC',
  verdict: failures.length ? 'FAIL' : (external.length ? 'PASS_WITH_EXTERNAL_GATE' : 'PASS'),
  passes: passes.map(item => item.code),
  failures,
  external_blockers: external,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(2);
if (releaseMode && external.length) process.exit(3);
