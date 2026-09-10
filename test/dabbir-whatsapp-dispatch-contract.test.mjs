import test from 'node:test';
import assert from 'node:assert/strict';
import { processWhatsAppDispatchWithServiceMenu as dispatch, processWhatsAppRecoveryWithServiceMenu as recover } from '../api/_dabbir-whatsapp-dispatch.js';

const originalFetch = global.fetch;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
test.beforeEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = 'dispatch-fixture-only'; });
test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
});
function rpcFixture(responder) {
  const calls = [];
  global.fetch = async (url, init) => {
    assert.ok(String(url).includes('/rest/v1/rpc/'), 'dispatch cannot send to a provider directly');
    const name = String(url).split('/rpc/')[1];
    const params = JSON.parse(init.body);
    calls.push({ name, params });
    const reply = responder(name, params, calls);
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  return calls;
}
for (const state of ['EMPTY', 'BUSY', 'CANCELLED', 'WAIT', null]) {
  test(`dispatch preserves non-claim ${state} without entering conversation`, async () => {
    const calls = rpcFixture(() => ({ state, ready_at: '2000-01-01T00:00:00Z' }));
    assert.deepEqual(await dispatch('opaque-dispatch-token'), { claimed: false, state: state || 'NOOP' });
    assert.equal(calls.length, state === 'WAIT' ? 2 : 1);
    for (const c of calls) assert.deepEqual(c, { name: 'dabbir_whatsapp_ai_claim_dispatch', params: { p_dispatch_token: 'opaque-dispatch-token' } });
  });
}
test('WAIT can only proceed after the second durable claim and invalid context fails closed', async () => {
  let claimCount = 0;
  const calls = rpcFixture(name => {
    if (name === 'dabbir_whatsapp_ai_claim_dispatch') return ++claimCount === 1 ? { state: 'WAIT', ready_at: '2000-01-01T00:00:00Z' } : { state: 'CLAIMED', batch_id: 'batch-fixture', lock_token: 'lock-fixture', attempt_count: 1 };
    if (name === 'dabbir_whatsapp_ai_context') return {};
    if (name === 'dabbir_whatsapp_ai_finish_batch') return {};
    throw new Error(`unexpected RPC ${name}`);
  });
  assert.deepEqual(await dispatch('opaque-dispatch-token'), { claimed: true, state: 'HUMAN_REQUIRED', error: 'AI_CONTEXT_UNVERIFIED' });
  assert.deepEqual(calls.slice(0, 3).map(c => c.name), ['dabbir_whatsapp_ai_claim_dispatch', 'dabbir_whatsapp_ai_claim_dispatch', 'dabbir_whatsapp_ai_context']);
  assert.deepEqual(calls.at(-1), { name: 'dabbir_whatsapp_ai_finish_batch', params: { p_batch_id: 'batch-fixture', p_lock_token: 'lock-fixture', p_outcome: 'HUMAN_REQUIRED', p_error: 'AI_CONTEXT_UNVERIFIED' } });
});
test('recovery stops immediately on EMPTY', async () => {
  const calls = rpcFixture(() => ({ state: 'EMPTY' }));
  assert.deepEqual(await recover(), { processed: 0, results: [] });
  assert.equal(calls.length, 1);
});
for (const [limit, count] of [[undefined, 12], [0, 12], [-1, 1], [1, 1], [2, 2], [2.5, 3], [25, 25], [100, 25], ['invalid', 12]]) {
  test(`recovery preserves limit ${limit} as ${count} claim attempts`, async () => {
    const calls = rpcFixture(() => ({ state: 'BUSY' }));
    const result = limit === undefined ? await recover() : await recover({ limit });
    assert.equal(result.processed, count);
    assert.deepEqual(result.results, Array.from({ length: count }, () => ({ state: 'BUSY' })));
    assert.equal(calls.length, count);
    for (const c of calls) assert.deepEqual(c, { name: 'dabbir_whatsapp_ai_claim_next', params: {} });
  });
}
test('recovery retains failed claimed result before continuing to the next claim', async () => {
  let claims = 0;
  const calls = rpcFixture(name => {
    if (name === 'dabbir_whatsapp_ai_claim_next') return ++claims === 1 ? { state: 'CLAIMED', batch_id: 'batch-fixture', lock_token: 'lock-fixture' } : { state: 'EMPTY' };
    if (name === 'dabbir_whatsapp_ai_context' || name === 'dabbir_whatsapp_ai_finish_batch') return {};
    throw new Error(`unexpected RPC ${name}`);
  });
  assert.deepEqual(await recover(), { processed: 1, results: [{ state: 'HUMAN_REQUIRED', error: 'AI_CONTEXT_UNVERIFIED' }] });
  const finishAt = calls.findIndex(c => c.name === 'dabbir_whatsapp_ai_finish_batch');
  assert.ok(finishAt > 0 && finishAt < calls.length - 1);
  assert.equal(calls.at(-1).name, 'dabbir_whatsapp_ai_claim_next');
});
test('claim storage failure propagates without pretending work was accepted', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return new Response('{"message":"CLAIM_STORAGE_UNAVAILABLE"}', { status: 503 }); };
  await assert.rejects(dispatch('opaque-dispatch-token'), e => e.message === 'CLAIM_STORAGE_UNAVAILABLE');
  assert.equal(calls, 1);
});
