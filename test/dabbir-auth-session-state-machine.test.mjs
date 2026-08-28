import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AUTH_SESSION_STAGES,
  deriveAuthSessionState,
  isAllowedAuthSessionTransition,
} from '../api/_dabbir-auth-session-state-machine.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const authUi = await read('api/auth-session-stability-ui.js');
const architecture = JSON.parse(await read('config/dabbir-architecture-ownership.json'));

test('auth session state machine exposes the explicit BAR-30 lifecycle', () => {
  assert.deepEqual(AUTH_SESSION_STAGES, {
    SIGNED_OUT: 'signed_out',
    AUTHENTICATING: 'authenticating',
    SESSION_VERIFIED: 'session_verified',
    WORKSPACE_READY: 'workspace_ready',
    SUSPENDED: 'suspended',
    DEGRADED: 'degraded',
  });
  assert.equal(isAllowedAuthSessionTransition('signed_out', 'authenticating'), true);
  assert.equal(isAllowedAuthSessionTransition('authenticating', 'session_verified'), true);
  assert.equal(isAllowedAuthSessionTransition('session_verified', 'workspace_ready'), true);
  assert.equal(isAllowedAuthSessionTransition('signed_out', 'workspace_ready'), false);
});

test('workspace readiness fails closed unless the session is verified', () => {
  assert.equal(deriveAuthSessionState({}).stage, AUTH_SESSION_STAGES.SIGNED_OUT);
  assert.equal(deriveAuthSessionState({ attempting: true }).stage, AUTH_SESSION_STAGES.AUTHENTICATING);
  assert.equal(deriveAuthSessionState({ sessionVerified: true }).stage, AUTH_SESSION_STAGES.SESSION_VERIFIED);
  assert.equal(
    deriveAuthSessionState({ sessionVerified: true, workspaceReady: true }).stage,
    AUTH_SESSION_STAGES.WORKSPACE_READY,
  );
  const invalid = deriveAuthSessionState({ workspaceReady: true });
  assert.equal(invalid.stage, AUTH_SESSION_STAGES.DEGRADED);
  assert.equal(invalid.reason, 'WORKSPACE_WITHOUT_VERIFIED_SESSION');
});

test('suspended and failed verification are explicit non-ready states', () => {
  const suspended = deriveAuthSessionState({ suspended: true, sessionVerified: true });
  assert.equal(suspended.stage, AUTH_SESSION_STAGES.SUSPENDED);
  assert.equal(suspended.workspace_ready, false);

  const degraded = deriveAuthSessionState({ verificationFailed: true });
  assert.equal(degraded.stage, AUTH_SESSION_STAGES.DEGRADED);
  assert.equal(degraded.authenticated, false);
});

test('auth UI publishes one machine stage and cannot open app from an unverified state', () => {
  assert.match(authUi, /dataset\.dabbirAuthStage/);
  assert.match(authUi, /INVALID_AUTH_TRANSITION/);
  assert.match(authUi, /WORKSPACE_WITHOUT_VERIFIED_SESSION/);
  assert.match(authUi, /state_machine:true/);
  assert.match(authUi, /SESSION_COOKIE_VERIFIED/);

  const verifiedIndex = authUi.indexOf("setAuthStage(authMachine.stages.SESSION_VERIFIED,'SESSION_COOKIE_VERIFIED')");
  const bootIndex = authUi.indexOf('await boot()');
  assert.ok(verifiedIndex >= 0 && bootIndex > verifiedIndex);
});

test('architecture contract names the auth machine and forbids workspace promotion without verified session', () => {
  assert.equal(
    architecture.authorities.auth_session_state_machine,
    'api/_dabbir-auth-session-state-machine.js',
  );
  assert.equal(architecture.truth_rules.workspace_ready_requires_verified_session, true);
  assert.equal(architecture.truth_rules.invalid_auth_transition_may_open_workspace, false);
  assert.equal(architecture.shell.final_ui_authority, '/api/auth-session-stability-ui');
});
