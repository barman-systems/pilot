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

test('auth session state machine exposes the explicit BAR-30 lifecycle including MFA continuation', () => {
  assert.deepEqual(AUTH_SESSION_STAGES, {
    SIGNED_OUT: 'signed_out',
    AUTHENTICATING: 'authenticating',
    MFA_REQUIRED: 'mfa_required',
    SESSION_VERIFIED: 'session_verified',
    WORKSPACE_READY: 'workspace_ready',
    SUSPENDED: 'suspended',
    DEGRADED: 'degraded',
  });
  assert.equal(isAllowedAuthSessionTransition('signed_out', 'authenticating'), true);
  assert.equal(isAllowedAuthSessionTransition('authenticating', 'mfa_required'), true);
  assert.equal(isAllowedAuthSessionTransition('mfa_required', 'session_verified'), true);
  assert.equal(isAllowedAuthSessionTransition('mfa_required', 'workspace_ready'), false);
  assert.equal(isAllowedAuthSessionTransition('authenticating', 'session_verified'), true);
  assert.equal(isAllowedAuthSessionTransition('session_verified', 'workspace_ready'), true);
  assert.equal(isAllowedAuthSessionTransition('signed_out', 'workspace_ready'), false);
});

test('workspace readiness fails closed unless session and enrolled MFA are verified', () => {
  assert.equal(deriveAuthSessionState({}).stage, AUTH_SESSION_STAGES.SIGNED_OUT);
  assert.equal(deriveAuthSessionState({ attempting: true }).stage, AUTH_SESSION_STAGES.AUTHENTICATING);

  const mfa = deriveAuthSessionState({ mfaRequired: true });
  assert.equal(mfa.stage, AUTH_SESSION_STAGES.MFA_REQUIRED);
  assert.equal(mfa.authenticated, true);
  assert.equal(mfa.workspace_ready, false);

  assert.equal(deriveAuthSessionState({ sessionVerified: true }).stage, AUTH_SESSION_STAGES.SESSION_VERIFIED);
  assert.equal(
    deriveAuthSessionState({ sessionVerified: true, workspaceReady: true }).stage,
    AUTH_SESSION_STAGES.WORKSPACE_READY,
  );

  const invalid = deriveAuthSessionState({ workspaceReady: true });
  assert.equal(invalid.stage, AUTH_SESSION_STAGES.DEGRADED);
  assert.equal(invalid.reason, 'WORKSPACE_WITHOUT_VERIFIED_SESSION');

  const beforeMfa = deriveAuthSessionState({ sessionVerified: true, workspaceReady: true, mfaRequired: true });
  assert.equal(beforeMfa.stage, AUTH_SESSION_STAGES.DEGRADED);
  assert.equal(beforeMfa.reason, 'WORKSPACE_BEFORE_MFA_VERIFICATION');
});

test('suspended and failed verification are explicit non-ready states', () => {
  const suspended = deriveAuthSessionState({ suspended: true, sessionVerified: true });
  assert.equal(suspended.stage, AUTH_SESSION_STAGES.SUSPENDED);
  assert.equal(suspended.workspace_ready, false);

  const degraded = deriveAuthSessionState({ verificationFailed: true });
  assert.equal(degraded.stage, AUTH_SESSION_STAGES.DEGRADED);
  assert.equal(degraded.authenticated, false);
});

test('auth UI cannot boot workspace until MFA status is checked and AAL2 is proven when required', () => {
  assert.match(authUi, /dataset\.dabbirAuthStage/);
  assert.match(authUi, /INVALID_AUTH_TRANSITION/);
  assert.match(authUi, /WORKSPACE_WITHOUT_VERIFIED_SESSION/);
  assert.match(authUi, /MFA_REQUIRED_AFTER_PRIMARY_AUTH/);
  assert.match(authUi, /MFA_AAL2_VERIFIED/);
  assert.match(authUi, /\/api\/auth\/mfa-status/);
  assert.match(authUi, /\/api\/auth\/mfa-verify/);
  assert.match(authUi, /status\.current_level!=='aal2'/);
  assert.match(authUi, /mfa_continuation:true/);

  const statusIndex = authUi.indexOf("status=await mfaStatus()");
  const mfaRequiredIndex = authUi.indexOf("authMachine.stages.MFA_REQUIRED,'MFA_REQUIRED_AFTER_PRIMARY_AUTH'");
  const primaryVerifiedIndex = authUi.indexOf("authMachine.stages.SESSION_VERIFIED,'SESSION_COOKIE_VERIFIED'");
  const primaryBootIndex = authUi.indexOf('await boot()', primaryVerifiedIndex);
  assert.ok(statusIndex >= 0);
  assert.ok(mfaRequiredIndex > statusIndex);
  assert.ok(primaryVerifiedIndex > statusIndex);
  assert.ok(primaryBootIndex > primaryVerifiedIndex);

  const aal2Index = authUi.indexOf("status.current_level!=='aal2'");
  const mfaVerifiedIndex = authUi.indexOf("authMachine.stages.SESSION_VERIFIED,'MFA_AAL2_VERIFIED'");
  const mfaBootIndex = authUi.indexOf('await boot()', mfaVerifiedIndex);
  assert.ok(aal2Index >= 0 && mfaVerifiedIndex > aal2Index && mfaBootIndex > mfaVerifiedIndex);
});

test('architecture contract names the auth machine and forbids workspace promotion without verified session or enrolled MFA', () => {
  assert.equal(
    architecture.authorities.auth_session_state_machine,
    'api/_dabbir-auth-session-state-machine.js',
  );
  assert.equal(architecture.truth_rules.workspace_ready_requires_verified_session, true);
  assert.equal(architecture.truth_rules.workspace_ready_requires_mfa_when_enrolled, true);
  assert.equal(architecture.truth_rules.invalid_auth_transition_may_open_workspace, false);
  assert.equal(architecture.shell.final_ui_authority, '/api/auth-session-stability-ui');
});
