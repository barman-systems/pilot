import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const authUi = await read('api/auth-session-stability-ui.js');
const appRecovery = await read('api/app-recovery.js');

test('mobile auth gate always hides the application bottom navigation', () => {
  assert.match(authUi, /\.bottomNav\.hidden\{display:none!important\}/);
  assert.match(authUi, /#authGate:not\(\.hidden\)~#bottomNav/);
  assert.match(authUi, /#onboardingGate:not\(\.hidden\)~#bottomNav/);
  assert.match(authUi, /z-index:90!important/);
});

test('successful login waits for the HttpOnly session to become observable before boot', () => {
  assert.match(authUi, /\/api\/auth\/session/);
  assert.match(authUi, /credentials:'same-origin'/);
  assert.match(authUi, /const delays=\[0,80,180,350,700,1100\]/);
  const sessionIndex = authUi.indexOf('const state=await sessionReady()');
  const bootIndex = authUi.indexOf('await boot()');
  assert.ok(sessionIndex >= 0 && bootIndex > sessionIndex);
});

test('a valid server session can reconcile a lagging signed-out presentation gate', () => {
  assert.match(authUi, /async function reconcileVerifiedGate\(name\)/);
  assert.match(authUi, /SESSION_RECONCILED_FOR_GATE/);
  assert.match(authUi, /authStage===authMachine\.stages\.SIGNED_OUT\|\|authStage===authMachine\.stages\.DEGRADED/);
  assert.match(authUi, /void reconcileVerifiedGate\('app'\)/);
  assert.match(authUi, /void reconcileVerifiedGate\('onboarding'\)/);
  assert.match(authUi, /gate_reconciliation:true/);

  const reconcileIndex = authUi.indexOf('async function reconcileVerifiedGate(name)');
  const sessionIndex = authUi.indexOf('const state=await sessionReady()', reconcileIndex);
  const promoteIndex = authUi.indexOf("baseShowGate(name)", reconcileIndex);
  assert.ok(reconcileIndex >= 0 && sessionIndex > reconcileIndex && promoteIndex > sessionIndex);
});

test('auth stability authority loads last after all owner and contextual presentation layers', () => {
  const ownerIndex = appRecovery.indexOf('/api/dabbir-owner-first-ui');
  const copilotIndex = appRecovery.indexOf('/api/owner-copilot-ui');
  const contextualIndex = appRecovery.indexOf('/api/dabbir-contextual-navigation-ui');
  const authIndex = appRecovery.indexOf('/api/auth-session-stability-ui');
  assert.ok(ownerIndex >= 0 && copilotIndex >= 0 && contextualIndex >= 0 && authIndex >= 0);
  assert.ok(authIndex > ownerIndex);
  assert.ok(authIndex > copilotIndex);
  assert.ok(authIndex > contextualIndex);
});

test('auth stability handler is no-store JavaScript and rejects non-GET requests', () => {
  assert.match(authUi, /application\/javascript; charset=utf-8/);
  assert.match(authUi, /cache-control','no-store/);
  assert.match(authUi, /req\.method!==\'GET\'/);
});
