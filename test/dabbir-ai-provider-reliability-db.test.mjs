import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const migration=fs.readFileSync(new URL('../supabase/migrations/20260914194000_dabbir_ai_provider_reliability_authority_v1.sql',import.meta.url),'utf8');
const adaptiveMigration=fs.readFileSync(new URL('../supabase/migrations/20260914214500_dabbir_ai_provider_adaptive_quarantine_v1.sql',import.meta.url),'utf8');
const rpc=async(name,args=[])=>{
  const placeholders=args.map((_,index)=>`$${index+1}`).join(',');
  const result=await db.query(`select public.${name}(${placeholders}) result`,args);
  return result.rows[0]?.result;
};
const claim=(provider,model)=>rpc('dabbir_ai_provider_health_claim_v1',[provider,model]);
const observe=(provider,model,success,failureClass,status,retryAfterMs,latencyMs=10)=>rpc('dabbir_ai_provider_health_observe_v1',[provider,model,success,failureClass,status,retryAfterMs,latencyMs]);
const expireCooldown=async(provider,model)=>db.exec(`update dabbir_private.dabbir_ai_provider_health_v1 set cooldown_until=clock_timestamp()-interval '1 millisecond',probe_lease_until=null where provider='${provider}' and model='${model}'`);

before(async()=>{
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(migration);
  await db.exec(adaptiveMigration);
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
});
after(()=>db.close());
beforeEach(async()=>{
  await db.exec('delete from dabbir_private.dabbir_ai_provider_health_v1');
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
});

test('429 Retry-After is shared and immediately skips another instance',async()=>{
  assert.equal((await claim('google-gemini','gemini-3.7-flash')).decision,'ATTEMPT');
  const observed=await observe('google-gemini','gemini-3.7-flash',false,'RATE_LIMIT',429,60000,32);
  assert.equal(observed.cooldown_ms,60000);
  const second=await claim('google-gemini','gemini-3.7-flash');
  assert.equal(second.decision,'SKIP');
  assert.equal(second.failure_class,'RATE_LIMIT');
  assert.ok(second.cooldown_remaining_ms>0&&second.cooldown_remaining_ms<=60000);
});

test('expired cooldown grants one probe and blocks concurrent herd until probe resolves',async()=>{
  await claim('groq','openai/gpt-oss-20b');
  await observe('groq','openai/gpt-oss-20b',false,'RATE_LIMIT',429,1000,15);
  await db.exec("update dabbir_private.dabbir_ai_provider_health_v1 set cooldown_until=clock_timestamp()-interval '1 millisecond',probe_lease_until=null where provider='groq'");
  const [a,b]=await Promise.all([claim('groq','openai/gpt-oss-20b'),claim('groq','openai/gpt-oss-20b')]);
  assert.deepEqual(new Set([a.decision,b.decision]),new Set(['PROBE','SKIP']));
  const skip=a.decision==='SKIP'?a:b;
  assert.equal(skip.reason,'PROBE_IN_FLIGHT');
  await observe('groq','openai/gpt-oss-20b',true,null,200,null,22);
  assert.equal((await claim('groq','openai/gpt-oss-20b')).decision,'ATTEMPT');
});

test('402 is provider-wide and blocks a different gateway model without a network probe',async()=>{
  await claim('vercel-ai-gateway','minimax/minimax-m3');
  const blocked=await observe('vercel-ai-gateway','minimax/minimax-m3',false,'BILLING_CAPACITY_HARD_BLOCK',402,null,40);
  assert.equal(blocked.scope,'provider');
  const other=await claim('vercel-ai-gateway','minimax/minimax-m2.7');
  assert.equal(other.decision,'SKIP');
  assert.equal(other.failure_class,'BILLING_CAPACITY_HARD_BLOCK');
});

