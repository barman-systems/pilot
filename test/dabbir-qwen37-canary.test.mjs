import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QWEN37_CANARY_MODEL,
  QWEN37_CANARY_MAX_PERCENT,
  qwen37CanaryDecision,
  qwen37CanaryEnvironment,
  qwen37CanaryFetch,
} from '../api/_dabbir-qwen37-canary.js';

const gateway='https://ai-gateway.vercel.sh/v1/chat/completions';

test('Qwen3.7 canary is off by default and hard-capped at one percent',()=>{
  const base={meteringContext:{business:{id:'biz'},conversation:{id:'conv'}}};
  assert.equal(qwen37CanaryDecision({...base,env:{}}).selected,false);
  const decision=qwen37CanaryDecision({...base,env:{DABBIR_QWEN37_CANARY_ENABLED:'1',DABBIR_QWEN37_CANARY_PERCENT:'100'}});
  assert.equal(decision.percent,QWEN37_CANARY_MAX_PERCENT);
  assert.equal(QWEN37_CANARY_MAX_PERCENT,1);
});

test('Qwen3.7 canary assignment is deterministic and conversation-sticky',()=>{
  const env={DABBIR_QWEN37_CANARY_ENABLED:'1',DABBIR_QWEN37_CANARY_PERCENT:'1'};
  let selected=null;
  for(let i=0;i<5000;i++){
    const d=qwen37CanaryDecision({env,meteringContext:{business:{id:'biz'},conversation:{id:`conv-${i}`}}});
    if(d.selected){selected=d;break;}
  }
  assert.ok(selected,'expected at least one deterministic 1% sample');
  const again=qwen37CanaryDecision({env,meteringContext:{business:{id:'biz'},conversation:{id:selected.conversationId}}});
  assert.deepEqual(again,selected);
});

test('Qwen3.7 canary requires stable business and conversation identity',()=>{
  const env={DABBIR_QWEN37_CANARY_ENABLED:'1',DABBIR_QWEN37_CANARY_PERCENT:'1'};
  assert.equal(qwen37CanaryDecision({env,meteringContext:{business:{id:'biz'}}}).selected,false);
  assert.equal(qwen37CanaryDecision({env,meteringContext:{conversation:{id:'conv'}}}).selected,false);
});

test('Qwen3.7 canary environment strips direct provider credentials and pins gateway model',()=>{
  const selected=qwen37CanaryEnvironment({
    VERCEL_ENV:'production',AI_GATEWAY_API_KEY:'gateway',
    GEMINI_API_KEY:'gemini',GROQ_API_KEY:'groq',CLOUDFLARE_API_TOKEN:'cf',CLOUDFLARE_ACCOUNT_ID:'account',
  });
  assert.deepEqual(selected,{VERCEL_ENV:'production',DABBIR_AI_GATEWAY_MODEL:QWEN37_CANARY_MODEL,AI_GATEWAY_API_KEY:'gateway'});
  assert.equal(selected.GEMINI_API_KEY,undefined);
  assert.equal(selected.GROQ_API_KEY,undefined);
  assert.equal(selected.CLOUDFLARE_API_TOKEN,undefined);
});

test('Qwen3.7 canary hard-pins Alibaba, strict schema and non-thinking mode',async()=>{
  let captured=null;
  const wrapped=qwen37CanaryFetch(async(_url,options)=>{captured=JSON.parse(options.body);return new Response('{}',{status:200});});
  await wrapped(gateway,{method:'POST',body:JSON.stringify({
    model:QWEN37_CANARY_MODEL,messages:[],max_tokens:1600,response_format:{type:'json_object'},
    providerOptions:{gateway:{sort:'cost'},custom:{keep:true}},
  })});
  assert.equal(captured.model,QWEN37_CANARY_MODEL);
  assert.deepEqual(captured.reasoning,{effort:'none'});
  assert.equal(captured.max_tokens,2400);
  assert.deepEqual(captured.providerOptions.gateway,{sort:'cost',only:['alibaba'],order:['alibaba']});
  assert.deepEqual(captured.providerOptions.custom,{keep:true});
  assert.equal(captured.response_format.type,'json_schema');
  assert.equal(captured.response_format.json_schema.strict,true);
  assert.equal(captured.response_format.json_schema.schema.additionalProperties,false);
});

test('Qwen3.7 canary rejects model drift before network transport',async()=>{
  let calls=0;
  const wrapped=qwen37CanaryFetch(async()=>{calls++;return new Response('{}',{status:200});});
  await assert.rejects(()=>wrapped(gateway,{body:JSON.stringify({model:'other/model'})}),/MODEL_DRIFT/);
  assert.equal(calls,0);
});
