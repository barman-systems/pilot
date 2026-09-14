import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  QWEN35_BENCHMARK_MODEL,
  qwen35BenchmarkEnvironment,
  qwen35BenchmarkFetch,
  runQwen35Benchmark,
} from '../api/_dabbir-qwen35-benchmark.js';

const gateway='https://ai-gateway.vercel.sh/v1/chat/completions';

test('Qwen3.5 benchmark isolates the candidate from configured Production providers',()=>{
  const source={
    VERCEL_ENV:'preview',AI_GATEWAY_API_KEY:'gateway-test',
    GEMINI_API_KEY:'gemini-private',GROQ_API_KEY:'groq-private',
    CLOUDFLARE_API_TOKEN:'cf-private',CLOUDFLARE_ACCOUNT_ID:'cf-account',
    SUPABASE_SERVICE_ROLE_KEY:'db-private',DABBIR_AI_GATEWAY_MODEL:'old-model',
  };
  const selected=qwen35BenchmarkEnvironment(source);
  assert.deepEqual(selected,{VERCEL_ENV:'preview',DABBIR_AI_GATEWAY_MODEL:'alibaba/qwen3.5-flash',AI_GATEWAY_API_KEY:'gateway-test'});
  assert.equal(selected.GEMINI_API_KEY,undefined);
  assert.equal(selected.SUPABASE_SERVICE_ROLE_KEY,undefined);
});

test('Qwen3.5 benchmark uses JSON object in non-thinking mode',async()=>{
  let captured=null;
  const wrapped=qwen35BenchmarkFetch(async(_url,options)=>{captured=JSON.parse(options.body);return new Response('{}',{status:200,headers:{'content-type':'application/json'}});});
  await wrapped(gateway,{method:'POST',body:JSON.stringify({model:QWEN35_BENCHMARK_MODEL,messages:[],max_tokens:2400,response_format:{type:'text'}})});
  assert.equal(captured.model,'alibaba/qwen3.5-flash');
  assert.deepEqual(captured.reasoning,{effort:'none'});
  assert.equal(captured.max_tokens,1600);
  assert.deepEqual(captured.response_format,{type:'json_object'});
});

test('Qwen3.5 benchmark fails closed on model drift',async()=>{
  const wrapped=qwen35BenchmarkFetch(async()=>new Response('{}',{status:200}));
  await assert.rejects(()=>wrapped(gateway,{body:JSON.stringify({model:'other/model'})}),/MODEL_DRIFT/);
});

test('Qwen3.5 benchmark cannot run under Production',async()=>{
  await assert.rejects(()=>runQwen35Benchmark({env:{VERCEL_ENV:'production',AI_GATEWAY_API_KEY:'test'}}),/PRODUCTION_FORBIDDEN/);
});

test('Qwen3.5 endpoint is preview-only, branch-pinned, same-origin, synthetic and scope-gated',()=>{
  const source=fs.readFileSync(new URL('../api/dabbir-qwen35-benchmark.js',import.meta.url),'utf8');
  for(const token of ['PREVIEW_BENCHMARK_ONLY','BENCHMARK_BRANCH_MISMATCH','requireSameOrigin','BENCHMARK_SCOPE_REQUIRED','SYNTHETIC_MODE_REQUIRED'])assert.match(source,new RegExp(token));
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY|getVerifiedUser|accessTokenFromRequest/);
});
