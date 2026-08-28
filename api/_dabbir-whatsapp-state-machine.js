export const WHATSAPP_OPERATIONAL_STAGES = Object.freeze({
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  AUTHORIZATION_INVALID: 'AUTHORIZATION_INVALID',
  META_AUTHORIZED: 'META_AUTHORIZED',
  INBOUND_VERIFIED: 'INBOUND_VERIFIED',
  OUTBOUND_VERIFIED: 'OUTBOUND_VERIFIED',
  OPERATIONAL: 'OPERATIONAL',
  DEGRADED: 'DEGRADED',
});

function booleanEvidence(evidence = {}) {
  return {
    available: evidence?.available === true,
    real_whatsapp_conversation: evidence?.real_whatsapp_conversation === true,
    real_inbound_message: evidence?.real_inbound_message === true,
    real_outbound_reply: evidence?.real_outbound_reply === true,
    verified_external_result: evidence?.verified_external_result === true,
  };
}

export function deriveWhatsAppOperationalState({
  hasConnection = true,
  authorized = false,
  evidence = {},
  verificationFailed = false,
} = {}) {
  if (!hasConnection) {
    return {
      state: 'NOT_CONFIGURED',
      stage: WHATSAPP_OPERATIONAL_STAGES.NOT_CONFIGURED,
      operational: false,
      reason: 'WHATSAPP_NOT_LINKED',
    };
  }

  if (verificationFailed) {
    return {
      state: 'CONNECTED_VERIFICATION_FAILED',
      stage: WHATSAPP_OPERATIONAL_STAGES.DEGRADED,
      operational: false,
      reason: 'META_AUTHORIZATION_NOT_VERIFIED',
    };
  }

  if (!authorized) {
    return {
      state: 'AUTHORIZATION_INVALID',
      stage: WHATSAPP_OPERATIONAL_STAGES.AUTHORIZATION_INVALID,
      operational: false,
      reason: 'META_AUTHORIZATION_NOT_VERIFIED',
    };
  }

  const proof = booleanEvidence(evidence);
  if (!proof.available) {
    return {
      state: 'META_AUTHORIZED',
      stage: WHATSAPP_OPERATIONAL_STAGES.DEGRADED,
      operational: false,
      reason: 'OPERATIONAL_EVIDENCE_UNAVAILABLE',
    };
  }
  if (!proof.real_whatsapp_conversation) {
    return {
      state: 'META_AUTHORIZED',
      stage: WHATSAPP_OPERATIONAL_STAGES.META_AUTHORIZED,
      operational: false,
      reason: 'REAL_WHATSAPP_CONVERSATION_NOT_VERIFIED',
    };
  }
  if (!proof.real_inbound_message) {
    return {
      state: 'META_AUTHORIZED',
      stage: WHATSAPP_OPERATIONAL_STAGES.META_AUTHORIZED,
      operational: false,
      reason: 'REAL_WHATSAPP_INBOUND_NOT_VERIFIED',
    };
  }
  if (!proof.real_outbound_reply) {
    return {
      state: 'META_AUTHORIZED',
      stage: WHATSAPP_OPERATIONAL_STAGES.INBOUND_VERIFIED,
      operational: false,
      reason: 'REAL_WHATSAPP_REPLY_NOT_RECORDED',
    };
  }
  if (!proof.verified_external_result) {
    return {
      state: 'META_AUTHORIZED',
      stage: WHATSAPP_OPERATIONAL_STAGES.OUTBOUND_VERIFIED,
      operational: false,
      reason: 'EXTERNAL_REPLY_RESULT_NOT_VERIFIED',
    };
  }

  return {
    state: 'OPERATIONAL',
    stage: WHATSAPP_OPERATIONAL_STAGES.OPERATIONAL,
    operational: true,
    reason: null,
  };
}
