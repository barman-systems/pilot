import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {actualGatewayCost} from '../api/_dabbir-whatsapp-ai-meter.js';

test('missing or malformed gateway cost remains unknown instead of verified zero',()=>{
  const absent=new Response('{}');
  assert.equal(actualGatewayCost({},absent),null);
  for(const cost of [null,undefined,'','  ',false,true,[],{},'invalid',-1,Infinity]){
    assert.equal(actualGatewayCost({usage:{cost}},absent),null);
  }
  assert.equal(actualGatewayCost({usage:{cost:null}},new Response('{}',{headers:{'x-vercel-ai-gateway-cost':'0.0012'}})),.0012);
});
test('explicit numeric zero is valid provider cost evidence',()=>{
  assert.equal(actualGatewayCost({usage:{cost:0}},new Response('{}')),0);
  assert.equal(actualGatewayCost({},new Response('{}',{headers:{'x-vercel-ai-gateway-cost':'0'}})),0);
});

const meter=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-meter.js',import.meta.url),'utf8');
const whatsapp=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-core.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260907133700_dabbir_ai_customer_cost_metering_v1.sql',import.meta.url),'utf8');

test('WhatsApp AI routes through the per-business meter',()=>{
  assert.match(whatsapp,/\.\/_dabbir-whatsapp-ai-meter\.js/);
  assert.match(whatsapp,/business:\{id:clean\(context\?\.business\?\.id/);
  assert.match(whatsapp,/conversation:\{id:clean\(context\?\.conversation\?\.id/);
  assert.match(whatsapp,/batch_message_created_at/);
});

test('meter preserves paid fallback and attributes Vercel spend to the business',()=>{
  assert.match(meter,/provider==='vercel-ai-gateway'/);
  assert.match(meter,/PAID_FALLBACK/);
  assert.match(meter,/user:identity\.businessId/);
  assert.match(meter,/channel:whatsapp/);
  assert.match(meter,/dabbir_record_ai_usage_v1/);
  assert.match(meter,/VERCEL_REPORT_RECONCILIATION_REQUIRED/);
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
    for(const network of [false,true])await generateDABBIRAiReply({project:'dabbir_businesses',message:'PRIVATE_CUSTOMER_TEXT',businessContext:'PRIVATE_BUSINESS_CONTEXT',env:{GROQ_API_KEY:'TEST_CREDENTIAL_NEVER_LOG'},fetchImpl:async()=>{if(network)throw new Error('TEST_CREDENTIAL_NEVER_LOG');return new Response('{}',{status:429});}});
  }finally{console.warn=warn;}
  const raw=JSON.stringify(logs);assert.match(raw,/dabbir_whatsapp_ai_provider_chain_failed/);assert.match(raw,/429/);assert.match(raw,/NETWORK_ERROR/);assert.doesNotMatch(raw,/PRIVATE_|TEST_CREDENTIAL|https:/);
});
