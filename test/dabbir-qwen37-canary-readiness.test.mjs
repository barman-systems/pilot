import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/dabbir-qwen37-canary-readiness.js';

function invoke(method='GET'){
  const req={method};
  let statusCode=200;let body=null;const headers={};
  const res={
    status(code){statusCode=code;return this;},
    setHeader(key,value){headers[String(key).toLowerCase()]=String(value);return this;},
    json(value){body=value;return this;},
  };
  handler(req,res);
  return {statusCode,body,headers};
}

function withEnv(values,fn){
  const before={};
  for(const [key,value] of Object.entries(values)){
    before[key]=process.env[key];
    if(value===undefined)delete process.env[key];else process.env[key]=String(value);
  }
  try{return fn();}
  finally{
    for(const [key,value] of Object.entries(before)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
}

test('canary readiness is disabled by default and discloses no credential material',()=>{
  const result=withEnv({DABBIR_QWEN37_CANARY_ENABLED:undefined,DABBIR_QWEN37_CANARY_PERCENT:undefined},()=>invoke());
  assert.equal(result.statusCode,200);
  assert.deepEqual(result.body,{
    ok:true,enabled:false,percent:0,max_percent:1,model:'alibaba/qwen3.7-flash',
    scope:'SEMANTIC_INTERPRETER_ONLY',deterministic_execution_authority:'DABBIR',
  });
  assert.equal(result.headers['cache-control'],'no-store');
  assert.equal(JSON.stringify(result.body).includes('TOKEN'),false);
  assert.equal(JSON.stringify(result.body).includes('KEY'),false);
});

test('canary readiness reflects enablement but preserves the one-percent hard cap',()=>{
  const result=withEnv({DABBIR_QWEN37_CANARY_ENABLED:'1',DABBIR_QWEN37_CANARY_PERCENT:'99'},()=>invoke());
  assert.equal(result.statusCode,200);
  assert.equal(result.body.enabled,true);
  assert.equal(result.body.percent,1);
  assert.equal(result.body.max_percent,1);
});

test('canary readiness is read-only',()=>{
  const result=invoke('POST');
  assert.equal(result.statusCode,405);
  assert.deepEqual(result.body,{ok:false,error:'METHOD_NOT_ALLOWED'});
});
