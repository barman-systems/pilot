import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QWEN37_CANARY_CAPABILITY_KEY,
  QWEN37_CANARY_MODEL,
  QWEN37_CANARY_MAX_PERCENT,
  loadQwen37CanaryControl,
  qwen37CanaryDecision,
  qwen37CanaryEnvironment,
  qwen37CanaryFetch,
} from '../api/_dabbir-qwen37-canary.js';

const gateway='https://ai-gateway.vercel.sh/v1/chat/completions';
const activeControl={enabled:true,percent:1,source:'TEST_CAPABILITY'};
const validRow={
  capability_key:QWEN37_CANARY_CAPABILITY_KEY,
  action_class:'READ',risk_level:'LOW',tool_name:'QWEN37_SEMANTIC_INTERPRETER',
  mutates:false,human_approval:false,enabled:true,shadow_only:false,
  contract:{authority:'runtime_control',scope:'SEMANTIC_INTERPRETER_ONLY',model:QWEN37_CANARY_MODEL,rollout_percent:1,max_percent:1,control_version:1},
};

test('legacy Vercel env flags cannot activate the Qwen3.7 canary',()=>{
  const base={meteringContext:{business:{id:'biz'},conversation:{id:'conv'}}};
  const decision=qwen37CanaryDecision({...base,env:{DABBIR_QWEN37_CANARY_ENABLED:'1',DABBIR_QWEN37_CANARY_PERCENT:'100'}});
  assert.equal(decision.selected,false);
  assert.equal(decision.enabled,false);
  assert.equal(decision.percent,0);
  assert.equal(QWEN37_CANARY_MAX_PERCENT,1);
});

test('capability registry control fails closed when DB authority is not configured',async()=>{
  const control=await loadQwen37CanaryControl({env:{DABBIR_QWEN37_CANARY_ENABLED:'1',DABBIR_QWEN37_CANARY_PERCENT:'1'},cache:false});
  assert.deepEqual(control,{enabled:false,percent:0,source:'CAPABILITY_CONTROL_NOT_CONFIGURED',controlVersion:1});
});

test('only an exact capability contract can enable the one-percent canary',async()=>{
  let seenUrl='';
  const control=await loadQwen37CanaryControl({
    env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret'},cache:false,
    fetchImpl:async(url,options)=>{
      seenUrl=String(url);
      assert.equal(options.method,'GET');
      assert.equal(options.headers.apikey,'service-secret');
      return new Response(JSON.stringify([validRow]),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  assert.equal(control.enabled,true);
  assert.equal(control.percent,1);
  assert.equal(control.source,'CAPABILITY_REGISTRY_ACTIVE');
  assert.match(seenUrl,/dabbir_capability_registry/);
  assert.match(decodeURIComponent(seenUrl),new RegExp(QWEN37_CANARY_CAPABILITY_KEY.replaceAll('.','\\.')));
});

test('invalid, oversized or shadow-only capability control stays OFF',async()=>{
  for(const row of [
    {...validRow,contract:{...validRow.contract,model:'other/model'}},
    {...validRow,contract:{...validRow.contract,rollout_percent:99}},
    {...validRow,shadow_only:true},
    {...validRow,enabled:false},
  ]){
    const control=await loadQwen37CanaryControl({
      env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret'},cache:false,
      fetchImpl:async()=>new Response(JSON.stringify([row]),{status:200,headers:{'content-type':'application/json'}}),
    });
    assert.equal(control.enabled,false);
    assert.equal(control.percent,0);
  }
});

test('Qwen3.7 canary assignment is deterministic and conversation-sticky',()=>{
  let selected=null;
  for(let i=0;i<5000;i++){
    const d=qwen37CanaryDecision({control:activeControl,meteringContext:{business:{id:'biz'},conversation:{id:`conv-${i}`}}});
    if(d.selected){selected=d;break;}
  }
  assert.ok(selected,'expected at least one deterministic 1% sample');
  const again=qwen37CanaryDecision({control:activeControl,meteringContext:{business:{id:'biz'},conversation:{id:selected.conversationId}}});
  assert.deepEqual(again,selected);
});

test('Qwen3.7 canary requires stable business and conversation identity',()=>{
  assert.equal(qwen37CanaryDecision({control:activeControl,meteringContext:{business:{id:'biz'}}}).selected,false);
  assert.equal(qwen37CanaryDecision({control:activeControl,meteringContext:{conversation:{id:'conv'}}}).selected,false);
});

test('Qwen3.7 canary environment strips direct provider and Supabase credentials and pins gateway model',()=>{
  const selected=qwen37CanaryEnvironment({
    VERCEL_ENV:'production',AI_GATEWAY_API_KEY:'gateway',SUPABASE_SERVICE_ROLE_KEY:'db-secret',
    GEMINI_API_KEY:'gemini',GROQ_API_KEY:'groq',CLOUDFLARE_API_TOKEN:'cf',CLOUDFLARE_ACCOUNT_ID:'account',
  });
  assert.deepEqual(selected,{VERCEL_ENV:'production',DABBIR_AI_GATEWAY_MODEL:QWEN37_CANARY_MODEL,AI_GATEWAY_API_KEY:'gateway'});
  assert.equal(selected.GEMINI_API_KEY,undefined);
  assert.equal(selected.GROQ_API_KEY,undefined);
  assert.equal(selected.CLOUDFLARE_API_TOKEN,undefined);
  assert.equal(selected.SUPABASE_SERVICE_ROLE_KEY,undefined);
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
