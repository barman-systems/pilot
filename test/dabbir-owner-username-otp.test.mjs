import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner authentication is username + brokered Resend OTP and fail-closed to the canonical owner UUID', async () => {
  const source = await read('api/auth/owner-otp.js');
  assert.match(source, /OWNER_USERNAME\s*=\s*'barmanadmin'/);
  assert.match(source, /OWNER_USER_ID/);
  assert.match(source, /f1c5e98b-4060-43cb-a09b-a67a67028800/);
  assert.match(source, /requireSameOrigin\(req\)/);
  assert.match(source, /RESEND_API_KEY/);
  assert.match(source, /bm-secret-broker/);
  assert.match(source, /owner_otp_request/);
  assert.match(source, /owner_otp_verify/);
  assert.match(source, /challenge_id/);
  assert.match(source, /authCookieHeaders\(session\)/);
  assert.match(source, /String\(session\?\.user\?\.id \|\| ''\) !== OWNER_USER_ID/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /grant_type=password/);
});

test('owner login UI never asks for email or password', async () => {
  const source = await read('api/owner-login.js');
  assert.match(source, /value="barmanadmin"/);
  assert.match(source, /autocomplete="username"/);
  assert.match(source, /autocomplete="one-time-code"/);
  assert.match(source, /inputmode="numeric"/);
  assert.match(source, /\/api\/auth\/owner-otp/);
  assert.match(source, /location\.replace\('\/owner-dashboard'\)/);
  assert.doesNotMatch(source, /type="email"/);
  assert.doesNotMatch(source, /type="password"/);
  assert.doesNotMatch(source, /\/api\/auth\/login/);
});

test('canonical owner routes use the OTP gate and authenticated dashboard gateway', async () => {
  const source = await read('vercel.json');
  const config = JSON.parse(source);
  const ownerRoute = config.routes.find(route => route.src === '^/owner/?$');
  const dashboardRoute = config.routes.find(route => route.src === '^/owner-dashboard/?$');
  assert.equal(ownerRoute?.dest, '/api/owner-login');
  assert.equal(dashboardRoute?.dest, '/api/owner-dashboard-gateway');
});

test('dashboard gateway requires exact owner identity and active platform_owner', async () => {
  const source = await read('api/owner-dashboard-gateway.js');
  assert.match(source, /getVerifiedUser\(accessToken\)/);
  assert.match(source, /String\(user\.id\) !== OWNER_USER_ID/);
  assert.match(source, /dabbir_platform_admins/);
  assert.match(source, /active=eq\.true/);
  assert.match(source, /row\?\.role === 'platform_owner'/);
  assert.match(source, /clearAuthCookieHeaders/);
});

test('ordinary DABBIR customer login remains email/password and is not replaced by owner OTP', async () => {
  const source = await read('api/auth/login.js');
  assert.match(source, /grant_type=password/);
  assert.match(source, /body\.email/);
  assert.match(source, /body\.password/);
});
