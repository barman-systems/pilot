import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretConversationTurnV3,_v3InterpreterTest} from '../api/_dabbir-conversation-v3-interpreter.js';

const GATEWAY='https://ai-gateway.vercel.sh/v1/chat/completions';
const validGreeting=()=>({intent:'SUPPORT',role:'GREETING',confidence:1,service_candidate:null,entities:[],side_questions:[],invalidated_fields:[],requested_action:'NONE',confirmation:null});
const response=(content=JSON.stringify(validGreeting()),model='openai/gpt-5.6-luna')=>new Response(JSON.stringify({model,choices:[{message:{content},finish_reason:'stop'}]}),{status:200,headers:{'content-type':'application/json'}});
function context(){return {business:{id:'10000000-0000-4000-8000-000000000001',business_type:'car_wash',timezone:'Asia/Dubai'},conversation:{id:'20000000-0000-4000-8000-000000000001',branch_id:'30000000-0000-4000-8000-000000000001',language:'ar'},batch:{last_message_at:'2026-09-13T13:24:14Z'},batch_messages:[{id:'40000000-0000-4000-8000-000000000001',body:'هلا',created_at:'2026-09-13T13:24:14Z'}],services:[],activity_profile:{services:[]}};}

const gatewayEnv={VERCEL_ENV:'production',AI_GATEWAY_API_KEY:'test'};
const allProviders={...gatewayEnv,GEMINI_API_KEY:'test',GROQ_API_KEY:'test',CLOUDFLARE_API_TOKEN:'test',CLOUDFLARE_ACCOUNT_ID:'test'};

test('V3 Gateway fallback requests the exact schema on the dedicated structured model',async()=>{
  let body=null;
  const out=await interpretConversationTurnV3({context:context(),env:gatewayEnv,fetchImpl:async(url,options)=>{
    assert.equal(url,GATEWAY);body=JSON.parse(options.body);return response();
  }});
  assert.equal(out.provider,'vercel-ai-gateway');
  assert.equal(out.model,'openai/gpt-5.6-luna');
  assert.equal(out.proposal.dialogue.message_role,'GREETING');
  assert.equal(body.model,'openai/gpt-5.6-luna');
  assert.equal(body.response_format.type,'json_schema');
  assert.equal(body.response_format.json_schema.name,'dabbir_v3_interpretation');
  assert.equal(body.response_format.json_schema.strict,true);
  assert.deepEqual(body.response_format.json_schema.schema.required.sort(),['confidence','confirmation','entities','intent','invalidated_fields','requested_action','role','service_candidate','side_questions'].sort());
});

test('live provider shape uses one structured Gateway-primary request and leaves direct recovery untouched',async()=>{
  const endpoints=[];let gatewayBody=null;
  const out=await interpretConversationTurnV3({context:context(),env:allProviders,fetchImpl:async(url,options)=>{
    endpoints.push(url);
    if(url===GATEWAY){gatewayBody=JSON.parse(options.body);return response();}
    throw new Error('direct provider must not be touched after healthy Gateway');
  }});
  assert.equal(endpoints.length,1);
  assert.equal(endpoints[0],GATEWAY);
  assert.equal(out.telemetry.request_count,1);
  assert.equal(out.provider,'vercel-ai-gateway');
  assert.equal(gatewayBody.response_format.type,'json_schema');
  assert.equal(gatewayBody.model,_v3InterpreterTest.V3_GATEWAY_MODEL);
});

test('invalid HTTP-200 Gateway semantics stay inside the four-request cap and use eligible direct recovery',async()=>{
  const endpoints=[];
  await assert.rejects(interpretConversationTurnV3({context:context(),env:allProviders,fetchImpl:async(url)=>{
    endpoints.push(url);
    if(url.includes('generativelanguage.googleapis.com'))throw new Error('retired Gemini recovery must not be called');
    if(url.includes('groq.com'))return new Response('{}',{status:429});
    if(url.includes('cloudflare.com'))throw new TypeError('simulated network failure');
    if(url===GATEWAY)return response(JSON.stringify({unexpected:true}));
    throw new Error('unexpected endpoint');
  }}),error=>{
    assert.equal(error.code,'V3_INTERPRETER_UNAVAILABLE');
    assert.equal(error.telemetry.request_count,_v3InterpreterTest.V3_PROVIDER_MAX_REQUESTS);
    assert.equal(error.telemetry.skipped_attempts.some(x=>x.reason==='SEMANTIC_PROVIDER_BUDGET'),false);
    return true;
  });
  assert.equal(endpoints.length,_v3InterpreterTest.V3_PROVIDER_MAX_REQUESTS);
  assert.equal(endpoints.filter(x=>x===GATEWAY).length,2,'Gateway primary and its bounded secondary model consume only the first two requests');
  assert.equal(endpoints.some(x=>x.includes('generativelanguage.googleapis.com')),false);
  assert.equal(endpoints.some(x=>x.includes('groq.com')),true);
  assert.equal(endpoints.some(x=>x.includes('cloudflare.com')),true,'Cloudflare remains eligible after retired Gemini is skipped');
});
