import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const migration=fs.readFileSync(new URL('../supabase/migrations/20260914194000_dabbir_ai_provider_reliability_authority_v1.sql',import.meta.url),'utf8');
const adaptiveMigration=fs.readFileSync(new URL('../supabase/migrations/20260914214500_dabbir_ai_provider_adaptive_quarantine_v1.sql',import.meta.url),'utf8');
const separationMigration=fs.readFileSync(new URL('../supabase/migrations/20260914230000_dabbir_ai_probe_separation_attempt_type_v1.sql',import.meta.url),'utf8');
const rpc=async(name,args=[])=>{
  const placeholders=args.map((_,index)=>`$${index+1}`).join(',');
  const result=await db.query(`select public.${name}(${placeholders}) result`,args);
  return result.rows[0]?.result;
};
const claim=(provider,model,attemptType='CUSTOMER')=>rpc('dabbir_ai_provider_health_claim_v1',[provider,model,attemptType]);
const observe=(provider,model,success,failureClass,status,retryAfterMs,latencyMs=10,attemptType='CUSTOMER',scope='model')=>rpc('dabbir_ai_provider_health_observe_v1',[provider,model,success,failureClass,status,retryAfterMs,latencyMs,attemptType,scope]);
const expireCooldown=async(provider,model)=>db.exec(`update dabbir_private.dabbir_ai_provider_health_v1 set cooldown_until=clock_timestamp()-interval '1 millisecond',probe_lease_until=null where provider='${provider}' and model='${model}'`);
const row=async(provider,model)=>(await db.query('select * from dabbir_private.dabbir_ai_provider_health_v1 where provider=$1 and model=$2',[provider,model])).rows[0];

before(async()=>{
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(migration);
  await db.exec(adaptiveMigration);
  await db.exec(separationMigration);
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
});
after(()=>db.close());
beforeEach(async()=>{
  await db.exec('delete from dabbir_private.dabbir_ai_provider_health_v1');
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
});

test('CUSTOMER during active cooldown always SKIPs and never acquires a probe lease',async()=>{
  const provider='google-gemini',model='gemini-3.7-flash';
  assert.equal((await claim(provider,model)).decision,'ATTEMPT');
  const observed=await observe(provider,model,false,'RATE_LIMIT',429,60000,32);
  assert.equal(observed.recovery_state,'QUARANTINED');
  const customer=await claim(provider,model,'CUSTOMER');
  assert.equal(customer.decision,'SKIP');
  assert.equal(customer.reason,'PROVIDER_COOLDOWN');
  assert.equal((await row(provider,model)).probe_lease_until,null);
});

test('CUSTOMER after cooldown expiry still SKIPs until background recovery proof exists',async()=>{
  const provider='google-gemini',model='gemini-3.7-flash';
  await claim(provider,model);await observe(provider,model,false,'RATE_LIMIT',429,1000,20);
  await expireCooldown(provider,model);
  const customer=await claim(provider,model,'CUSTOMER');
  assert.equal(customer.decision,'SKIP');
  assert.equal(customer.reason,'RECOVERY_PROBE_REQUIRED');
  assert.equal(customer.attempt_type,'CUSTOMER');
  const state=await row(provider,model);
  assert.equal(state.recovery_state,'QUARANTINED');
  assert.equal(Number(state.customer_skip_count),1);
  assert.equal(state.probe_lease_until,null);
});

test('two concurrent RECOVERY_PROBE claims grant exactly one shared lease',async()=>{
  const provider='groq',model='openai/gpt-oss-20b';
  await claim(provider,model);await observe(provider,model,false,'RATE_LIMIT',429,1000,15);
  await expireCooldown(provider,model);
  const [a,b]=await Promise.all([claim(provider,model,'RECOVERY_PROBE'),claim(provider,model,'RECOVERY_PROBE')]);
  assert.deepEqual(new Set([a.decision,b.decision]),new Set(['PROBE','SKIP']));
  const skip=a.decision==='SKIP'?a:b;
  assert.equal(skip.reason,'PROBE_IN_FLIGHT');
  const state=await row(provider,model);
  assert.equal(Number(state.recovery_probe_attempt_count),1);
  assert.ok(state.probe_lease_until);
});

