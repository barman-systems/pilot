import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/platform-customers.js';

const USER_ID='11111111-1111-4111-8111-111111111111';

function responseRecorder(){
  const headers=new Map();
  return {
    statusCode:200,
    setHeader(name,value){headers.set(String(name).toLowerCase(),value)},
    end(value=''){this.body=String(value)},
    headers,
    body:'',
  };
}

function request(url,{authenticated=true}={}){
  return {
    method:'GET',
    url,
    headers:authenticated?{cookie:'__Host-dabbir_access=test-access-token'}:{},
  };
}

async function invoke(url,{authenticated=true,adminRows=[]}={}){
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async input=>{
    const target=String(input);
    if(target.includes('/auth/v1/user')){
      return new Response(JSON.stringify({id:USER_ID,email:'owner@example.test',aud:'authenticated'}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(target.includes('/rest/v1/account_access_state?')){
      return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
    }
    if(target.includes('/rest/v1/dabbir_platform_admins?')){
      return new Response(JSON.stringify(adminRows),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error(`UNEXPECTED_FETCH_${target}`);
  };
  const res=responseRecorder();
  try{
    await handler(request(url,{authenticated}),res);
  }finally{
    globalThis.fetch=originalFetch;
  }
  return {status:res.statusCode,json:JSON.parse(res.body||'{}'),headers:res.headers};
}

test('platform capability probe is non-error only after real authentication while privileged actions remain fail-closed',async()=>{
  const originalKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';
  try{
    const anonymous=await invoke('/api/platform-customers?action=capability',{authenticated:false});
    assert.equal(anonymous.status,401);
    assert.equal(anonymous.json.error,'AUTH_REQUIRED');

    const ordinaryCapability=await invoke('/api/platform-customers?action=capability',{adminRows:[]});
    assert.equal(ordinaryCapability.status,200);
    assert.deepEqual(ordinaryCapability.json,{
      ok:true,
      allowed:false,
      role:null,
      service_configured:false,
      reason:'PLATFORM_ADMIN_REQUIRED',
    });
    assert.equal(ordinaryCapability.headers.get('cache-control'),'no-store');

    const ordinarySearch=await invoke('/api/platform-customers?action=search&q=test',{adminRows:[]});
    assert.equal(ordinarySearch.status,403);
    assert.equal(ordinarySearch.json.error,'PLATFORM_ADMIN_REQUIRED');

    const adminCapability=await invoke('/api/platform-customers?action=capability',{
      adminRows:[{role:'platform_owner',active:true}],
    });
    assert.equal(adminCapability.status,200);
    assert.equal(adminCapability.json.allowed,true);
    assert.equal(adminCapability.json.role,'platform_owner');
    assert.equal(adminCapability.json.service_configured,true);
  }finally{
    if(originalKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY=originalKey;
  }
});
