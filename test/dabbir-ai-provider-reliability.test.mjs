import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_PROVIDER_COOLDOWN_CODE,
  classifyAiProviderFailure,
  providerForAiEndpoint,
  reliableAiProviderFetch,
  summarizeProviderReliability,
} from '../api/_ai-provider-reliability.js';

class SharedFakeStore{
  constructor(){this.state=new Map();this.observations=[];}
  key(provider,model){return `${provider}:${model}`;}
  async claim(provider,model){
    const row=this.state.get(this.key(provider,model));
    if(row?.skip)return {decision:'SKIP',reason:row.reason||'PROVIDER_COOLDOWN',failure_class:row.failureClass||'RATE_LIMIT',cooldown_remaining_ms:row.remaining||60000,health_state:'SHARED'};
    return {decision:row?.probe?'PROBE':'ATTEMPT',health_state:'SHARED'};
  }
  async observe(provider,model,observation){this.observations.push({provider,model,...observation});return {cooldown_ms:observation.failureClass==='RATE_LIMIT'?60000:0};}
}

const response=(status,body={choices:[{message:{content:'ok'}}]},{headers={}}={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});

test('provider endpoint classification is bounded to the four reliability authorities',()=>{
  assert.equal(providerForAiEndpoint('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'),'google-gemini');
  assert.equal(providerForAiEndpoint('https://api.groq.com/openai/v1/chat/completions'),'groq');
  assert.equal(providerForAiEndpoint('https://api.cloudflare.com/client/v4/accounts/a/ai/v1/chat/completions'),'cloudflare-workers-ai');
  assert.equal(providerForAiEndpoint('https://ai-gateway.vercel.sh/v1/chat/completions'),'vercel-ai-gateway');
  assert.equal(providerForAiEndpoint('https://example.com'),null);
});

test('failure taxonomy separates rate, billing, transient and request failures',()=>{
  assert.equal(classifyAiProviderFailure({status:429}),'RATE_LIMIT');
  assert.equal(classifyAiProviderFailure({status:402}),'BILLING_CAPACITY_HARD_BLOCK');
  assert.equal(classifyAiProviderFailure({status:503}),'UPSTREAM_5XX');
  assert.equal(classifyAiProviderFailure({status:400}),'CONTRACT_REQUEST');
  assert.equal(classifyAiProviderFailure({error:Object.assign(new Error('timeout'),{name:'AbortError'})}),'TIMEOUT');
  assert.equal(classifyAiProviderFailure({error:new Error('socket')}),'NETWORK');
});

test('a separate instance sees shared cooldown and performs zero provider network calls',async()=>{
  const store=new SharedFakeStore();
  const model='gemini-3.7-flash';
  store.state.set(store.key('google-gemini',model),{skip:true,remaining:42000});
  let calls=0;const trace=[];
  await assert.rejects(
    reliableAiProviderFetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',{method:'POST'},{provider:'google-gemini',model,healthStore:store,trace,fetchImpl:async()=>{calls++;return response(200)}}),
    error=>error?.code===AI_PROVIDER_COOLDOWN_CODE&&error.cooldownRemainingMs===42000,
  );
  assert.equal(calls,0);
  const summary=summarizeProviderReliability(trace,Date.now());
  assert.equal(summary.network_attempts,0);
  assert.equal(summary.provider_attempts_saved,1);
});

test('Retry-After is observed without reading or persisting provider bodies',async()=>{
  const store=new SharedFakeStore();const trace=[];
  const result=await reliableAiProviderFetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST'},{provider:'groq',model:'openai/gpt-oss-20b',healthStore:store,trace,fetchImpl:async()=>response(429,{error:{message:'must-not-be-stored'}},{headers:{'retry-after':'61'}})});
  assert.equal(result.status,429);
  assert.equal(store.observations.length,1);
  assert.equal(store.observations[0].failureClass,'RATE_LIMIT');
  assert.equal(store.observations[0].retryAfterMs,61000);
  assert.equal(JSON.stringify(store.observations).includes('must-not-be-stored'),false);
});

test('one timeout is classified but policy is delegated to the shared store',async()=>{
  const store=new SharedFakeStore();const trace=[];
  await assert.rejects(reliableAiProviderFetch('https://api.cloudflare.com/client/v4/accounts/a/ai/v1/chat/completions',{}, {provider:'cloudflare-workers-ai',model:'@cf/zai-org/glm-4.7-flash',healthStore:store,trace,fetchImpl:async()=>{throw Object.assign(new Error('late'),{name:'AbortError'})}}));
  assert.equal(store.observations[0].failureClass,'TIMEOUT');
  assert.equal(trace[0].outcome,'TIMEOUT');
});
