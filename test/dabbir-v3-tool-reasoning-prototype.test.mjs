import test from 'node:test';
import assert from 'node:assert/strict';
import {V3_REASONING_LIMITS,normalizeReasoningRequest,findOptionsResult,nextReasoningStep,reasoningPrototypeEnabled} from '../api/_dabbir-v3-tool-reasoning.js';

test('prototype is off by default and cannot mutate production by activation accident',()=>{
  assert.equal(reasoningPrototypeEnabled({}),false);
  assert.equal(reasoningPrototypeEnabled({DABBIR_V3_TOOL_REASONING_PROTOTYPE:'1'}),true);
});

test('turn loop is bounded by code, not model preference',()=>{
  assert.deepEqual(V3_REASONING_LIMITS,{max_iterations_per_turn:3,max_tool_calls_per_turn:4});
  assert.deepEqual(nextReasoningStep({iteration:3,toolCalls:0,decision:{kind:'TOOL',tool:'find_options'}}),{kind:'SAFE_FALLBACK',reason:'TURN_BUDGET_EXHAUSTED'});
  assert.deepEqual(nextReasoningStep({iteration:0,toolCalls:4,decision:{kind:'TOOL',tool:'find_options'}}),{kind:'SAFE_FALLBACK',reason:'TURN_BUDGET_EXHAUSTED'});
});

test('prototype exposes only grounding tools; execution is not a reasoning tool',()=>{
  assert.equal(nextReasoningStep({decision:{kind:'TOOL',tool:'execute',args:{}}}).kind,'SAFE_FALLBACK');
  assert.equal(nextReasoningStep({decision:{kind:'TOOL',tool:'inspect_context',args:{}}}).tool,'inspect_context');
  assert.equal(nextReasoningStep({decision:{kind:'TOOL',tool:'find_options',args:{}}}).tool,'find_options');
});

test('constraints and preferences stay distinct and open typed',()=>{
  const x=normalizeReasoningRequest({goal:'BOOK_SERVICE',hard_constraints:[{kind:'not_before',value:'07:00'}],preferences:[{kind:'semantic',evidence:'أول الصباح'}],references:[{kind:'worker',surface:'محمد'}]});
  assert.equal(x.goal,'BOOK_SERVICE');
  assert.equal(x.hard_constraints[0].kind,'not_before');
  assert.equal(x.preferences[0].evidence,'أول الصباح');
});

test('find_options returns grounded candidates without inventing ranking or execution',()=>{
  const x=findOptionsResult({slots:[{starts_at:'2026-09-16T03:00:00Z',worker_name:'محمد',price:40,secret:'drop-me'}]});
  assert.equal(x.grounded,true);
  assert.equal(x.candidates.length,1);
  assert.equal(x.candidates[0].worker_name,'محمد');
  assert.equal('secret' in x.candidates[0],false);
});

test('clarification and proposal are explicit exits, not missing-field side effects',()=>{
  const ask=nextReasoningStep({decision:{kind:'ASK',reason:'CUSTOMER_AUTHORITY_REQUIRED',question:'أي خدمة تفضل؟'}});
  assert.equal(ask.kind,'ASK');
  const proposal=nextReasoningStep({decision:{kind:'PROPOSE',proposal:{slot:'07:00'},reason:'MATCHES_STATED_PREFERENCE'}});
  assert.equal(proposal.kind,'PROPOSE');
});