test('failed background probe persists QUARANTINED before customer path can retry',async()=>{
  const provider='cloudflare-workers-ai',model='@cf/zai-org/glm-4.7-flash';
  await claim(provider,model);await observe(provider,model,false,'TIMEOUT',null,null,3500);
  await claim(provider,model);await observe(provider,model,false,'TIMEOUT',null,null,3500);
  await expireCooldown(provider,model);
  const lease=await claim(provider,model,'RECOVERY_PROBE');
  assert.equal(lease.decision,'PROBE');
  const failed=await observe(provider,model,false,'TIMEOUT',null,null,3500,'RECOVERY_PROBE',lease.scope);
  assert.equal(failed.recovery_state,'QUARANTINED');
  const state=await row(provider,model);
  assert.equal(state.probe_lease_until,null);
  assert.equal(state.recovery_state,'QUARANTINED');
  assert.equal(Number(state.recovery_probe_failure_count),1);
  const customer=await claim(provider,model,'CUSTOMER');
  assert.equal(customer.decision,'SKIP');
});

test('first successful recovery probe enters RECOVERING; second returns HEALTHY',async()=>{
  const provider='google-gemini',model='gemini-3.7-flash';
  await claim(provider,model);await observe(provider,model,false,'RATE_LIMIT',429,1000,20);
  await expireCooldown(provider,model);
  const firstLease=await claim(provider,model,'RECOVERY_PROBE');
  const first=await observe(provider,model,true,null,200,null,25,'RECOVERY_PROBE',firstLease.scope);
  assert.equal(first.recovery_state,'RECOVERING');
  assert.equal(first.probe_success_streak,1);
  const customerWhileRecovering=await claim(provider,model,'CUSTOMER');
  assert.equal(customerWhileRecovering.decision,'SKIP');
  await expireCooldown(provider,model);
  const secondLease=await claim(provider,model,'RECOVERY_PROBE');
  const second=await observe(provider,model,true,null,200,null,22,'RECOVERY_PROBE',secondLease.scope);
  assert.equal(second.recovery_state,'HEALTHY');
  assert.equal(second.probe_success_streak,2);
  const customer=await claim(provider,model,'CUSTOMER');
  assert.equal(customer.decision,'ATTEMPT');
  const state=await row(provider,model);
  assert.equal(Number(state.recovery_probe_success_count),2);
  assert.equal(Number(state.recovery_probe_attempt_count),2);
});

test('failure while RECOVERING returns provider to QUARANTINED',async()=>{
  const provider='groq',model='openai/gpt-oss-20b';
  await claim(provider,model);await observe(provider,model,false,'RATE_LIMIT',429,1000,15);
  await expireCooldown(provider,model);
  let lease=await claim(provider,model,'RECOVERY_PROBE');
  await observe(provider,model,true,null,200,null,20,'RECOVERY_PROBE',lease.scope);
  await expireCooldown(provider,model);
  lease=await claim(provider,model,'RECOVERY_PROBE');
  const failed=await observe(provider,model,false,'RATE_LIMIT',429,null,20,'RECOVERY_PROBE',lease.scope);
  assert.equal(failed.recovery_state,'QUARANTINED');
  assert.equal((await claim(provider,model,'CUSTOMER')).decision,'SKIP');
});

test('real CUSTOMER success remains authoritative healthy evidence',async()=>{
  const provider='groq',model='openai/gpt-oss-20b';
  assert.equal((await claim(provider,model,'CUSTOMER')).decision,'ATTEMPT');
  const success=await observe(provider,model,true,null,200,null,18, 'CUSTOMER','model');
  assert.equal(success.recovery_state,'HEALTHY');
  const state=await row(provider,model);
  assert.equal(Number(state.customer_attempt_count),1);
  assert.ok(state.last_customer_success_at);
});

