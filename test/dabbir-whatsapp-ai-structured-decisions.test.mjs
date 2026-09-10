import test from 'node:test';
import assert from 'node:assert/strict';
import { validSemanticContract } from '../api/_dabbir-semantic-contract.js';
import { evaluateSemanticProbe } from '../api/_dabbir-semantic-interpreter.js';
import { assertBrainDecision } from '../api/_dabbir-brain-contract.js';
import { understandConversation } from '../api/_dabbir-semantic-engine.js';
import { context, offered, now } from './fixtures/understanding/cases.mjs';

// Exercise the deployed authority; the previous tests matched an unreachable planner.
const proposal = { action:'CHECK_AVAILABILITY', intent:'BOOKING', confidence:.98, risk_level:'LOW', service_name:null, knowledge_key:null, entities:[] };
test('active provider contract requires structured intent, confidence and risk', () => {
  assert.equal(validSemanticContract(JSON.stringify(proposal)), true);
  for (const key of ['intent','confidence','risk_level']) {
    const invalid = { ...proposal }; delete invalid[key];
    assert.equal(validSemanticContract(JSON.stringify(invalid)), false, key);
  }
  assert.equal(validSemanticContract('Your booking is confirmed'), false);
});
test('high-risk interpretation routes to human authority', () => {
  const result = evaluateSemanticProbe({ ...proposal, riskLevel:'HIGH', serviceName:null });
  assert.equal(result.policy_action, 'HANDOFF');
  assert.equal(result.passed, false);
});
test('an incomplete conversation cannot authorize a mutation', () => {
  const c = context({ batch_messages:[{ body:'ابا غسيل باجر' }] });
  const { state, decision } = understandConversation({ context:c, now });
  assert.equal(decision.action, 'CLARIFY');
  assert.throws(() => assertBrainDecision(state, { ...decision, action:'CREATE_BOOKING' }, c), /BRAIN_MUTATION_NOT_AUTHORIZED/);
});
test('human requests and presented slot choices use the active deterministic decision authority', () => {
  const human = understandConversation({ context:context({ batch_messages:[{ body:'human please' }] }), now });
  assert.equal(human.decision.action, 'HANDOFF');
  assert.equal(human.decision.reasonCode, 'CUSTOMER_REQUESTED_HUMAN');
  const selected = understandConversation({ context:context({ pending_state:offered, batch_messages:[{ body:'الثاني' }] }), now });
  assert.equal(selected.decision.action, 'CREATE_BOOKING');
  assert.equal(selected.decision.reasonCode, 'VERIFIED_SLOT_SELECTION');
});
// Scoped operator-ledger persistence and optional telemetry failure are exercised
// through the actual worker in dabbir-whatsapp-worker-authority.test.mjs.
