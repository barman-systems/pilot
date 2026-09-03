import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('platform authentication is actor-bound brokered Resend OTP with isolated sessions', async () => {
  const source = await read('api/auth/owner-otp.js');
  assert.match(source, /ROOT_USERNAME\s*=\s*'barmanadmin'/);
  assert.match(source, /EMAIL_RE/);
  assert.match(source, /requireSameOrigin\(req\)/);
  assert.match(source, /RESEND_API_KEY/);
  assert.match(source, /dabbir-owner-broker/);
  assert.match(source, /owner_otp_request/);
  assert.match(source, /owner_otp_verify/);
  assert.match(source, /challenge_id/);
  assert.match(source, /session_token/);
  assert.match(source, /__Host-dabbir_owner_session/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /grant_type=password/);
  assert.doesNotMatch(source, /barman2013@icloud\.com/);
});

test('owner broker supports modern Supabase secret keys and actor-aware incidents', async () => {
  const source = await read('supabase/functions/dabbir-owner-broker/index.ts');
  assert.match(source, /serviceKeyIsJwt=\(\)=>SERVICE_KEY\.split\('\.'\)\.length===3/);
  assert.match(source, /'apikey':SERVICE_KEY/);
  assert.match(source, /if\(serviceKeyIsJwt\(\)\)h\.authorization=`Bearer \$\{SERVICE_KEY\}`/);
  assert.match(source, /if\(action==='incidents'\)return incidentRead\(session,body\)/);
  assert.match(source, /if\(action==='incident_action'\)return incidentAction\(session,body\)/);
  assert.doesNotMatch(source, /function activeAdmin/);
});

test('owner login UI remains OTP-only and accepts the root username or an employee email string', async () => {
  const source = await read('api/owner-login.js');
  assert.match(source, /value="barmanadmin"/);
  assert.match(source, /autocomplete="username"/);
  assert.match(source, /autocomplete="one-time-code"/);
  assert.match(source, /inputmode="numeric"/);
  assert.match(source, /\/api\/auth\/owner-otp/);
  assert.match(source, /location\.replace\('\/owner-dashboard'\)/);
  assert.doesNotMatch(source, /type="password"/);
  assert.doesNotMatch(source, /\/api\/auth\/login/);
});

test('owner login is readable and iPhone-safe without changing the OTP flow', async () => {
  const source = await read('api/owner-login.js');
  assert.match(source, /html,body\{[^}]*font-size:16px/);
  assert.match(source, /p\{font-size:14px/);
  assert.match(source, /\.field label\{[^}]*font-size:13px/);
  assert.match(source, /\.field input\{[^}]*font-size:16px/);
  assert.match(source, /\.msg\{[^}]*font-size:13px/);
  assert.match(source, /min-height:100dvh/);
  assert.match(source, /safe-area-inset-top/);
  assert.match(source, /@media\(max-width:430px\)/);
  assert.match(source, /prefers-reduced-motion:reduce/);
  assert.match(source, /button:focus-visible,input:focus-visible/);
});

test('canonical owner routes use the OTP gate and authenticated dashboard gateway', async () => {
  const source = await read('vercel.json');
  const config = JSON.parse(source);
  const ownerRoute = config.routes.find(route => route.src === '^/owner/?$');
  const dashboardRoute = config.routes.find(route => route.src === '^/owner-dashboard/?$');
  assert.equal(ownerRoute?.dest, '/api/owner-login');
  assert.equal(dashboardRoute?.dest, '/api/owner-dashboard-gateway');
});

test('dashboard gateway validates actual authority role fail-closed through the broker', async () => {
  const source = await read('api/owner-dashboard-gateway.js');
  assert.match(source, /dabbir-owner-broker/);
  assert.match(source, /__Host-dabbir_owner_session/);
  assert.match(source, /owner_session_verify/);
  assert.match(source, /payload\?\.authenticated === true/);
  assert.match(source, /ROOT_OWNER/);
  assert.match(source, /OWNER_DELEGATE/);
  assert.match(source, /redirectToOwner\(res, true\)/);
  assert.doesNotMatch(source, /getVerifiedUser\(accessToken\)/);
});

test('ordinary DABBIR customer login remains email/password and is not replaced by platform OTP', async () => {
  const source = await read('api/auth/login.js');
  assert.match(source, /grant_type=password/);
  assert.match(source, /body\.email/);
  assert.match(source, /body\.password/);
});
