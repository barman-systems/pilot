import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/dabbir-qwen37-canary-readiness.js';

async function invoke(method='GET'){
  const req={method};
  let statusCode=200;let body=null;const headers={};
  const res={
    status(code){statusCode=code;return this;},
    setHeader(key,value){headers[String(key).toLowerCase()]=String(value);return this;},
    json(value){body=value;return this;},
  };
  await handler(req,res);
  return {statusCode,body,headers};
}

async function withEnv(values,fn){
  const before={};
  for(const [key,value] of Object.entries(values)){
    before[key]=process.env[key];
    if(value===undefined)delete process.env[key];else process.env[key]=String(value);
  }
  try{return await fn();}
  finally{
    for(const [key,value] of Object.entries(before)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
}

const activeRow={
  capability_key:'ai.semantic.qwen37_canary',action_class:'READ',risk_level:'LOW',tool_name:'QWEN37_SEMANTIC_INTERPRETER',
  mutates:false,human_approval:false,enabled:true,shadow_only:false,
  contract:{authority:'runtime_control',scope:'SEMANTIC_INTERPRETER_ONLY',model:'alibaba/qwen3.7-flash',rollout_percent:1,max_percent:1,control_version:1},
};

test('canary readiness is disabled without database authority even if legacy env flags are enabled',async()=>{
  const result=await withEnv({
    SUPABASE_URL:undefined,SUPABASE_DATA_URL:undefined,SUPABASE_SERVICE_ROLE_KEY:undefined,
    DABBIR_QWEN37_CANARY_ENABLED:'1',DABBIR_QWEN37_CANARY_PERCENT:'1',
  },()=>invoke());
  assert.equal(result.statusCode,200);
  assert.equal(result.body.enabled,false);
  assert.equal(result.body.percent,0);
  assert.equal(result.body.max_percent,1);
  assert.equal(result.body.model,'alibaba/qwen3.7-flash');
  assert.equal(result.body.scope,'SEMANTIC_INTERPRETER_ONLY');
  assert.equal(result.body.control_authority,'SUPABASE_CAPABILITY_REGISTRY');
  assert.equal(result.body.control_state,'CAPABILITY_CONTROL_NOT_CONFIGURED');
  assert.equal(result.body.deterministic_execution_authority,'DABBIR');
  assert.equal(result.headers['cache-control'],'no-store');
  assert.equal(JSON.stringify(result.body).includes('TOKEN'),false);
  assert.equal(JSON.stringify(result.body).includes('KEY'),false);
});

test('canary readiness reflects an exact active capability and stays hard-capped at one percent',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify([activeRow]),{status:200,headers:{'content-type':'application/json'}}));
  const result=await withEnv({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'read-only-service-secret'},()=>invoke());
  assert.equal(result.statusCode,200);
  assert.equal(result.body.enabled,true);
  assert.equal(result.body.percent,1);
  assert.equal(result.body.max_percent,1);
  assert.equal(result.body.control_state,'CAPABILITY_REGISTRY_ACTIVE');
});

test('canary readiness is read-only',async()=>{
  const result=await invoke('POST');
  assert.equal(result.statusCode,405);
  assert.deepEqual(result.body,{ok:false,error:'METHOD_NOT_ALLOWED'});
});
