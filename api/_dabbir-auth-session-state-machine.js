// BAR-30 Phase 3: one fail-closed authority defines the owner auth/session lifecycle.
export const AUTH_SESSION_STAGES = Object.freeze({
  SIGNED_OUT: 'signed_out',
  AUTHENTICATING: 'authenticating',
  MFA_REQUIRED: 'mfa_required',
  SESSION_VERIFIED: 'session_verified',
  WORKSPACE_READY: 'workspace_ready',
  SUSPENDED: 'suspended',
  DEGRADED: 'degraded',
});

export const AUTH_SESSION_TRANSITIONS = Object.freeze({
  [AUTH_SESSION_STAGES.SIGNED_OUT]: Object.freeze([
    AUTH_SESSION_STAGES.AUTHENTICATING,
  ]),
  [AUTH_SESSION_STAGES.AUTHENTICATING]: Object.freeze([
    AUTH_SESSION_STAGES.SIGNED_OUT,
    AUTH_SESSION_STAGES.MFA_REQUIRED,
    AUTH_SESSION_STAGES.SESSION_VERIFIED,
    AUTH_SESSION_STAGES.SUSPENDED,
    AUTH_SESSION_STAGES.DEGRADED,
  ]),
  [AUTH_SESSION_STAGES.MFA_REQUIRED]: Object.freeze([
    AUTH_SESSION_STAGES.SESSION_VERIFIED,
    AUTH_SESSION_STAGES.SIGNED_OUT,
    AUTH_SESSION_STAGES.SUSPENDED,
    AUTH_SESSION_STAGES.DEGRADED,
  ]),
  [AUTH_SESSION_STAGES.SESSION_VERIFIED]: Object.freeze([
    AUTH_SESSION_STAGES.WORKSPACE_READY,
    AUTH_SESSION_STAGES.SIGNED_OUT,
    AUTH_SESSION_STAGES.SUSPENDED,
    AUTH_SESSION_STAGES.DEGRADED,
  ]),
  [AUTH_SESSION_STAGES.WORKSPACE_READY]: Object.freeze([
    AUTH_SESSION_STAGES.SIGNED_OUT,
    AUTH_SESSION_STAGES.SUSPENDED,
    AUTH_SESSION_STAGES.DEGRADED,
  ]),
  [AUTH_SESSION_STAGES.SUSPENDED]: Object.freeze([
    AUTH_SESSION_STAGES.SIGNED_OUT,
  ]),
  [AUTH_SESSION_STAGES.DEGRADED]: Object.freeze([
    AUTH_SESSION_STAGES.SIGNED_OUT,
    AUTH_SESSION_STAGES.AUTHENTICATING,
  ]),
});

export function isAllowedAuthSessionTransition(from, to) {
  if (from === to) return true;
  return AUTH_SESSION_TRANSITIONS[from]?.includes(to) === true;
}

export function deriveAuthSessionState({
  attempting = false,
  mfaRequired = false,
  sessionVerified = false,
  workspaceReady = false,
  suspended = false,
  verificationFailed = false,
} = {}) {
  if (suspended) {
    return {
      stage: AUTH_SESSION_STAGES.SUSPENDED,
      authenticated: true,
      workspace_ready: false,
      reason: 'ACCOUNT_SUSPENDED',
    };
  }

  if (verificationFailed) {
    return {
      stage: AUTH_SESSION_STAGES.DEGRADED,
      authenticated: false,
      workspace_ready: false,
      reason: 'SESSION_VERIFICATION_FAILED',
    };
  }

  if (workspaceReady && (!sessionVerified || mfaRequired)) {
    return {
      stage: AUTH_SESSION_STAGES.DEGRADED,
      authenticated: false,
      workspace_ready: false,
      reason: mfaRequired ? 'WORKSPACE_BEFORE_MFA_VERIFICATION' : 'WORKSPACE_WITHOUT_VERIFIED_SESSION',
    };
  }

  if (mfaRequired) {
    return {
      stage: AUTH_SESSION_STAGES.MFA_REQUIRED,
      authenticated: true,
      workspace_ready: false,
      reason: 'MFA_REQUIRED',
    };
  }

  if (workspaceReady && sessionVerified) {
    return {
      stage: AUTH_SESSION_STAGES.WORKSPACE_READY,
      authenticated: true,
      workspace_ready: true,
      reason: null,
    };
  }

  if (sessionVerified) {
    return {
      stage: AUTH_SESSION_STAGES.SESSION_VERIFIED,
      authenticated: true,
      workspace_ready: false,
      reason: null,
    };
  }

  if (attempting) {
    return {
      stage: AUTH_SESSION_STAGES.AUTHENTICATING,
      authenticated: false,
      workspace_ready: false,
      reason: null,
    };
  }

  return {
    stage: AUTH_SESSION_STAGES.SIGNED_OUT,
    authenticated: false,
    workspace_ready: false,
    reason: null,
  };
}
