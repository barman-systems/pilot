import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_PROVIDER_ATTEMPT_TYPES,
  AI_PROVIDER_COOLDOWN_CODE,
  classifyAiProviderFailure,
  normalizeAiProviderAttemptType,
  providerForAiEndpoint,
  reliableAiProviderFetch,
  summarizeProviderReliability,
} from '../api/_ai-provider-reliability.js';

class SharedFakeStore{
  constructor(){this.state=new Map();this.observations=[];this.claims=[];this.claimError=null;}
  key(provider,model){return `${provider}:${model}`;}
  async claim(provider,model,attemptType){
    this.claims.push({provider,model,attemptType});
    if(this.claimError)throw this.claimError;
    const row=this.state.get(this.key(provider,model));
    if(row?.skip)return {decision:'SKIP',reason:row.reason||'PROVIDER_COOLDOWN',failure_class:row.failureClass||'RATE_LIMIT',cooldown_remaining_ms:row.remaining||60000,health_state:'SHARED',recovery_state:row.recoveryState||'QUARANTINED',scope:row.scope||'model'};
    return {decision:row?.probe?'PROBE':'ATTEMPT',health_state:'SHARED',recovery_state:row?.recoveryState||'HEALTHY',scope:row?.scope||'model'};
  }
  async observe(provider,model,observation){this.observations.push({provider,model,...observation});return {cooldown_ms:observation.failureClass==='RATE_LIMIT'?60000:0,recovery_state:observation.success?'HEALTHY':'QUARANTINED'};}
}

const response=(status,body={choices:[{message:{content:'ok'}}]},{headers={}}={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});

test('attempt type contract is explicit and bounded',()=>{
  assert.equal(normalizeAiProviderAttemptType(),AI_PROVIDER_ATTEMPT_TYPES.CUSTOMER);
  assert.equal(normalizeAiProviderAttemptType('recovery_probe'),AI_PROVIDER_ATTEMPT_TYPES.RECOVERY_PROBE);
  assert.equal(normalizeAiProviderAttemptType('BENCHMARK'),AI_PROVIDER_ATTEMPT_TYPES.BENCHMARK);
  assert.throws(()=>normalizeAiProviderAttemptType('other'),/AI_PROVIDER_ATTEMPT_TYPE_INVALID/);
});

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

test('customer active cooldown performs zero provider network calls and is tagged CUSTOMER',async()=>{
  const store=new SharedFakeStore();
  const model='gemini-3.7-flash';
  store.state.set(store.key('google-gemini',model),{skip:true,remaining:42000,recoveryState:'QUARANTINED'});
  let calls=0;const trace=[];
  await assert.rejects(
    reliableAiProviderFetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',{method:'POST'},{provider:'google-gemini',model,healthStore:store,trace,fetchImpl:async()=>{calls++;return response(200)}}),
    error=>error?.code===AI_PROVIDER_COOLDOWN_CODE&&error.cooldownRemainingMs===42000&&error.attemptType==='CUSTOMER',
  );
  assert.equal(calls,0);
  assert.equal(store.claims[0].attemptType,'CUSTOMER');
  assert.equal(trace[0].attempt_type,'CUSTOMER');
  const summary=summarizeProviderReliability(trace,Date.now());
  assert.equal(summary.network_attempts,0);
  assert.equal(summary.provider_attempts_saved,1);
  assert.equal(summary.customer_probe_network_attempts,0);
});

test('defensive guard converts a stale PROBE claim on CUSTOMER into RECOVERY_PROBE_REQUIRED without network',async()=>{
  const store=new SharedFakeStore();const model='gemini-3.7-flash';
  store.state.set(store.key('google-gemini',model),{probe:true,recoveryState:'QUARANTINED'});
  let calls=0;const trace=[];
  await assert.rejects(
    reliableAiProviderFetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',{}, {provider:'google-gemini',model,healthStore:store,trace,fetchImpl:async()=>{calls++;return response(200)}}),
    error=>error?.code===AI_PROVIDER_COOLDOWN_CODE&&error.reason==='RECOVERY_PROBE_REQUIRED',
  );
  assert.equal(calls,0);
  assert.equal(trace[0].decision,'SKIP');
  assert.equal(trace[0].attempt_type,'CUSTOMER');
});

