import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {actualGatewayCost,generateDABBIRAiReply} from '../api/_dabbir-whatsapp-ai-meter.js';

test('synthetic provider telemetry preserves unknown cost and reports only actual token evidence',async()=>{
 for(const usage of [undefined,{prompt_tokens:12,completion_tokens:7},{prompt_tokens:null,completion_tokens:7}]){
  const r=await generateDABBIRAiReply({project:'dabbir_businesses',message:'مرحبا',env:{GROQ_API_KEY:'secret-test-only'},fetchImpl:async()=>new Response(JSON.stringify({model:'existing-model',choices:[{message:{content:'مرحبا'}}],usage}),{status:200})});
  assert.equal(r.ok,true);assert.equal(r.provider,'groq');assert.equal(r.telemetry.request_count,1);assert.equal(r.telemetry.actual_cost_usd,null);
  assert.deepEqual(r.telemetry.final_request_usage,usage?.prompt_tokens===12?{inputTokens:12,outputTokens:7,reasoningTokens:0}:null);
  assert.equal(r.telemetry.attempts[0].provider,'groq');assert.equal(r.telemetry.attempts[0].status,200);
  assert.doesNotMatch(JSON.stringify(r.telemetry),/secret-test|https:|مرحبا/);
 }
});

test('429 cooldown skips a known-limited direct provider on the next request without changing provider priority',async()=>{
  const calls=[];
  const env={GEMINI_API_KEY:'cooldown-gemini-credential',GROQ_API_KEY:'cooldown-groq-credential'};
  const fetchImpl=async url=>{
    const endpoint=String(url);calls.push(endpoint);
    if(endpoint.includes('generativelanguage.googleapis.com'))return new Response('{}',{status:429,headers:{'retry-after':'60'}});
    return new Response(JSON.stringify({model:'openai/gpt-oss-20b',choices:[{message:{content:'ok'}}],usage:{prompt_tokens:4,completion_tokens:2}}),{status:200});
  };
  const first=await generateDABBIRAiReply({project:'dabbir_businesses',message:'first',env,fetchImpl});
  assert.equal(first.ok,true);assert.deepEqual(first.telemetry.attempts.map(x=>`${x.provider}:${x.status}`),['google-gemini:429','groq:200']);
  assert.equal(first.telemetry.attempts[0].retry_after_ms,60_000);assert.equal(first.telemetry.attempts[0].cooldown_ms,60_000);
  calls.length=0;
  const second=await generateDABBIRAiReply({project:'dabbir_businesses',message:'second',env,fetchImpl});
  assert.equal(second.ok,true);assert.equal(calls.some(x=>x.includes('generativelanguage.googleapis.com')),false);
  assert.deepEqual(second.telemetry.attempts.map(x=>`${x.provider}:${x.status}`),['groq:200']);
  assert.ok(second.telemetry.skipped_attempts.some(x=>x.provider==='google-gemini'&&x.reason==='PROVIDER_429_COOLDOWN'&&x.retry_after_ms>0));
});

test('missing or malformed gateway cost remains unknown instead of verified zero',()=>{
  const absent=new Response('{}');
  assert.equal(actualGatewayCost({},absent),null);
  for(const cost of [null,undefined,'','  ',false,true,[],{},'invalid',-1,Infinity])assert.equal(actualGatewayCost({usage:{cost}},absent),null);
  assert.equal(actualGatewayCost({usage:{cost:null}},new Response('{}',{headers:{'x-vercel-ai-gateway-cost':'0.0012'}})),.0012);
});
test('explicit numeric zero is valid provider cost evidence',()=>{
  assert.equal(actualGatewayCost({usage:{cost:0}},new Response('{}')),0);
  assert.equal(actualGatewayCost({},new Response('{}',{headers:{'x-vercel-ai-gateway-cost':'0'}})),0);
});

const meter=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-meter.js',import.meta.url),'utf8');
const whatsapp=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-core.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../api/_dabbir-conversation-runtime.js',import.meta.url),'utf8');
const interpreter=fs.readFileSync(new URL('../api/_dabbir-semantic-interpreter.js',import.meta.url),'utf8');
const v3Interpreter=fs.readFileSync(new URL('../api/_dabbir-conversation-v3-interpreter.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260907133700_dabbir_ai_customer_cost_metering_v1.sql',import.meta.url),'utf8');

test('WhatsApp AI routes both legacy and V3 interpretation through the per-business meter',()=>{
  assert.match(whatsapp,/\.\/_dabbir-conversation-runtime\.js/);
  assert.match(runtime,/\.\/_dabbir-semantic-interpreter\.js/);
  assert.match(interpreter,/\.\/_dabbir-whatsapp-ai-meter\.js/);
  assert.match(v3Interpreter,/\.\/_dabbir-whatsapp-ai-meter\.js/);
  for(const source of [runtime,v3Interpreter]){
    assert.match(source,/meteringContext:\{business:\{id:c?\.?business\.id|meteringContext:\{business:\{id:context\?\.business\?\.id/);
    assert.match(source,/conversation:\{id:c?\.?conversation\.id|conversation:\{id:context\?\.conversation\?\.id/);
    assert.match(source,/batch_message_created_at/);
  }
});

test('meter preserves paid fallback and attributes Vercel spend to the business',()=>{
  assert.match(meter,/provider==='vercel-ai-gateway'/);
  assert.match(meter,/PAID_FALLBACK/);
  assert.match(meter,/user:identity\.businessId/);
  assert.match(meter,/channel:whatsapp/);
  assert.match(meter,/dabbir_record_ai_usage_v1/);
  assert.match(meter,/VERCEL_REPORT_RECONCILIATION_REQUIRED/);
  assert.match(meter,/PROVIDER_429_COOLDOWN/);
  assert.match(meter,/retry-after/);
  assert.match(meter,/skipped_attempts/);
  assert.doesNotMatch(meter,/actualCostUsd==null\?0/);
});

test('authoritative ledger exposes per-business channel provider model and explicit unpriced operations',()=>{
  for(const field of ['ai_channel','ai_provider','ai_model','ai_input_tokens','ai_output_tokens','ai_reasoning_tokens','ai_cost_source'])assert.match(migration,new RegExp(field));
  assert.match(migration,/dabbir_ai_customer_cost_monthly_v1/);
  assert.match(migration,/unpriced_operations/);
  assert.match(migration,/business_id/);
  assert.match(migration,/on conflict \(business_id,operation_key\) do update/i);
});

test('failed provider diagnostics include HTTP and network evidence without customer data or credentials',async()=>{
  const {generateDABBIRAiReply}=await import('../api/_dabbir-whatsapp-ai-meter.js');
  const logs=[],warn=console.warn;console.warn=(...args)=>logs.push(args);
  try{
    for(const network of [false,true])await generateDABBIRAiReply({project:'dabbir_businesses',message:'PRIVATE_CUSTOMER_TEXT',businessContext:'PRIVATE_BUSINESS_CONTEXT',env:{GROQ_API_KEY:network?'TEST_CREDENTIAL_NETWORK_NEVER_LOG':'TEST_CREDENTIAL_HTTP_NEVER_LOG'},fetchImpl:async()=>{if(network)throw new Error('TEST_CREDENTIAL_NEVER_LOG');return new Response('{}',{status:429});}});
  }finally{console.warn=warn;}
  const raw=JSON.stringify(logs);assert.match(raw,/dabbir_whatsapp_ai_provider_chain_failed/);assert.match(raw,/429/);assert.match(raw,/NETWORK_ERROR/);assert.doesNotMatch(raw,/PRIVATE_|TEST_CREDENTIAL|https:/);
});