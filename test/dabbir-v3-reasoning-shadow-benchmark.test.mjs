import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runV3ReasoningShadowBenchmark, V3_REASONING_SHADOW_CASES, V3_REASONING_SHADOW_MODEL } from '../api/_dabbir-v3-reasoning-shadow-benchmark.js';

const core=fs.readFileSync(new URL('../api/_dabbir-v3-reasoning-shadow-benchmark.js',import.meta.url),'utf8');
const endpoint=fs.readFileSync(new URL('../api/dabbir-v3-reasoning-shadow-benchmark.js',import.meta.url),'utf8');
const live=fs.readFileSync(new URL('./dabbir-v3-reasoning-shadow-live.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/dabbir-v3-reasoning-shadow-benchmark.yml',import.meta.url),'utf8');
const base=(kind,extra={})=>({kind,tool:null,reason:'TEST',question:null,answer_basis:'NONE',resume_goal:false,proposal:null,...extra});
const proposal=(goal,selected)=>base('PROPOSE',{proposal:{goal,selected_option:selected,exact_time:null,needs_revalidation:true,reference_basis:'VERIFIED_CONTEXT'}});

function decisionFor(id){
  if(['temporal-early','temporal-after-four','temporal-nearest','temporal-any-tomorrow'].includes(id))return proposal('BOOK_SERVICE','option-1');
  if(['reference-same-car','reference-same-location'].includes(id))return base('ASK',{question:'next detail'});
  if(id==='service-fallback')return proposal('BOOK_SERVICE','standard-1');
  if(id==='worker-preference')return proposal('BOOK_SERVICE','preferred-worker-1');
  if(['side-question-continue','new-service-side-topic'].includes(id))return base('ANSWER',{answer_basis:'VERIFIED_CONTEXT',resume_goal:true});
  if(id==='reschedule-nearest')return proposal('RESCHEDULE_BOOKING','option-1');
  if(id==='correction-second')return base('PROPOSE',{proposal:{goal:'BOOK_SERVICE',selected_option:'option-2',exact_time:null,needs_revalidation:true,reference_basis:'PRESENTED_OPTIONS'}});
  if(id==='budget-cap')return proposal('BOOK_SERVICE','under-cap');
  if(id==='slot-race')return base('PROPOSE',{proposal:{goal:'BOOK_SERVICE',selected_option:'option-1',exact_time:null,needs_revalidation:true,reference_basis:'PRESENTED_OPTIONS'}});
  if(['ambiguous-money','conflicting-constraints','impossible-request','unsupported-service','stale-memory','tool-failure'].includes(id))return base('ASK',{question:'clarify'});
  return base('SAFE_STOP');
}

function response(decision){
  const payload={choices:[{message:{content:JSON.stringify(decision)}}],usage:{prompt_tokens:10,completion_tokens:5,completion_tokens_details:{reasoning_tokens:0}},providerMetadata:{gateway:{cost:0.0001}}};
  return Promise.resolve(new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}}));
}

function mockFetch(url,options){
  const body=JSON.parse(options.body);const input=JSON.parse(body.messages[1].content);const message=input.customer_message;
  const tc=V3_REASONING_SHADOW_CASES.find(x=>x.message===message);assert.ok(tc,'case must resolve only from customer message, not hidden benchmark id');
  return response(decisionFor(tc.id));
}

function unsafeSlotFetch(){
  return response(base('PROPOSE',{proposal:{goal:'BOOK_SERVICE',selected_option:'option-1',exact_time:null,needs_revalidation:false,reference_basis:'PRESENTED_OPTIONS'}}));
}

function inventedEarlyTimeFetch(){
  return response(base('PROPOSE',{proposal:{goal:'BOOK_SERVICE',selected_option:'option-1',exact_time:'06:00',needs_revalidation:true,reference_basis:'NONE'}}));
}

function sideQuestionProposalFetch(){
  return response(base('PROPOSE',{proposal:{goal:'BOOK_SERVICE',selected_option:'option-1',exact_time:null,needs_revalidation:true,reference_basis:'VERIFIED_CONTEXT'}}));
}

test('shadow benchmark is frozen at twenty synthetic cases and uses canonical gateway BENCHMARK authority',()=>{
  assert.equal(V3_REASONING_SHADOW_CASES.length,20);assert.equal(V3_REASONING_SHADOW_MODEL,'openai/gpt-5.6-luna');
  assert.match(core,/AI_PROVIDER_ATTEMPT_TYPES\.BENCHMARK/);assert.match(core,/reliableAiProviderFetch/);assert.match(core,/healthStore:null/);
  assert.doesNotMatch(core,/SUPABASE_SERVICE_ROLE_KEY|dabbir_semantic_execute|insert\s+into|update\s+public\.dabbir_appointments/i);
});

test('benchmark never leaks oracle expectations or case ids to the model',()=>{
  assert.doesNotMatch(core,/expected_safety_shape/);
  assert.doesNotMatch(core,/benchmark_case:testCase\.id/);
  assert.match(core,/source:'CURRENT_DABBIR_SEMANTIC_STATE'/);
});

