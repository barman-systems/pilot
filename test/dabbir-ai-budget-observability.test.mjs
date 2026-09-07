import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeAiBudget } from '../api/_dabbir-ai-budget.js';

const input = { businessId: 'test-business', operationKey: 'test-operation', outcome: 'VERIFIED_SUCCESS' };
const env = { DABBIR_LANGFUSE_ENABLED: '1', LANGFUSE_PUBLIC_KEY: 'pk-lf-testpublic12345', LANGFUSE_SECRET_KEY: 'sk-lf-testsecret12345', DABBIR_TELEMETRY_SAMPLE_RATE: '1' };

test('disabled telemetry preserves the authoritative RPC response and arguments', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected network'));
  const original = { ok: true, receipt: 'original-receipt' };
  const result = await finalizeAiBudget({ ...input, env: {}, rpc: async (name, params) => {
    assert.equal(name, 'dabbir_finalize_ai_budget_v1');
    assert.equal(params.p_business_id, input.businessId);
    assert.equal(params.p_actual_cost_microusd, null);
    return original;
  } });
  assert.equal(result, original);
});
test('failed RPC does not publish telemetry and retains its original error', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected network'));
  const error = new Error('LEDGER_FAILED');
  await assert.rejects(finalizeAiBudget({ ...input, env, rpc: async () => { throw error; } }), x => x === error);
});
test('logical RPC refusal is not exported as success', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected network'));
  const original = { ok: false, reason: 'LEDGER_REFUSED' };
  assert.equal(await finalizeAiBudget({ ...input, env, rpc: async () => original }), original);
});
test('telemetry failure happens after the ledger and cannot replace its response', async t => {
  const sequence = [];
  t.mock.method(globalThis, 'fetch', async () => { sequence.push('telemetry'); throw new Error('NETWORK_FAILURE'); });
  const original = { ok: true };
  assert.equal(await finalizeAiBudget({ ...input, env, rpc: async () => { sequence.push('ledger'); return original; } }), original);
  assert.deepEqual(sequence, ['ledger', 'telemetry']);
});
