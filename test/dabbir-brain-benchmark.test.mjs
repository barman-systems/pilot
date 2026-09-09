import test from 'node:test';
import assert from 'node:assert/strict';
import {understandConversation} from '../api/_dabbir-semantic-engine.js';
import {brainCases,evaluateBrainCase} from './fixtures/understanding/brain-benchmark.mjs';
test('brain benchmark covers 120 labeled state transitions across four business/language/timezone profiles',()=>{
 assert.equal(brainCases.length,120);assert.equal(new Set(brainCases.map(c=>c.id)).size,120);
 assert.ok(brainCases.some(c=>c.input_history.length===19));
 assert.ok(brainCases.every(c=>c.customer_state&&c.business_state&&c.expected_tool&&c.must_not_do.length));
});
for(const item of brainCases)test('brain benchmark: '+item.id,()=>{
 const r=evaluateBrainCase(item,understandConversation);
 assert.deepEqual(r.checks.filter(c=>!c.pass),[]);assert.equal(r.mutation,false);
});
