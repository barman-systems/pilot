import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  QWEN37_BENCHMARK_MODEL,
  qwen37BenchmarkEnvironment,
  qwen37BenchmarkFetch,
  runQwen37Benchmark,
} from '../api/_dabbir-qwen37-benchmark.js';

const gateway='https://ai-gateway.vercel.sh/v1/chat/completions';

test('benchmark environment isolates Qwen from every configured direct Production provider',()=>{
  const source={
    VERCEL_ENV:'preview',AI_GATEWAY_API_KEY:'gateway-test',
    GEMINI_API_KEY:'gemini-private',GROQ_API_KEY:'groq-private',
    CLOUDFLARE_API_TOKEN:'cf-private',CLOUDFLARE_ACCOUNT_ID:'cf-account',
    SUPABASE_SERVICE_ROLE_KEY:'db-private',DABBIR_AI_GATEWAY_MODEL:'old-model',
  };
  const selected=qwen37BenchmarkEnvironment(source);
  assert.deepEqual(selected,{VERCEL_ENV:'preview',DABBIR_AI_GATEWAY_MODEL:'alibaba/qwen3.7-flash',AI_GATEWAY_API_KEY:'gateway-test'});
  assert.equal(selected.GEMINI_API_KEY,undefined);
  assert.equal(selected.SUPABASE_SERVICE_ROLE_KEY,undefined);
  assert.equal(source.DABBIR_AI_GATEWAY_MODEL,'old-model');
});

test('benchmark pins Qwen to strict schema, low reasoning and bounded output headroom',async()=>{
  let captured=null;
  const wrapped=qwen37BenchmarkFetch(async(_url,options)=>{captured=JSON.parse(options.body);return new Response('{}',{status:200,headers:{'content-type':'application/json'}});});
  await wrapped(gateway,{method:'POST',body:JSON.stringify({model:QWEN37_BENCHMARK_MODEL,messages:[],max_tokens:1600,response_format:{type:'json_object'}})});
  assert.equal(captured.model,'alibaba/qwen3.7-flash');
  assert.deepEqual(captured.reasoning,{effort:'low'});
  assert.equal(captured.max_tokens,2400);
  assert.equal(captured.response_format.type,'json_schema');
  assert.equal(captured.response_format.json_schema.name,'dabbir_semantic_interpretation');
  assert.equal(captured.response_format.json_schema.strict,true);
  assert.equal(captured.response_format.json_schema.schema.additionalProperties,false);
});

test('benchmark fetch fails closed if the gateway model drifts',async()=>{
  const wrapped=qwen37BenchmarkFetch(async()=>new Response('{}',{status:200}));
  await assert.rejects(()=>wrapped(gateway,{body:JSON.stringify({model:'other/model'})}),/MODEL_DRIFT/);
});

test('benchmark can never run under the Production Vercel environment',async()=>{
  await assert.rejects(()=>runQwen37Benchmark({env:{VERCEL_ENV:'production',AI_GATEWAY_API_KEY:'test'}}),/PRODUCTION_FORBIDDEN/);
});

test('benchmark endpoint is preview-only, branch-pinned, same-origin, synthetic and scope-gated',()=>{
  const source=fs.readFileSync(new URL('../api/dabbir-qwen37-benchmark.js',import.meta.url),'utf8');
  for(const token of ['PREVIEW_BENCHMARK_ONLY','BENCHMARK_BRANCH_MISMATCH','requireSameOrigin','BENCHMARK_SCOPE_REQUIRED','SYNTHETIC_MODE_REQUIRED'])assert.match(source,new RegExp(token));
  assert.doesNotMatch(source,/getVerifiedUser|accessTokenFromRequest|SUPABASE_SERVICE_ROLE_KEY/);
});

test('live benchmark runner never bootstraps or mutates Production QA identities',()=>{
  const source=fs.readFileSync(new URL('./dabbir-qwen37-live-benchmark.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/barman-qa-suite-runner|dabbir_ai_qa_bootstrap|dabbir_ai_qa_cleanup|SUPABASE/);
  assert.match(source,/PRODUCTION_MUTATIONS=0/);
  assert.match(source,/x-dabbir-benchmark-scope/);
});