test('code pre-grounds structured state and guards mutation prerequisites independently of the model',()=>{
  assert.match(core,/function preGroundingPlan/);
  assert.match(core,/PRESENTATION_PROOF_REQUIRED/);
  assert.match(core,/REVALIDATION_REQUIRED/);
  assert.match(core,/MUTATION_REVALIDATION_REQUIRED/);
  assert.match(core,/OPTION_NOT_GROUNDED/);
  assert.match(core,/EXACT_TIME_CANONICALIZED/);
  assert.match(core,/SIDE_QUESTION_CONTINUITY/);
});

test('endpoint is preview-only branch-pinned same-origin synthetic and scope-gated',()=>{
  for(const token of ['PREVIEW_BENCHMARK_ONLY','BENCHMARK_BRANCH_MISMATCH','requireSameOrigin','BENCHMARK_SCOPE_REQUIRED','SYNTHETIC_MODE_REQUIRED'])assert.match(endpoint,new RegExp(token));
  assert.doesNotMatch(endpoint,/getVerifiedUser|accessTokenFromRequest|SUPABASE_SERVICE_ROLE_KEY/);
});

test('protected live runner is exact-SHA and workflow has only read plus OIDC authority',()=>{
  assert.match(live,/EXPECTED_BENCHMARK_SHA/);assert.match(live,/VERCEL_PROTECTED_ACCESS_REQUIRED/);assert.match(live,/x-dabbir-benchmark-scope/);
  assert.match(workflow,/feat\/v3-reasoning-shadow-benchmark-v1/);assert.match(workflow,/contents:\s*read/);assert.match(workflow,/id-token:\s*write/);
  assert.doesNotMatch(workflow,/contents:\s*write|pull-requests:\s*write|packages:\s*write/);
});

test('production is structurally forbidden',async()=>{
  await assert.rejects(()=>runV3ReasoningShadowBenchmark({env:{VERCEL_ENV:'production'},fetchImpl:mockFetch}),/V3_REASONING_SHADOW_PRODUCTION_FORBIDDEN/);
});

test('synthetic runner measures quality latency tokens cost and never unlocks passive production shadow',async()=>{
  const result=await runV3ReasoningShadowBenchmark({env:{VERCEL_ENV:'preview',AI_GATEWAY_API_KEY:'test'},fetchImpl:mockFetch});
  assert.equal(result.cases,20);assert.equal(result.metrics.wrong_mutations,0);assert.equal(result.metrics.unsupported_assumptions,0);
  assert.equal(result.metrics.task_completion_rate,1);assert.equal(result.model_calls,20);assert.ok(result.metrics.measured_gateway_cost_usd>0);
  assert.equal(result.promotion.passive_runtime_shadow_allowed,false);assert.equal(result.external_side_effects,false);assert.equal(result.production_routing_changed,false);assert.equal(result.real_customer_data_used,false);
});

test('unsafe slot proposal is stopped by code even when the model violates revalidation',async()=>{
  const slot=V3_REASONING_SHADOW_CASES.filter(x=>x.id==='slot-race');
  const result=await runV3ReasoningShadowBenchmark({env:{VERCEL_ENV:'preview',AI_GATEWAY_API_KEY:'test'},fetchImpl:unsafeSlotFetch,cases:slot});
  assert.equal(result.metrics.wrong_mutations,0);
  assert.equal(result.metrics.guard_interventions,1);
  assert.equal(result.results[0].final_kind,'ASK');
  assert.deepEqual(result.results[0].guard_codes,['MUTATION_REVALIDATION_REQUIRED']);
});

test('broad preference can never retain an invented exact time over grounded availability',async()=>{
  const early=V3_REASONING_SHADOW_CASES.filter(x=>x.id==='temporal-early');
  const result=await runV3ReasoningShadowBenchmark({env:{VERCEL_ENV:'preview',AI_GATEWAY_API_KEY:'test'},fetchImpl:inventedEarlyTimeFetch,cases:early});
  assert.equal(result.metrics.unsupported_assumptions,0);
  assert.equal(result.metrics.guard_interventions,1);
  assert.deepEqual(result.results[0].guard_codes,['EXACT_TIME_CANONICALIZED']);
  assert.equal(result.results[0].completed,true);
});

test('grounded side question cannot replace the active booking goal with a new proposal',async()=>{
  const side=V3_REASONING_SHADOW_CASES.filter(x=>x.id==='side-question-continue');
  const result=await runV3ReasoningShadowBenchmark({env:{VERCEL_ENV:'preview',AI_GATEWAY_API_KEY:'test'},fetchImpl:sideQuestionProposalFetch,cases:side});
  assert.equal(result.metrics.wrong_mutations,0);
  assert.equal(result.results[0].final_kind,'ANSWER');
  assert.equal(result.results[0].completed,true);
  assert.deepEqual(result.results[0].guard_codes,['SIDE_QUESTION_CONTINUITY']);
});
