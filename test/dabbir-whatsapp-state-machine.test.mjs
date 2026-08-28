import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveWhatsAppOperationalState } from '../api/_dabbir-whatsapp-state-machine.js';

const evidence=(overrides={})=>({
  available:true,
  real_whatsapp_conversation:true,
  real_inbound_message:true,
  real_outbound_reply:true,
  verified_external_result:true,
  ...overrides,
});

test('WhatsApp fails closed when no tenant connection exists',()=>{
  assert.deepEqual(deriveWhatsAppOperationalState({hasConnection:false}),{
    state:'NOT_CONFIGURED',stage:'NOT_CONFIGURED',operational:false,reason:'WHATSAPP_NOT_LINKED'
  });
});

test('Meta authorization alone never becomes operational',()=>{
  const state=deriveWhatsAppOperationalState({authorized:true,evidence:evidence({real_whatsapp_conversation:false,real_inbound_message:false,real_outbound_reply:false,verified_external_result:false})});
  assert.equal(state.state,'META_AUTHORIZED');
  assert.equal(state.stage,'META_AUTHORIZED');
  assert.equal(state.operational,false);
  assert.equal(state.reason,'REAL_WHATSAPP_CONVERSATION_NOT_VERIFIED');
});

test('verified inbound advances only to INBOUND_VERIFIED',()=>{
  const state=deriveWhatsAppOperationalState({authorized:true,evidence:evidence({real_outbound_reply:false,verified_external_result:false})});
  assert.equal(state.state,'META_AUTHORIZED');
  assert.equal(state.stage,'INBOUND_VERIFIED');
  assert.equal(state.operational,false);
  assert.equal(state.reason,'REAL_WHATSAPP_REPLY_NOT_RECORDED');
});

test('recorded outbound without provider proof advances only to OUTBOUND_VERIFIED',()=>{
  const state=deriveWhatsAppOperationalState({authorized:true,evidence:evidence({verified_external_result:false})});
  assert.equal(state.state,'META_AUTHORIZED');
  assert.equal(state.stage,'OUTBOUND_VERIFIED');
  assert.equal(state.operational,false);
  assert.equal(state.reason,'EXTERNAL_REPLY_RESULT_NOT_VERIFIED');
});

test('only the full evidence chain can become OPERATIONAL',()=>{
  const state=deriveWhatsAppOperationalState({authorized:true,evidence:evidence()});
  assert.deepEqual(state,{state:'OPERATIONAL',stage:'OPERATIONAL',operational:true,reason:null});
});

test('unavailable evidence and verification failure are explicitly degraded',()=>{
  const unavailable=deriveWhatsAppOperationalState({authorized:true,evidence:{available:false}});
  assert.equal(unavailable.stage,'DEGRADED');
  assert.equal(unavailable.operational,false);
  assert.equal(unavailable.reason,'OPERATIONAL_EVIDENCE_UNAVAILABLE');

  const failed=deriveWhatsAppOperationalState({authorized:true,verificationFailed:true});
  assert.equal(failed.state,'CONNECTED_VERIFICATION_FAILED');
  assert.equal(failed.stage,'DEGRADED');
  assert.equal(failed.operational,false);
});
