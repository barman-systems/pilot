import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {V3_REASONING_OBSERVER_POLICY,reasoningObserverConfig,shouldSampleReasoningObservation,buildReasoningObserverProjection,sanitizeReasoningObservationOutcome,reasoningObservationLog,assertReasoningObserverBoundary} from '../api/_dabbir-v3-reasoning-observer.js';

const context={
  business:{id:'business-secret',business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED',name:'Secret Business'},
  conversation:{id:'conversation-secret',language:'ar',branch_id:'branch-secret'},
  customer:{id:'customer-secret',phone:'+971500000000',email:'owner@example.com',name:'Secret Customer'},
  batch:{id:'batch-secret'},
  batch_messages:[{body:'باجر أول الصباح، سيارتي رقم 12345 واتصل على +971500000000'}],
  activity_profile:{services:[{service_id:'service-1',name_ar:'غسيل خارجي',price:40,currency_code:'AED',supported_actions:['BOOK']}]},
};
const load={semantic_state:{goal:'BOOK_SERVICE',intent:'BOOKING',missing_fields:['time'],pending_action:'CHECK_AVAILABILITY',entities:{service:{value:'service-1',source:'CUSTOMER_STATED',status:'active'},date:{value:'2026-09-16',source:'CUSTOMER_STATED',status:'active'},vehicle:{value:'private-vehicle',source:'CUSTOMER_MEMORY',status:'active'},location:{value:'private-location',source:'CUSTOMER_STATED',status:'active'}}}};

test('observer is off by default; kill switch dominates every requested mode',()=>{
  assert.equal(reasoningObserverConfig({VERCEL_ENV:'production'}).enabled,false);
  assert.equal(reasoningObserverConfig({VERCEL_ENV:'preview',DABBIR_V3_REASONING_OBSERVER_MODE:'preview',DABBIR_V3_REASONING_OBSERVER_SAMPLE_PERMILLE:'100'}).enabled,true);
  assert.equal(reasoningObserverConfig({VERCEL_ENV:'preview',DABBIR_V3_REASONING_OBSERVER_MODE:'preview',DABBIR_V3_REASONING_OBSERVER_SAMPLE_PERMILLE:'100',DABBIR_V3_REASONING_OBSERVER_KILL_SWITCH:'1'}).enabled,false);
});

test('production sampling requires explicit observer-only ack and is hard-capped at one percent',()=>{
  const denied=reasoningObserverConfig({VERCEL_ENV:'production',DABBIR_V3_REASONING_OBSERVER_MODE:'sampled',DABBIR_V3_REASONING_OBSERVER_SAMPLE_PERMILLE:'1000'});
  assert.equal(denied.enabled,false);assert.equal(denied.sample_permille,V3_REASONING_OBSERVER_POLICY.max_production_sample_permille);
  const allowed=reasoningObserverConfig({VERCEL_ENV:'production',DABBIR_V3_REASONING_OBSERVER_MODE:'sampled',DABBIR_V3_REASONING_OBSERVER_SAMPLE_PERMILLE:'1000',DABBIR_V3_REASONING_OBSERVER_PRODUCTION_ACK:V3_REASONING_OBSERVER_POLICY.production_ack});
  assert.equal(allowed.enabled,true);assert.equal(allowed.sample_permille,10);
});

test('sampling is deterministic and impossible when disabled',()=>{
  const off=reasoningObserverConfig({VERCEL_ENV:'production'});assert.equal(shouldSampleReasoningObservation({batchId:'batch-a',config:off}),false);
  const on={enabled:true,sample_permille:500};
  assert.equal(shouldSampleReasoningObservation({batchId:'batch-a',config:on}),shouldSampleReasoningObservation({batchId:'batch-a',config:on}));
});

test('projection minimizes authority and excludes direct customer/business identity and sensitive semantic references',()=>{
  const p=buildReasoningObserverProjection({context,load});const text=JSON.stringify(p);
  for(const secret of ['business-secret','conversation-secret','customer-secret','owner@example.com','Secret Customer','Secret Business','private-vehicle','private-location'])assert.equal(text.includes(secret),false,secret);
  assert.equal(p.authority.customer_visible,false);assert.equal(p.authority.mutation_authority,false);assert.equal(p.authority.execution_authority,false);
  assert.equal(p.semantic.entities.service.value,'service-1');assert.equal(p.semantic.entities.vehicle,undefined);assert.equal(p.semantic.entities.location,undefined);
  assert.ok(Buffer.byteLength(text,'utf8')<=V3_REASONING_OBSERVER_POLICY.max_input_bytes);
});

test('telemetry log never emits raw customer message or projection payload',()=>{
  const p=buildReasoningObserverProjection({context,load});
  const log=reasoningObservationLog({batchId:'batch-secret',projection:p,outcome:{kind:'PROPOSE',goal:'BOOK_SERVICE',provider:'openai',model:'gpt-5.6-luna',latency_ms:1200,cost_usd:.0007,confidence:.91,guard_codes:['READ_ONLY']}});
  const text=JSON.stringify(log);
  assert.equal(text.includes('باجر'),false);assert.equal(text.includes('+971500000000'),false);assert.equal(text.includes('batch-secret'),false);
  assert.equal(log.customer_visible,false);assert.equal(log.mutation_authority,false);assert.equal(log.execution_authority,false);assert.equal(log.budget_ok,true);
});

test('outcome surface is bounded and authority/budget assertions fail closed',()=>{
  const safe=sanitizeReasoningObservationOutcome({kind:'PROPOSE',goal:'BOOK_SERVICE',tool:'evil',latency_ms:3999,cost_usd:.001,confidence:7,guard_codes:['A']});
  assert.equal(safe.tool,null);assert.equal(safe.confidence,1);assert.equal(assertReasoningObserverBoundary(safe),true);
  assert.throws(()=>assertReasoningObserverBoundary({...safe,mutation_authority:true}),/AUTHORITY_VIOLATION/);
  assert.throws(()=>assertReasoningObserverBoundary({...safe,latency_ms:5000}),/BUDGET_EXCEEDED/);
});

test('observer module contains no domain mutation or outbound-delivery authority',()=>{
  const source=fs.readFileSync(new URL('../api/_dabbir-v3-reasoning-observer.js',import.meta.url),'utf8');
  for(const pattern of [/dabbir_semantic_commit_v2/,/dabbir_semantic_execute_v2/,/dabbir_semantic_set_pending_v2/,/\bdeliver\s*\(/,/\bfinish\s*\(/,/\bhandoff\s*\(/])assert.doesNotMatch(source,pattern);
});
