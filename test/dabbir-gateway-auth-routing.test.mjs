import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateDABBIRAiReply, getDABBIRAiConfig, getDABBIRAiRedundancy} from '../api/_ai-core.js';

const endpoint = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const response = status => ({ok:status===200,status,json:async()=>({choices:[{message:{content:'Hello'}}]})});
const run = (env, fetchImpl, extra={}) => generateDABBIRAiReply({project:'dabbir_businesses',message:'Hello',env,fetchImpl,...extra});

for (const name of ['AI_GATEWAY_API_KEY','VERCEL_OIDC_TOKEN']) {
  test(`${name} reaches Gateway outside Vercel without a hosting flag`, async()=>{
    const credential=randomUUID(), calls=[];
    const env={[name]:credential};
    const r=await run(env,async(url,options)=>{calls.push(url);assert.equal(options.headers.authorization,`Bearer ${credential}`);return response(200);});
    assert.equal(r.ok,true);
    assert.equal(r.provider,'vercel-ai-gateway');
    assert.deepEqual(calls,[endpoint]);
    assert.equal(getDABBIRAiConfig(env).configured,true);
    assert.equal(getDABBIRAiRedundancy(env).gateway_fallback_configured,true);
    assert.ok(!JSON.stringify(r).includes(credential));
  });
}

test('explicit test routing bypasses direct providers and preserves the configured model',async()=>{
  const env={DABBIR_AI_GATEWAY_TEST:'1',AI_GATEWAY_API_KEY:randomUUID(),GEMINI_API_KEY:randomUUID(),GROQ_API_KEY:randomUUID(),CLOUDFLARE_API_TOKEN:randomUUID(),CLOUDFLARE_ACCOUNT_ID:'fixture',DABBIR_AI_GATEWAY_MODEL:'fixture/model'};
  let calls=0;
  const r=await run(env,async(url,options)=>{calls++;assert.equal(url,endpoint);assert.equal(JSON.parse(options.body).model,'fixture/model');return response(200);});
  assert.equal(r.ok,true);assert.equal(calls,1);assert.equal(r.model,'fixture/model');
});

test('explicit test without credentials fails before HTTP and does not call direct providers',async()=>{
  const env={DABBIR_AI_GATEWAY_TEST:'1',GROQ_API_KEY:randomUUID()};
  const r=await run(env,async()=>assert.fail('must not call HTTP'));
  assert.equal(r.error_code,'GATEWAY_AUTH_MISSING');
  assert.equal(r.gateway_route,'SELECTED');
  assert.equal(r.auth_status,'MISSING');
  assert.equal(getDABBIRAiConfig(env).configured,false);
  assert.equal(getDABBIRAiRedundancy(env).gateway_fallback_configured,false);
});

test('no selected route is distinguishable from selected route with missing authentication',async()=>{
  const r=await run({},async()=>assert.fail('must not call HTTP'));
  assert.equal(r.error_code,'GATEWAY_NOT_SELECTED');
  assert.equal(r.gateway_route,'NOT_SELECTED');
  assert.equal(r.gateway_reason,'NO_CREDENTIALS_OR_RUNTIME_OIDC_AND_TEST_NOT_ENABLED');
});

for(const status of [401,403,402,429,500]) {
  test(`Gateway HTTP ${status} has a distinct category and bounded attempts`,async()=>{
    let calls=0;
    const r=await run({AI_GATEWAY_API_KEY:randomUUID()},async()=>{calls++;return response(status);});
    assert.equal(r.ok,false);assert.equal(r.gateway_route,'SELECTED');
    assert.equal(r.error,`gateway_http_${status}`);
    assert.equal(r.error_code,status===401?'GATEWAY_AUTH_INVALID':status===403?'GATEWAY_ACCESS_DENIED':'GATEWAY_REQUEST_FAILED');
    assert.equal(r.state,status===429?'RATE_LIMITED':'PROVIDER_ERROR');
    assert.equal(calls,[429,500].includes(status)?2:1);
  });
}

for (const provider of ['gemini','groq','cloudflare']) {
  for(const failure of ['http','network']) {
    test(`${provider} ${failure} failure falls back to Gateway outside Vercel`,async()=>{
      const env={AI_GATEWAY_API_KEY:randomUUID(),...(provider==='gemini'?{GEMINI_API_KEY:randomUUID()}:provider==='groq'?{GROQ_API_KEY:randomUUID()}:{CLOUDFLARE_API_TOKEN:randomUUID(),CLOUDFLARE_ACCOUNT_ID:'fixture'})};
      const calls=[];
      const r=await run(env,async url=>{calls.push(url);if(url===endpoint)return response(200);if(failure==='network')throw Error('offline');return response(429);});
      assert.equal(r.ok,true);assert.equal(r.provider,'vercel-ai-gateway');
      assert.equal(calls.length,2);assert.notEqual(calls[0],endpoint);assert.equal(calls[1],endpoint);
    });
  }
}

test('normal provider priority is retained when test mode is disabled',async()=>{
  const r=await run({DABBIR_AI_GATEWAY_TEST:'0',GEMINI_API_KEY:randomUUID(),AI_GATEWAY_API_KEY:randomUUID()},async url=>{assert.ok(url.includes('googleapis.com'));return response(200);});
  assert.equal(r.provider,'google-gemini');
});

test('whitespace credentials do not count as authentication',async()=>{
  const env={DABBIR_AI_GATEWAY_TEST:'1',AI_GATEWAY_API_KEY:'  ',VERCEL_OIDC_TOKEN:'\n'};
  const r=await run(env,async()=>assert.fail('must not call HTTP'));
  assert.equal(r.error_code,'GATEWAY_AUTH_MISSING');
  assert.equal(getDABBIRAiRedundancy(env).gateway_fallback_configured,false);
});

test('runtime OIDC works on Vercel and failures are reported before HTTP',async()=>{
  const env={VERCEL_ENV:'production'}, credential=randomUUID();
  const ok=await run(env,async()=>response(200),{oidcGetter:async()=>credential});
  assert.equal(ok.auth_mode,'VERCEL_PROJECT_OIDC');assert.equal(ok.ok,true);
  const missing=await run(env,async()=>assert.fail('must not call HTTP'),{oidcGetter:async()=>{throw Error('unavailable');}});
  assert.equal(missing.error_code,'GATEWAY_AUTH_MISSING');
});

test('manual key takes priority over OIDC and rejected keys never downgrade authentication',async()=>{
  const credential=randomUUID();let calls=0;
  const r=await run({VERCEL_ENV:'production',AI_GATEWAY_API_KEY:credential,VERCEL_OIDC_TOKEN:randomUUID()},async(url,options)=>{calls++;assert.equal(options.headers.authorization,`Bearer ${credential}`);return response(401);},{oidcGetter:async()=>assert.fail('must not fall back to OIDC')});
  assert.equal(calls,1);assert.equal(r.error_code,'GATEWAY_AUTH_INVALID');
});

test('network failures are not mislabeled as invalid credentials',async()=>{
  const r=await run({AI_GATEWAY_API_KEY:randomUUID()},async()=>{throw Error('offline');});
  assert.equal(r.error,'gateway_network_error');assert.equal(r.error_code,'GATEWAY_REQUEST_FAILED');
});
