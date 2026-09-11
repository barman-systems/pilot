import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyProviderNoise,cognitiveCheckResult,runCognitiveGate} from './support/dabbir-cognitive-gate.mjs';

const success=(checks={a:true,b:true})=>({ok:true,status:200,json:{ok:true,cognitive_probe:true,external_side_effects:false,checks,providers:[{provider:'vercel-ai-gateway',model:'google/gemini-3.7-flash'}]}});
const cognitiveFail=(checks={a:false,b:true})=>({ok:false,status:502,json:{ok:false,cognitive_probe:true,external_side_effects:false,checks,providers:[{provider:'vercel-ai-gateway',model:'google/gemini-3.7-flash'}]}});
const noise=()=>({ok:false,status:502,json:{ok:false,error:'AI_PLANNER_UNAVAILABLE',checks:{a:false,b:false},providers:[{error:'AI_PLANNER_UNAVAILABLE',telemetry:{attempts:[{provider:'google-gemini',status:429},{provider:'groq',status:429},{provider:'cloudflare-workers-ai',status:0}]}}]}});

test('429 and transient provider exhaustion classify as PROVIDER_NOISE',()=>{
  assert.equal(classifyProviderNoise({ok:false,status:429,json:{}}),true);
  assert.equal(classifyProviderNoise(noise()),true);
});

test('a valid model response with a failed cognitive check is not provider noise',()=>{
  assert.equal(classifyProviderNoise(cognitiveFail()),false);
  assert.deepEqual(cognitiveCheckResult(cognitiveFail(),{checkCount:2,requireCognitiveProbe:true}).failedChecks,['a']);
});

test('one cognitive miss followed by pass does not fail the gate',async()=>{
  const rows=[cognitiveFail(),success()];
  const result=await runCognitiveGate({request:async()=>rows.shift(),scenario:'x',checkCount:2,requireCognitiveProbe:true,sleepFn:async()=>{}});
  assert.equal(result.classification,'PASS_AFTER_RETRY');
  assert.equal(result.valid_failures,1);
});

test('two valid cognitive misses fail even with provider noise between them',async()=>{
  const rows=[cognitiveFail(),noise(),cognitiveFail()];
  const result=await runCognitiveGate({request:async()=>rows.shift(),scenario:'x',checkCount:2,requireCognitiveProbe:true,sleepFn:async()=>{}});
  assert.equal(result.classification,'COGNITIVE_FAILURE');
  assert.equal(result.valid_failures,2);
});

test('provider noise alone never becomes a cognitive failure',async()=>{
  const result=await runCognitiveGate({request:async()=>noise(),scenario:'x',checkCount:2,requireCognitiveProbe:true,sleepFn:async()=>{}});
  assert.equal(result.classification,'PROVIDER_NOISE');
  assert.equal(result.valid_failures,0);
});
