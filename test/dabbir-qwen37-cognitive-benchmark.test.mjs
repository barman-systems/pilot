import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
 QWEN37_CANDIDATE_MODEL,
 QWEN37_CANDIDATE_PROVIDER,
 qwen37EvaluationEnvironment,
 qwen37CandidateMatches,
 qwen37StrictFetch,
} from '../api/_dabbir-qwen37-cognitive-probe.js';

const gateway='https://ai-gateway.vercel.sh/v1/chat/completions';

test('Qwen benchmark environment excludes every direct-provider credential',()=>{
 const source={
  GEMINI_API_KEY:'gemini-secret',GROQ_API_KEY:'groq-secret',CLOUDFLARE_API_TOKEN:'cf-secret',CLOUDFLARE_ACCOUNT_ID:'cf-account',
  AI_GATEWAY_API_KEY:'gateway-secret',VERCEL_ENV:'preview',SUPABASE_SERVICE_ROLE_KEY:'db-secret',DABBIR_AI_GATEWAY_MODEL:'wrong-model',
 };
 const selected=qwen37EvaluationEnvironment(source);
 assert.deepEqual(selected,{DABBIR_AI_GATEWAY_MODEL:QWEN37_CANDIDATE_MODEL,VERCEL_ENV:'preview',AI_GATEWAY_API_KEY:'gateway-secret'});
 assert.equal(selected.GEMINI_API_KEY,undefined);assert.equal(selected.GROQ_API_KEY,undefined);assert.equal(selected.CLOUDFLARE_API_TOKEN,undefined);
 assert.equal(selected.SUPABASE_SERVICE_ROLE_KEY,undefined);
 assert.throws(()=>qwen37EvaluationEnvironment({}),/QWEN37_GATEWAY_NOT_CONFIGURED/);
});

test('Qwen benchmark hard-pins Alibaba, disables reasoning for structured semantics, and blocks gateway fallback models',async()=>{
 const calls=[];
 const restricted=qwen37StrictFetch(async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});return new Response('{}',{status:200});});
 await restricted(gateway,{method:'POST',body:JSON.stringify({
  model:QWEN37_CANDIDATE_MODEL,response_format:{type:'json_object'},
  providerOptions:{gateway:{sort:'cost'},custom:{kept:true}},
 })});
 assert.equal(calls.length,1);
 const sent=calls[0].body;
 assert.equal(sent.model,QWEN37_CANDIDATE_MODEL);
 assert.deepEqual(sent.providerOptions.gateway,{sort:'cost',only:['alibaba'],order:['alibaba']});
 assert.deepEqual(sent.providerOptions.custom,{kept:true});
 assert.deepEqual(sent.reasoning,{effort:'none'});
 await assert.rejects(
  restricted(gateway,{method:'POST',body:JSON.stringify({model:'minimax/minimax-m2.7'})}),
  error=>error?.code==='QWEN37_CANDIDATE_FALLBACK_BLOCKED'
 );
 assert.equal(calls.length,1,'blocked fallback must never reach the gateway transport');
});

test('Qwen benchmark accepts only the exact provider and exact model on every turn',()=>{
 const good=[1,2,3].map(()=>({provider:QWEN37_CANDIDATE_PROVIDER,model:QWEN37_CANDIDATE_MODEL}));
 assert.equal(qwen37CandidateMatches(good),true);
 assert.equal(qwen37CandidateMatches([]),false);
 assert.equal(qwen37CandidateMatches([{provider:QWEN37_CANDIDATE_PROVIDER,model:'minimax/minimax-m2.7'}]),false);
 assert.equal(qwen37CandidateMatches([{provider:'google-gemini',model:QWEN37_CANDIDATE_MODEL}]),false);
 assert.equal(qwen37CandidateMatches([{provider:QWEN37_CANDIDATE_PROVIDER,model:QWEN37_CANDIDATE_MODEL,error:'timeout'}]),false);
});

test('authenticated synthetic endpoint exposes Qwen probe without changing the ordinary production route',()=>{
 const api=fs.readFileSync(new URL('../api/dabbir-ai.js',import.meta.url),'utf8');
 const core=fs.readFileSync(new URL('../api/_ai-core.js',import.meta.url),'utf8');
 assert.match(api,/requireSameOrigin\(req\)/);assert.match(api,/getVerifiedUser\(/);assert.match(api,/req\.body\?\.synthetic !== true/);
 assert.match(api,/qwen37_cognitive_dialogue/);assert.match(api,/probeQwen37CognitiveDialogue/);
 assert.doesNotMatch(core,/qwen3\.7-flash/,'production AI core must remain unchanged by the benchmark branch');
});

test('benchmark evidence scope explicitly forbids a production-default change',()=>{
 const doc=fs.readFileSync(new URL('../docs/audits/DABBIR_QWEN37_BENCHMARK_GATES_20260914.md',import.meta.url),'utf8');
 assert.match(doc,/does not authorize a Production model-routing change/);
 assert.match(doc,/wrong provider or wrong model/);
 assert.match(doc,/No prompt\/schema relaxation/);
 assert.match(doc,/OFFLINE\/SHADOW -> FIXED REAL-MODEL PROBE -> FULL BENCHMARK -> PREVIEW\/CANARY -> PRODUCTION DEFAULT/);
});
