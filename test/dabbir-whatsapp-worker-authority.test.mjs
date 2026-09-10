import test from 'node:test';
import assert from 'node:assert/strict';
import { processClaimedWhatsAppAiBatch } from '../api/_dabbir-whatsapp-ai-core.js';
import { processWhatsAppDispatchWithServiceMenu, processWhatsAppRecoveryWithServiceMenu } from '../api/_dabbir-whatsapp-dispatch.js';
import { context, offered, slots } from './fixtures/understanding/cases.mjs';

const fetchBefore = global.fetch;
const credentialName = 'SUPABASE_SERVICE_ROLE_KEY';
const credentialBefore = process.env[credentialName];
test.beforeEach(() => { process.env[credentialName] = 'isolated-worker-fixture'; });
test.afterEach(() => {
  global.fetch = fetchBefore;
  if (credentialBefore === undefined) delete process.env[credentialName];
  else process.env[credentialName] = credentialBefore;
});
function worker({ text = 'الثاني', failure = null, entry = 'claimed' } = {}) {
  const calls = [];
  const pending = structuredClone(offered);
  pending.expires_at = new Date(Date.now() + 3600000).toISOString();
  const ctx = context({ pending_state: pending, batch_messages: [{ body: text, created_at: new Date().toISOString() }] });
  let claimed = false;
  const claim = { state: 'CLAIMED', batch_id: 'fixture-batch', lock_token: 'fixture-lock', attempt_count: 1 };
  global.fetch = async (url, init) => {
    assert.ok(String(url).includes('/rest/v1/rpc/'), 'no direct provider call or database REST writer');
    const name = String(url).split('/rpc/')[1];
    const args = JSON.parse(init.body);
    calls.push({ name, args });
    if (name === failure) return new Response(JSON.stringify({ message: 'DB_UNAVAILABLE' }), { status: 503 });
    let result;
    if (name === 'dabbir_whatsapp_ai_claim_dispatch') result = claim;
    else if (name === 'dabbir_whatsapp_ai_claim_next') { result = claimed ? { state: 'EMPTY' } : claim; claimed = true; }
    else if (name === 'dabbir_whatsapp_ai_context') result = ctx;
    else if (name === 'dabbir_semantic_load_v2') result = { semantic_state: {}, version: 0, message_revision: 1 };
    else if (name === 'dabbir_semantic_commit_v2') result = { version: 1, state: args.p_state, replay: false };
    else if (name === 'dabbir_semantic_execute_v2') result = { verified: true, appointment_id: 'fixture-appointment', status: 'new', starts_at: slots[1].starts_at, timezone: 'Asia/Dubai' };
    else if (name === 'dabbir_semantic_reserve_outbound_v2') result = { reservation_id: 'fixture-reservation', should_send: false, provider_message_id: 'wamid.persisted', reservation_state: 'SENT' };
    else if (['dabbir_semantic_assert_current_v2', 'dabbir_semantic_set_pending_v2', 'dabbir_record_ai_operator_decision_v1', 'dabbir_whatsapp_ai_finish_batch', 'dabbir_semantic_checkpoint_failure_v1'].includes(name)) result = true;
    else throw new Error(`Unexpected authority ${name}`);
    return new Response(JSON.stringify(result));
  };
  return { calls, run: () => entry === 'dispatch' ? processWhatsAppDispatchWithServiceMenu('fixture-dispatch') : entry === 'recovery' ? processWhatsAppRecoveryWithServiceMenu() : processClaimedWhatsAppAiBatch(claim) };
}
test('claimed worker uses only the canonical semantic executor with the persisted version and lock', async () => {
  const h = worker();
  const result = await h.run();
  assert.equal(result.action, 'CREATE_BOOKING');
  assert.equal(result.provider_verified, false);
  const execution = h.calls.filter(c => c.name === 'dabbir_semantic_execute_v2');
  assert.deepEqual(execution.map(c => c.args), [{ p_batch_id: 'fixture-batch', p_lock_token: 'fixture-lock', p_version: 1, p_action: 'CREATE_BOOKING' }]);
  assert.ok(h.calls.findIndex(c => c.name === 'dabbir_semantic_commit_v2') < h.calls.indexOf(execution[0]));
  assert.ok(h.calls.findIndex(c => c.name === 'dabbir_semantic_reserve_outbound_v2') > h.calls.indexOf(execution[0]));
  assert.equal(h.calls.some(c => /dabbir_whatsapp_ai_(create|cancel|reschedule)_booking/.test(c.name)), false);
});
for (const failure of ['dabbir_semantic_load_v2', 'dabbir_semantic_commit_v2', 'dabbir_semantic_execute_v2']) {
  test(`claimed worker cannot send or clear confirmation after ${failure} fails`, async () => {
    const h = worker({ failure });
    const result = await h.run();
    assert.equal(result.state, 'RETRY');
    assert.equal(h.calls.some(c => c.name === 'dabbir_semantic_reserve_outbound_v2'), false);
    assert.equal(h.calls.some(c => c.name === 'dabbir_semantic_set_pending_v2' && c.args.p_action === 'none'), false);
    assert.equal(h.calls.at(-1).name, 'dabbir_whatsapp_ai_finish_batch');
    assert.equal(h.calls.at(-1).args.p_lock_token, 'fixture-lock');
  });
}
test('optional operator telemetry failure does not create an alternate booking executor', async () => {
  const h = worker({ failure: 'dabbir_record_ai_operator_decision_v1' });
  assert.equal((await h.run()).action, 'CREATE_BOOKING');
  assert.equal(h.calls.filter(c => c.name === 'dabbir_semantic_execute_v2').length, 1);
});

for (const entry of ['dispatch', 'recovery']) {
  test(`${entry} reaches the same versioned executor and never performs a second booking`, async () => {
    const h = worker({ entry });
    const result = await h.run();
    assert.equal(entry === 'dispatch' ? result.action : result.results[0].action, 'CREATE_BOOKING');
    assert.equal(entry === 'dispatch' ? result.claimed : result.processed === 1, true);
    const executions = h.calls.filter(c => c.name === 'dabbir_semantic_execute_v2');
    assert.deepEqual(executions.map(c => c.args), [{ p_batch_id: 'fixture-batch', p_lock_token: 'fixture-lock', p_version: 1, p_action: 'CREATE_BOOKING' }]);
    assert.equal(h.calls.some(c => /dabbir_whatsapp_ai_(create|cancel|reschedule)_booking/.test(c.name)), false);
  });
}
