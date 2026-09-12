import test from 'node:test';
import assert from 'node:assert/strict';
import { understandExecutiveSituation } from '../api/_barman-executive-automation.js';

const env={AI_GATEWAY_API_KEY:'test-key',BARMAN_AI_GATEWAY_MODEL:'test-model'};
const context={
  reality:{
    source:'TEST_LIVE_REALITY',observed_at:new Date().toISOString(),freshness:'FRESH',confidence:1,
    subject:'DABBIR_PRODUCTION',evidence_refs:['test:reality'],healthy:true,commit_sha:'a'.repeat(40),
  },
  goals:[],memory:[],
};

function response(content){
  return {ok:true,status:200,json:async()=>({choices:[{message:{content}}]})};
}

const incidentDecision={
  route:'REVIEW_REQUIRED',
  situation:{
    what_changed:'Infrastructure is healthy while conversion, complaints, and conversation cost degraded.',
    why_it_matters:'Business outcome is degraded despite green infrastructure.',
    affected_goal:'',severity:'HIGH',
    known_facts:['infrastructure=HEALTHY','conversion=-25%','complaints=+30%','cost_per_conversation=+20%'],
    unknowns:['root cause correlation'],evidence_refs:['test:reality'],
    health_domains:{infrastructure:'HEALTHY',runtime:'HEALTHY',product:'DEGRADED',customer:'DEGRADED',economic:'DEGRADED',strategic:'DEGRADED'},
  },
  decision:{
    options:['Correlate conversion drop with provider latency','Segment complaints by failed journey stage','Break down cost increase by provider and route'],
    chosen_option:'Correlate conversion drop with provider latency',
    reason:'Start with the lowest-risk evidence-gathering option before mutation.',risk:'LOW',
    expected_outcome:'Identify or reject a causal relationship using read-only evidence.',rollback:'NO_MUTATION',owner_required:false,memory_refs:[],
  },
};

test('semantic understanding retries malformed JSON once with the same governed stage',async t=>{
  const original=globalThis.fetch;
  const calls=[];
  t.after(()=>{globalThis.fetch=original});
  globalThis.fetch=async (_url,options)=>{
    calls.push(JSON.parse(options.body));
    return calls.length===1?response('not-json'):response(JSON.stringify(incidentDecision));
  };

  const result=await understandExecutiveSituation(
    'INCIDENT TEST: infrastructure healthy; conversion -25%; complaints +30%; conversation cost +20%; analyze only.',
    context,env,
  );

  assert.equal(calls.length,2);
  assert.equal(result.source,'AI_GATEWAY');
  assert.equal(result.route,'REVIEW_REQUIRED');
  assert.ok(result.decision.options.length>=3);
  assert.equal(result.situation.health_domains.infrastructure,'HEALTHY');
  assert.equal(result.situation.health_domains.customer,'DEGRADED');
  assert.equal(result.situation.health_domains.economic,'DEGRADED');
  assert.equal(result.situation.health_domains.product,'DEGRADED');
  assert.match(calls[1].messages[0].content,/previous response was not valid JSON/i);
  assert.match(calls[1].messages[0].content,/exactly one JSON object/i);
  assert.equal(calls[1].model,calls[0].model);
  assert.deepEqual(calls[1].response_format,calls[0].response_format);
});

test('semantic understanding remains fail-closed after the one bounded retry',async t=>{
  const original=globalThis.fetch;
  let calls=0;
  t.after(()=>{globalThis.fetch=original});
  globalThis.fetch=async ()=>{calls+=1;return response('still-not-json')};

  const result=await understandExecutiveSituation('Analyze this incident without mutation.',context,env);

  assert.equal(calls,2);
  assert.equal(result.source,'FAIL_CLOSED');
  assert.equal(result.route,'REVIEW_REQUIRED');
  assert.equal(result.decision.chosen_option,'REVIEW_REQUIRED');
  assert.equal(result.decision.owner_required,false);
  assert.match(result.decision.reason,/EXECUTIVE_UNDERSTANDING_INVALID_JSON/);
});
