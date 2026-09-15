import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretSemanticMessage } from '../api/_dabbir-semantic-interpreter.js';
import { qwen37CanaryDecision, QWEN37_CANARY_MODEL } from '../api/_dabbir-qwen37-canary.js';

const proposal={action:'CHECK_AVAILABILITY',intent:'BOOKING',confidence:.98,risk_level:'LOW',service_name:null,knowledge_key:null,
  entities:[{entity:'date',value:'2026-09-09',evidence:'بكره',confidence:.99,correction:false},
    {entity:'time',value:'09:00',evidence:'9 الصبح',confidence:.99,correction:false}]};
const response=(content=JSON.stringify(proposal),status=200,model)=>new Response(JSON.stringify(status===200?{model,choices:[{message:{content},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:8}}:{}),{status,headers:{'content-type':'application/json'}});
const env={VERCEL_ENV:'production',AI_GATEWAY_API_KEY:'gateway-test',GROQ_API_KEY:'groq-test',SUPABASE_SERVICE_ROLE_KEY:'service-test-key'};
const control={enabled:true,percent:1,source:'TEST_CAPABILITY'};
const canaryControlLoader=async()=>control;
const providerHealthStore=null;
const meterFetchImpl=async(url,options={})=>{
  assert.match(String(url),/rpc\/dabbir_record_ai_usage_v1/);
  const body=JSON.parse(String(options.body||'{}'));
  assert.equal(body.p_provider,'vercel-ai-gateway');
  assert.equal(body.p_cost_mode,'GATEWAY_PRIMARY');
  assert.equal(body.p_cost_source,'VERCEL_REPORT_RECONCILIATION_REQUIRED');
  return new Response(JSON.stringify({ok:true,outcome_id:'33333333-3333-4333-8333-333333333333'}),{status:200,headers:{'content-type':'application/json'}});
};

function identity(selected=true){
  for(let i=0;i<10000;i++){
    const meteringContext={business:{id:'10000000-0000-4000-8000-000000000001'},conversation:{id:`conv-${i}`},batch_message_created_at:'2026-09-14T00:00:00Z'};
    const decision=qwen37CanaryDecision({control,meteringContext});
    if(decision.selected===selected)return {meteringContext,decision};
  }
  throw new Error('CANARY_TEST_IDENTITY_NOT_FOUND');
}

const meteredArgs={env,canaryControlLoader,meterFetchImpl,providerHealthStore};

test('selected conversation is served by isolated Qwen3.7 semantic canary and metered',async()=>{
  const {meteringContext,decision}=identity(true);
  const seen=[];
  const result=await interpretSemanticMessage({
    ...meteredArgs,message:'فاضين بكره 9 الصبح',context:{business:{id:meteringContext.business.id},conversation:{id:meteringContext.conversation.id}},meteringContext,
    fetchImpl:async(url,options)=>{
      const body=JSON.parse(options.body);seen.push({url,body});
      assert.match(url,/ai-gateway/);
      assert.equal(body.model,QWEN37_CANARY_MODEL);
      assert.deepEqual(body.providerOptions.gateway.only,['alibaba']);
      assert.deepEqual(body.providerOptions.gateway.order,['alibaba']);
      assert.deepEqual(body.reasoning,{effort:'none'});
      assert.equal(body.response_format.type,'json_schema');
      return response(undefined,200,QWEN37_CANARY_MODEL);
    },
  });
  assert.equal(seen.length,1);
  assert.equal(result.provider,'vercel-ai-gateway');
  assert.equal(result.model,QWEN37_CANARY_MODEL);
  assert.equal(result.telemetry.usage_meter.state,'VERIFIED');
  assert.equal(result.telemetry.qwen37_canary.selected,true);
  assert.equal(result.telemetry.qwen37_canary.bucket,decision.bucket);
  assert.equal(result.telemetry.qwen37_canary.source,'TEST_CAPABILITY');
  assert.equal(result.telemetry.qwen37_canary.fallback,false);
});

test('failed Qwen3.7 candidate is discarded and the metered control Gateway gets a fresh fallback attempt',async()=>{
  const {meteringContext}=identity(true);
  const seen=[];
  const result=await interpretSemanticMessage({
    ...meteredArgs,message:'فاضين بكره 9 الصبح',context:{business:{id:meteringContext.business.id},conversation:{id:meteringContext.conversation.id}},meteringContext,
    fetchImpl:async(url,options)=>{
      const body=JSON.parse(options.body);seen.push({url,body});
      assert.match(url,/ai-gateway/);
      if(body.model===QWEN37_CANARY_MODEL)return response('',500,QWEN37_CANARY_MODEL);
      return response(undefined,200,body.model);
    },
  });
  assert.equal(seen.length,2);
  assert.equal(seen[0].body.model,QWEN37_CANARY_MODEL);
  assert.notEqual(seen[1].body.model,QWEN37_CANARY_MODEL);
  assert.equal(result.provider,'vercel-ai-gateway');
  assert.equal(result.telemetry.usage_meter.state,'VERIFIED');
  assert.equal(result.telemetry.qwen37_canary.selected,true);
  assert.equal(result.telemetry.qwen37_canary.fallback,true);
  assert.match(result.telemetry.qwen37_canary.failure,/QWEN37_CANARY_RESULT_REJECTED|PROVIDER/);
});

test('non-selected conversation follows the metered Gateway-primary control chain unchanged',async()=>{
  const {meteringContext}=identity(false);
  const endpoints=[];
  const result=await interpretSemanticMessage({
    ...meteredArgs,message:'فاضين بكره 9 الصبح',context:{business:{id:meteringContext.business.id},conversation:{id:meteringContext.conversation.id}},meteringContext,
    fetchImpl:async(url,options)=>{endpoints.push(url);assert.match(url,/ai-gateway/);return response(undefined,200,JSON.parse(options.body).model);},
  });
  assert.equal(endpoints.length,1);
  assert.equal(result.provider,'vercel-ai-gateway');
  assert.equal(result.telemetry.usage_meter.state,'VERIFIED');
  assert.equal(result.telemetry.qwen37_canary.selected,false);
  assert.equal(result.telemetry.qwen37_canary.fallback,false);
});

test('control loader failure fails closed to the metered Gateway-primary control chain',async()=>{
  const {meteringContext}=identity(true);
  const endpoints=[];
  const result=await interpretSemanticMessage({
    ...meteredArgs,message:'فاضين بكره 9 الصبح',context:{business:{id:meteringContext.business.id},conversation:{id:meteringContext.conversation.id}},meteringContext,env,
    canaryControlLoader:async()=>{throw new Error('db unavailable');},
    fetchImpl:async(url,options)=>{endpoints.push(url);assert.match(url,/ai-gateway/);return response(undefined,200,JSON.parse(options.body).model);},
  });
  assert.equal(endpoints.length,1);
  assert.equal(result.provider,'vercel-ai-gateway');
  assert.equal(result.telemetry.usage_meter.state,'VERIFIED');
  assert.equal(result.telemetry.qwen37_canary.selected,false);
  assert.equal(result.telemetry.qwen37_canary.source,'CAPABILITY_CONTROL_LOADER_FAILED');
});