test('one timeout does not open a circuit; the second bounded timeout does',async()=>{
  await claim('cloudflare-workers-ai','@cf/zai-org/glm-4.7-flash');
  const first=await observe('cloudflare-workers-ai','@cf/zai-org/glm-4.7-flash',false,'TIMEOUT',null,null,5000);
  assert.equal(first.cooldown_ms,0);
  assert.equal((await claim('cloudflare-workers-ai','@cf/zai-org/glm-4.7-flash')).decision,'ATTEMPT');
  const second=await observe('cloudflare-workers-ai','@cf/zai-org/glm-4.7-flash',false,'TIMEOUT',null,null,5000);
  assert.equal(second.cooldown_ms,10000);
  assert.equal((await claim('cloudflare-workers-ai','@cf/zai-org/glm-4.7-flash')).decision,'SKIP');
});

test('sustained 429 without Retry-After escalates quarantine instead of probing every two minutes forever',async()=>{
  const provider='google-gemini',model='gemini-3.7-flash';
  const expected=[15000,30000,60000,120000,300000,600000];
  for(let index=0;index<expected.length;index++){
    if(index===0) assert.equal((await claim(provider,model)).decision,'ATTEMPT');
    else {
      await expireCooldown(provider,model);
      assert.equal((await claim(provider,model)).decision,'PROBE');
    }
    const observed=await observe(provider,model,false,'RATE_LIMIT',429,null,50);
    assert.equal(observed.consecutive_failures,index+1);
    assert.equal(observed.cooldown_ms,expected[index]);
  }
});

test('sustained timeout/network failures graduate to long quarantine while the first timeout stays observational',async()=>{
  const provider='cloudflare-workers-ai',model='@cf/zai-org/glm-4.7-flash';
  const expected=[0,10000,30000,60000,120000,300000,600000];
  for(let index=0;index<expected.length;index++){
    if(index===0) assert.equal((await claim(provider,model)).decision,'ATTEMPT');
    else if(expected[index-1]>0){
      await expireCooldown(provider,model);
      assert.equal((await claim(provider,model)).decision,'PROBE');
    }else assert.equal((await claim(provider,model)).decision,'ATTEMPT');
    const observed=await observe(provider,model,false,'TIMEOUT',null,null,5000);
    assert.equal(observed.consecutive_failures,index+1);
    assert.equal(observed.cooldown_ms,expected[index]);
  }
});

test('real success resets adaptive quarantine immediately',async()=>{
  const provider='google-gemini',model='gemini-3.7-flash';
  for(let index=0;index<5;index++){
    if(index===0) await claim(provider,model);
    else {await expireCooldown(provider,model);await claim(provider,model);}
    await observe(provider,model,false,'RATE_LIMIT',429,null,20);
  }
  await expireCooldown(provider,model);
  await claim(provider,model);
  const healthy=await observe(provider,model,true,null,200,null,40);
  assert.equal(healthy.state,'HEALTHY');
  assert.equal((await claim(provider,model)).decision,'ATTEMPT');
  const nextFailure=await observe(provider,model,false,'RATE_LIMIT',429,null,30);
  assert.equal(nextFailure.consecutive_failures,1);
  assert.equal(nextFailure.cooldown_ms,15000);
});

test('400 contract failure is recorded but never converted into provider outage',async()=>{
  await claim('groq','openai/gpt-oss-20b');
  const observed=await observe('groq','openai/gpt-oss-20b',false,'CONTRACT_REQUEST',400,null,12);
  assert.equal(observed.cooldown_ms,0);
  assert.equal((await claim('groq','openai/gpt-oss-20b')).decision,'ATTEMPT');
});

test('health RPCs fail closed to non-service callers and snapshot contains no tenant or secret fields',async()=>{
  await db.query("select set_config('request.jwt.claim.role','authenticated',false)");
  await assert.rejects(claim('groq','openai/gpt-oss-20b'),/SERVICE_ROLE_REQUIRED/);
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
  await claim('groq','openai/gpt-oss-20b');
  const snapshot=await rpc('dabbir_ai_provider_health_snapshot_v1',[]);
  const serialized=JSON.stringify(snapshot);
  assert.match(serialized,/groq/);
  for(const forbidden of ['api_key','credential','prompt','customer','business_id','conversation_id'])assert.equal(serialized.includes(forbidden),false,forbidden);
});
