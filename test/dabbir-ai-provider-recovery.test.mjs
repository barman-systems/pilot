import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_PROVIDER_RECOVERY_PROBE_CONTRACT,
  configuredRecoveryTargets,
  probeAiProvider,
  recoveryProbeRequest,
  runAiProviderRecovery,
} from '../api/_ai-provider-recovery.js';

const response=status=>new Response(JSON.stringify({choices:[{message:{content:'OK'}}]}),{status,headers:{'content-type':'application/json'}});

class LeaseStore{
  constructor(){this.leased=false;this.observations=[];this.claims=[];}
  async claim(provider,model,attemptType){
    this.claims.push({provider,model,attemptType});
    if(this.leased)return {decision:'SKIP',reason:'PROBE_IN_FLIGHT',health_state:'SHARED',recovery_state:'QUARANTINED',scope:'model'};
    this.leased=true;
    return {decision:'PROBE',reason:'RECOVERY_LEASE_GRANTED',health_state:'SHARED',recovery_state:'QUARANTINED',scope:'model'};
  }
  async observe(provider,model,observation){this.observations.push({provider,model,...observation});return {state:'RECOVERING',recovery_state:'RECOVERING',cooldown_ms:30000};}
}

test('recovery probe request is tiny, deterministic and contains no customer/business context',()=>{
  const target={provider:'groq',model:'openai/gpt-oss-20b',endpoint:'https://api.groq.com/openai/v1/chat/completions',credential:'secret-test-key'};
  const request=recoveryProbeRequest(target);
  const body=JSON.parse(request.body);
  assert.equal(body.model,target.model);
  assert.deepEqual(body.messages,[{role:'user',content:'Reply exactly OK.'}]);
  assert.equal(body.max_tokens,4);
  assert.equal(body.temperature,0);
  const serialized=JSON.stringify(body).toLowerCase();
  for(const forbidden of ['customer','business','conversation','phone','email'])assert.equal(serialized.includes(forbidden),false,forbidden);
  assert.equal(AI_PROVIDER_RECOVERY_PROBE_CONTRACT.attempt_type,'RECOVERY_PROBE');
  assert.equal(AI_PROVIDER_RECOVERY_PROBE_CONTRACT.customer_content,false);
});

test('two concurrent background probes share one lease and only one reaches the provider',async()=>{
  const store=new LeaseStore();let calls=0;const seen=[];
  const target={provider:'groq',model:'openai/gpt-oss-20b',endpoint:'https://api.groq.com/openai/v1/chat/completions',credential:'secret-test-key'};
  const fetchImpl=async(_url,options)=>{calls++;seen.push(JSON.parse(options.body));return response(200)};
  const [a,b]=await Promise.all([
    probeAiProvider(target,{healthStore:store,fetchImpl,trace:[]}),
    probeAiProvider(target,{healthStore:store,fetchImpl,trace:[]}),
  ]);
  assert.equal(calls,1);
  assert.deepEqual(new Set([a.state,b.state]),new Set(['PROBE_SUCCEEDED','SKIPPED']));
  assert.equal(store.claims.every(item=>item.attemptType==='RECOVERY_PROBE'),true);
  assert.equal(store.observations.length,1);
  assert.equal(store.observations[0].attemptType,'RECOVERY_PROBE');
  assert.equal(JSON.stringify({a,b,seen}).includes('secret-test-key'),false);
});

test('configured targets use the same provider models and auth boundaries without exposing them in worker result',async()=>{
  const env={
    GEMINI_API_KEY:'gemini-secret',DABBIR_GEMINI_MODEL:'gemini-3.7-flash',
    GROQ_API_KEY:'groq-secret',DABBIR_GROQ_MODEL:'openai/gpt-oss-20b',
    CLOUDFLARE_API_TOKEN:'cf-secret',CLOUDFLARE_ACCOUNT_ID:'acct',DABBIR_CLOUDFLARE_MODEL:'@cf/zai-org/glm-4.7-flash',
    VERCEL_ENV:'production',DABBIR_AI_GATEWAY_MODEL:'google/gemini-3.7-flash',
  };
  const targets=await configuredRecoveryTargets(env,{oidcGetter:async()=> 'gateway-secret'});
  assert.deepEqual(targets.map(item=>item.provider),['google-gemini','groq','cloudflare-workers-ai','vercel-ai-gateway']);
  assert.deepEqual(targets.map(item=>item.model),['gemini-3.7-flash','openai/gpt-oss-20b','@cf/zai-org/glm-4.7-flash','google/gemini-3.7-flash']);

  const healthStore={
    async claim(provider,model,attemptType){return {decision:'SKIP',reason:'HEALTHY',health_state:'SHARED',recovery_state:'HEALTHY',scope:'model',provider,model,attemptType}},
    async observe(){throw new Error('unexpected observe')},
  };
  const result=await runAiProviderRecovery({env,healthStore,oidcGetter:async()=> 'gateway-secret',fetchImpl:async()=>{throw new Error('unexpected provider call')}});
  assert.equal(result.network_probes,0);
  assert.equal(result.skipped,4);
  const serialized=JSON.stringify(result);
  for(const secret of ['gemini-secret','groq-secret','cf-secret','gateway-secret'])assert.equal(serialized.includes(secret),false);
});