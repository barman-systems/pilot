import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretSemanticMessage } from '../api/_dabbir-semantic-interpreter.js';
import { qwen37CanaryDecision, QWEN37_CANARY_MODEL } from '../api/_dabbir-qwen37-canary.js';

const proposal={action:'CHECK_AVAILABILITY',intent:'BOOKING',confidence:.98,risk_level:'LOW',service_name:null,knowledge_key:null,
  entities:[{entity:'date',value:'2026-09-09',evidence:'بكره',confidence:.99,correction:false},
    {entity:'time',value:'09:00',evidence:'9 الصبح',confidence:.99,correction:false}]};
const response=(content=JSON.stringify(proposal),status=200,model)=>new Response(JSON.stringify(status===200?{model,choices:[{message:{content},finish_reason:'stop'}]}:{}),{status,headers:{'content-type':'application/json'}});
const env={
  DABBIR_QWEN37_CANARY_ENABLED:'1',DABBIR_QWEN37_CANARY_PERCENT:'1',
  VERCEL_ENV:'production',AI_GATEWAY_API_KEY:'gateway-test',GROQ_API_KEY:'groq-test',
};

function identity(selected=true){
  for(let i=0;i<10000;i++){
    const meteringContext={business:{id:'biz-canary-test'},conversation:{id:`conv-${i}`},batch_message_created_at:'2026-09-14T00:00:00Z'};
    const decision=qwen37CanaryDecision({env,meteringContext});
    if(decision.selected===selected)return {meteringContext,decision};
  }
  throw new Error('CANARY_TEST_IDENTITY_NOT_FOUND');
}

test('selected conversation is served by isolated Qwen3.7 semantic canary',async()=>{
  const {meteringContext,decision}=identity(true);
  const seen=[];
  const result=await interpretSemanticMessage({
    message:'فاضين بكره 9 الصبح',context:{business:{id:meteringContext.business.id},conversation:{id:meteringContext.conversation.id}},meteringContext,env,
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
  assert.equal(result.telemetry.qwen37_canary.selected,true);
  assert.equal(result.telemetry.qwen37_canary.bucket,decision.bucket);
  assert.equal(result.telemetry.qwen37_canary.fallback,false);
});

test('failed Qwen3.7 candidate is discarded and control provider receives a fresh fallback attempt',async()=>{
  const {meteringContext}=identity(true);
  const endpoints=[];
  const result=await interpretSemanticMessage({
    message:'فاضين بكره 9 الصبح',context:{business:{id:meteringContext.business.id},conversation:{id:meteringContext.conversation.id}},meteringContext,env,
    fetchImpl:async(url,options)=>{
      endpoints.push(url);
      if(url.includes('ai-gateway')){
        const body=JSON.parse(options.body);
        assert.equal(body.model,QWEN37_CANARY_MODEL);
        return response('',500,QWEN37_CANARY_MODEL);
      }
      assert.match(url,/groq/);
      return response(undefined,200,'openai/gpt-oss-20b');
    },
  });
  assert.equal(endpoints.filter(x=>x.includes('ai-gateway')).length,1);
  assert.equal(endpoints.filter(x=>x.includes('groq')).length,1);
  assert.equal(result.provider,'groq');
  assert.equal(result.telemetry.qwen37_canary.selected,true);
  assert.equal(result.telemetry.qwen37_canary.fallback,true);
  assert.match(result.telemetry.qwen37_canary.failure,/QWEN37_CANARY_RESULT_REJECTED|PROVIDER/);
});

test('non-selected conversation follows the existing provider chain unchanged',async()=>{
  const {meteringContext}=identity(false);
  const endpoints=[];
  const result=await interpretSemanticMessage({
    message:'فاضين بكره 9 الصبح',context:{business:{id:meteringContext.business.id},conversation:{id:meteringContext.conversation.id}},meteringContext,env,
    fetchImpl:async(url)=>{endpoints.push(url);assert.match(url,/groq/);return response(undefined,200,'openai/gpt-oss-20b');},
  });
  assert.equal(endpoints.length,1);
  assert.equal(result.provider,'groq');
  assert.equal(result.telemetry.qwen37_canary.selected,false);
  assert.equal(result.telemetry.qwen37_canary.fallback,false);
});
