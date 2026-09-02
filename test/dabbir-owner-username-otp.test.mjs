import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner authentication is username + brokered Resend OTP with an isolated owner session', async () => {
  const source = await read('api/auth/owner-otp.js');
  assert.match(source, /OWNER_USERNAME\s*=\s*'barmanadmin'/);
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
});

test('owner broker accepts modern Supabase secret keys without pretending they are JWTs', async () => {
  const source = await read('supabase/functions/dabbir-owner-broker/index.ts');
  assert.match(source, /serviceKeyIsJwt=\(\)=>SERVICE_KEY\.split\('\.'\)\.length===3/);
  assert.match(source, /'apikey':SERVICE_KEY/);
  assert.match(source, /if\(serviceKeyIsJwt\(\)\)headers\.authorization=`Bearer \$\{SERVICE_KEY\}`/);
  assert.doesNotMatch(source, /sbHeaders=\(\)=>\(\{'apikey':SERVICE_KEY,'authorization':`Bearer \$\{SERVICE_KEY\}`/);
  assert.match(source, /if\(action==='incidents'\)return incidentRead\(body\)/);
  assert.match(source, /if\(action==='incident_action'\)return incidentAction\(body\)/);
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

test('dashboard gateway validates the owner session fail-closed through the DABBIR broker', async () => {
  const source = await read('api/owner-dashboard-gateway.js');
  assert.match(source, /dabbir-owner-broker/);
  assert.match(source, /__Host-dabbir_owner_session/);
  assert.match(source, /owner_session_verify/);
  assert.match(source, /payload\?\.authenticated === true/);
  assert.match(source, /payload\?\.role === 'platform_owner'/);
  assert.match(source, /redirectToOwner\(res, true\)/);
  assert.doesNotMatch(source, /getVerifiedUser\(accessToken\)/);
});

test('ordinary DABBIR customer login remains email/password and is not replaced by owner OTP', async () => {
  const source = await read('api/auth/login.js');
  assert.match(source, /grant_type=password/);
  assert.match(source, /body\.email/);
  assert.match(source, /body\.password/);
});
