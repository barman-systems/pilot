import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {_v3RuntimeTest} from '../api/_dabbir-conversation-v3-runtime.js';

const source=fs.readFileSync(new URL('../api/_dabbir-conversation-v3-runtime.js',import.meta.url),'utf8');

test('V3 baseline metrics are bounded derived facts with no customer text',()=>{
  const metrics=_v3RuntimeTest.metricsFor({
    state:{goal:'BOOK_SERVICE',invalidations:[]},
    plan:{turn_disposition:'OPERATIONAL',missing_fields:['time']},
    action:'CLARIFY',
    interpretation:{provider:'stub',model:'stub-v3',proposal:{action:'REPLY',dialogue:{message_role:'CORRECTION',invalidated_fields:['vehicle','date']}}},
    episode:{kind:'CONTINUE',reason:'ACTIVE_GOAL'},
    understanding:{turn_verified:[{field:'vehicle',source:'CUSTOMER_CORRECTION'},{field:'time',source:'CUSTOMER_STATED'}]},
    decisionLatencyMs:321.4,
  });
  assert.equal(metrics.engine,'V3');
  assert.equal(metrics.correction_count,2,'duplicate correction evidence for vehicle is counted once');
  assert.equal(metrics.clarification_count,1);
  assert.equal(metrics.decision_latency_ms,321);
  assert.equal(JSON.stringify(metrics).includes('customer_message'),false);
  assert.equal(JSON.stringify(metrics).includes('body'),false);
});

test('ordinary V3 reply records zero corrections and zero clarifications',()=>{
  const metrics=_v3RuntimeTest.metricsFor({
    state:{goal:'SUPPORT',invalidations:[]},plan:{turn_disposition:'OPERATIONAL',missing_fields:[]},action:'REPLY',
    interpretation:{provider:'deterministic-v3-fast-path',model:null,proposal:{action:'REPLY',dialogue:{message_role:'GREETING',invalidated_fields:[]}}},
    episode:{kind:'CONTINUE',reason:'SOCIAL'},understanding:{turn_verified:[]},decisionLatencyMs:0,
  });
  assert.equal(metrics.correction_count,0);
  assert.equal(metrics.clarification_count,0);
  assert.equal(metrics.decision_latency_ms,0);
});

test('runtime measures decision latency before commit without changing provider or execution authority',()=>{
  assert.match(source,/const decisionStarted=performanceNow\(\)/);
  assert.match(source,/const decisionLatencyMs=Math\.max\(0,Number\(performanceNow\(\)\)-Number\(decisionStarted\)\)/);
  assert.match(source,/p_metrics:metricsFor\(\{state,plan,action,interpretation,episode,understanding,decisionLatencyMs\}\)/);
  assert.doesNotMatch(source,/V3_REASONING_SHADOW_MODEL|runV3ReasoningShadowBenchmark|find_available_options_v1/);
});
