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

test('degraded direct providers leave Gemini gateway semantic output enough reasoning and JSON headroom',async()=>{
  const requests=[];
  const result=await interpretSemanticMessage({
    message:'ستيشن',context:{},env:allProviders,
    fetchImpl:async(url,options)=>{
      const body=JSON.parse(options.body);
      requests.push({url:String(url),body});
      if(String(url).includes('ai-gateway.vercel.sh')){
        assert.equal(body.model,'google/gemini-3.7-flash');
        assert.equal(body.response_format.type,'json_object');
        assert.equal(body.max_tokens,2400);
        assert.deepEqual(body.reasoning,{effort:'low'});
        return okResponse();
      }
      return new Response('{}',{status:429});
    },
  });

  assert.equal(result.provider,'vercel-ai-gateway');
  assert.equal(result.model,'google/gemini-3.7-flash');
  assert.equal(result.telemetry.request_count,4);
  assert.deepEqual(result.telemetry.skipped_attempts,[]);
  assert.equal(requests.filter(x=>x.url.includes('ai-gateway.vercel.sh')).length,1);
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