test('402 remains provider-wide and customer traffic cannot become the recovery probe',async()=>{
  const provider='vercel-ai-gateway';
  await claim(provider,'google/gemini-3.7-flash');
  const blocked=await observe(provider,'google/gemini-3.7-flash',false,'BILLING_CAPACITY_HARD_BLOCK',402,null,40);
  assert.equal(blocked.scope,'provider');
  await expireCooldown(provider,'*');
  const customer=await claim(provider,'openai/gpt-5.4','CUSTOMER');
  assert.equal(customer.decision,'SKIP');
  assert.equal(customer.reason,'RECOVERY_PROBE_REQUIRED');
  const probe=await claim(provider,'openai/gpt-5.4','RECOVERY_PROBE');
  assert.equal(probe.decision,'PROBE');
  assert.equal(probe.scope,'provider');
});

test('sustained 429 escalates only through background recovery probes, never customer probes',async()=>{
  const provider='google-gemini',model='gemini-3.7-flash';
  const expected=[15000,30000,60000,120000,300000,600000];
  assert.equal((await claim(provider,model,'CUSTOMER')).decision,'ATTEMPT');
  for(let index=0;index<expected.length;index++){
    if(index>0){
      await expireCooldown(provider,model);
      assert.equal((await claim(provider,model,'CUSTOMER')).decision,'SKIP');
      const probe=await claim(provider,model,'RECOVERY_PROBE');
      assert.equal(probe.decision,'PROBE');
    }
    const attemptType=index===0?'CUSTOMER':'RECOVERY_PROBE';
    const observed=await observe(provider,model,false,'RATE_LIMIT',429,null,50,attemptType,'model');
    assert.equal(observed.consecutive_failures,index+1);
    assert.equal(observed.cooldown_ms,expected[index]);
  }
});

test('BENCHMARK is counted separately and does not mutate customer recovery state',async()=>{
  const provider='groq',model='openai/gpt-oss-20b';
  const bench=await claim(provider,model,'BENCHMARK');
  assert.equal(bench.decision,'ATTEMPT');
  const observed=await observe(provider,model,false,'RATE_LIMIT',429,null,50,'BENCHMARK','model');
  assert.equal(observed.state,'BENCHMARK_ISOLATED');
  const state=await row(provider,model);
  assert.equal(state.recovery_state,'HEALTHY');
  assert.equal(Number(state.benchmark_attempt_count),1);
  assert.equal(Number(state.failure_count),0);
});

test('legacy two-argument claim wrapper is safe CUSTOMER behavior after quarantine',async()=>{
  const provider='google-gemini',model='gemini-3.7-flash';
  await claim(provider,model);await observe(provider,model,false,'RATE_LIMIT',429,1000,20);
  await expireCooldown(provider,model);
  const legacy=await rpc('dabbir_ai_provider_health_claim_v1',[provider,model]);
  assert.equal(legacy.decision,'SKIP');
  assert.equal(legacy.reason,'RECOVERY_PROBE_REQUIRED');
});

test('health RPCs fail closed to non-service callers and snapshot contains no tenant or secret fields',async()=>{
  await db.query("select set_config('request.jwt.claim.role','authenticated',false)");
  await assert.rejects(claim('groq','openai/gpt-oss-20b'),/SERVICE_ROLE_REQUIRED/);
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
  await claim('groq','openai/gpt-oss-20b');
  await observe('groq','openai/gpt-oss-20b',true,null,200,null,10);
  const snapshot=await rpc('dabbir_ai_provider_health_snapshot_v1',[]);
  const serialized=JSON.stringify(snapshot);
  assert.match(serialized,/customer_attempt_count/);
  assert.match(serialized,/recovery_probe_attempt_count/);
  assert.match(serialized,/groq/);
  for(const forbidden of ['api_key','credential','prompt','customer_id','business_id','conversation_id'])assert.equal(serialized.includes(forbidden),false,forbidden);
});