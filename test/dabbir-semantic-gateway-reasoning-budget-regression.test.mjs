import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretSemanticMessage} from '../api/_dabbir-semantic-interpreter.js';

const semanticProposal={
  action:'CHECK_AVAILABILITY',intent:'BOOKING',confidence:.98,risk_level:'LOW',service_name:null,knowledge_key:null,
  entities:[{entity:'vehicle',value:'station',evidence:'ستيشن',confidence:.99,correction:false}],
};
const okResponse=()=>new Response(JSON.stringify({
  model:'google/gemini-3.7-flash',
  choices:[{message:{content:JSON.stringify(semanticProposal)},finish_reason:'stop'}],
  usage:{prompt_tokens:1800,completion_tokens:700,completion_tokens_details:{reasoning_tokens:400}},
}),{status:200,headers:{'content-type':'application/json'}});

const allProviders={
  GEMINI_API_KEY:'direct-gemini',
  GROQ_API_KEY:'direct-groq',
  CLOUDFLARE_API_TOKEN:'direct-cloudflare',
  CLOUDFLARE_ACCOUNT_ID:'account',
  VERCEL_ENV:'production',
  AI_GATEWAY_API_KEY:'gateway',
  DABBIR_AI_GATEWAY_MODEL:'google/gemini-3.7-flash',
};

test('Gateway-primary Gemini semantic output gets reasoning and JSON headroom without touching direct providers',async()=>{
  const requests=[];
  const result=await interpretSemanticMessage({
    message:'ستيشن',context:{},env:allProviders,
    fetchImpl:async(url,options)=>{
      const body=JSON.parse(options.body);
      requests.push({url:String(url),body});
      assert.equal(String(url).includes('ai-gateway.vercel.sh'),true);
      assert.equal(body.model,'google/gemini-3.7-flash');
      assert.equal(body.response_format.type,'json_object');
      assert.equal(body.max_tokens,2400);
      assert.deepEqual(body.reasoning,{effort:'low'});
      return okResponse();
    },
  });

  assert.equal(result.provider,'vercel-ai-gateway');
  assert.equal(result.model,'google/gemini-3.7-flash');
  assert.equal(result.telemetry.request_count,1);
  assert.deepEqual(result.telemetry.skipped_attempts,[]);
  assert.equal(requests.length,1);
});

test('Gemini semantic gateway hardening does not alter ordinary gateway replies',async()=>{
  let body;
  const {generateDABBIRAiReply}=await import('../api/_ai-core.js');
  const result=await generateDABBIRAiReply({
    project:'dabbir_businesses',message:'hello',semantic:false,
    env:{VERCEL_ENV:'production',AI_GATEWAY_API_KEY:'gateway',DABBIR_AI_GATEWAY_MODEL:'google/gemini-3.7-flash'},
    fetchImpl:async(_url,options)=>{
      body=JSON.parse(options.body);
      return new Response(JSON.stringify({choices:[{message:{content:'Hello'}}]}),{status:200});
    },
  });
  assert.equal(result.ok,true);
  assert.equal(body.max_tokens,320);
  assert.equal(body.reasoning,undefined);
});

for(const [name,content,finishReason] of [
  ['truncated transport success',JSON.stringify(semanticProposal),'length'],
  ['malformed transport success','{"action":"CREATE_BOOKING"','stop'],
])test('actual fallback remains closed after '+name,async()=>{
  const requests=[];
  await assert.rejects(interpretSemanticMessage({
    message:'نفس اللي قلت لك',context:{},env:allProviders,
    fetchImpl:async(url,options)=>{
      requests.push({url:String(url),body:JSON.parse(options.body)});
      if(!String(url).includes('ai-gateway.vercel.sh'))return new Response('{}',{status:429});
      return new Response(JSON.stringify({
        choices:[{message:{content},finish_reason:finishReason}],
        usage:{prompt_tokens:1888,completion_tokens:2390,completion_tokens_details:{reasoning_tokens:2300}},
      }),{status:200});
    },
  }),error=>error.code==='AI_PLANNER_UNAVAILABLE'&&error.telemetry.request_count===4);
  assert.equal(requests.length,4,'no fifth attempt or unvalidated proposal is returned');
  assert.equal(requests[0].body.max_tokens,2400);
  assert.deepEqual(requests[0].body.reasoning,{effort:'low'});
  assert.equal(requests.slice(2).every(x=>!x.url.includes('ai-gateway.vercel.sh')),true);
});