test('RECOVERY_PROBE requires an authority-granted lease before any network call',async()=>{
  const store=new SharedFakeStore();const model='openai/gpt-oss-20b';let calls=0;const trace=[];
  await assert.rejects(
    reliableAiProviderFetch('https://api.groq.com/openai/v1/chat/completions',{}, {provider:'groq',model,attemptType:'RECOVERY_PROBE',healthStore:store,trace,fetchImpl:async()=>{calls++;return response(200)}}),
    error=>error?.reason==='RECOVERY_PROBE_NOT_GRANTED',
  );
  assert.equal(calls,0);
  store.state.set(store.key('groq',model),{probe:true,recoveryState:'QUARANTINED'});
  const secondTrace=[];
  const result=await reliableAiProviderFetch('https://api.groq.com/openai/v1/chat/completions',{}, {provider:'groq',model,attemptType:'RECOVERY_PROBE',healthStore:store,trace:secondTrace,fetchImpl:async()=>{calls++;return response(200)}});
  assert.equal(result.status,200);
  assert.equal(calls,1);
  assert.equal(secondTrace[0].attempt_type,'RECOVERY_PROBE');
  assert.equal(store.observations.at(-1).attemptType,'RECOVERY_PROBE');
});

test('health-store claim outage fails customer path closed without becoming an unsafe probe',async()=>{
  const store=new SharedFakeStore();store.claimError=Object.assign(new Error('rpc unavailable'),{code:'AI_PROVIDER_HEALTH_RPC_503'});
  let calls=0;const trace=[];
  await assert.rejects(
    reliableAiProviderFetch('https://api.groq.com/openai/v1/chat/completions',{}, {provider:'groq',model:'openai/gpt-oss-20b',healthStore:store,trace,fetchImpl:async()=>{calls++;return response(200)}}),
    error=>error?.reason==='HEALTH_STATE_UNAVAILABLE',
  );
  assert.equal(calls,0);
  assert.equal(trace[0].network_attempted,false);
  assert.equal(trace[0].attempt_type,'CUSTOMER');
});

test('Retry-After is observed without reading or persisting provider bodies',async()=>{
  const store=new SharedFakeStore();const trace=[];
  const result=await reliableAiProviderFetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST'},{provider:'groq',model:'openai/gpt-oss-20b',healthStore:store,trace,fetchImpl:async()=>response(429,{error:{message:'must-not-be-stored'}},{headers:{'retry-after':'61'}})});
  assert.equal(result.status,429);
  assert.equal(store.observations.length,1);
  assert.equal(store.observations[0].failureClass,'RATE_LIMIT');
  assert.equal(store.observations[0].retryAfterMs,61000);
  assert.equal(store.observations[0].attemptType,'CUSTOMER');
  assert.equal(JSON.stringify(store.observations).includes('must-not-be-stored'),false);
});

test('BENCHMARK is explicit in trace and observation without masquerading as customer traffic',async()=>{
  const store=new SharedFakeStore();const trace=[];
  const result=await reliableAiProviderFetch('https://api.groq.com/openai/v1/chat/completions',{}, {provider:'groq',model:'openai/gpt-oss-20b',attemptType:'BENCHMARK',healthStore:store,trace,fetchImpl:async()=>response(200)});
  assert.equal(result.status,200);
  assert.equal(store.claims[0].attemptType,'BENCHMARK');
  assert.equal(store.observations[0].attemptType,'BENCHMARK');
  assert.equal(trace[0].attempt_type,'BENCHMARK');
  const summary=summarizeProviderReliability(trace,Date.now());
  assert.equal(summary.benchmark_network_attempts,1);
  assert.equal(summary.customer_network_attempts,0);
});

test('one timeout is classified and attempt type stays CUSTOMER',async()=>{
  const store=new SharedFakeStore();const trace=[];
  await assert.rejects(reliableAiProviderFetch('https://api.cloudflare.com/client/v4/accounts/a/ai/v1/chat/completions',{}, {provider:'cloudflare-workers-ai',model:'@cf/zai-org/glm-4.7-flash',healthStore:store,trace,fetchImpl:async()=>{throw Object.assign(new Error('late'),{name:'AbortError'})}}));
  assert.equal(store.observations[0].failureClass,'TIMEOUT');
  assert.equal(store.observations[0].attemptType,'CUSTOMER');
  assert.equal(trace[0].outcome,'TIMEOUT');
  assert.equal(trace[0].attempt_type,'CUSTOMER');
});