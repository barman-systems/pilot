import { SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

export const AI_PROVIDER_RELIABILITY_VERSION='v2-probe-separated';
export const AI_PROVIDER_COOLDOWN_CODE='AI_PROVIDER_COOLDOWN';
export const AI_PROVIDER_ATTEMPT_TYPES=Object.freeze({CUSTOMER:'CUSTOMER',RECOVERY_PROBE:'RECOVERY_PROBE',BENCHMARK:'BENCHMARK'});
const PROVIDERS=new Set(['google-gemini','groq','cloudflare-workers-ai','vercel-ai-gateway']);
const ATTEMPT_TYPES=new Set(Object.values(AI_PROVIDER_ATTEMPT_TYPES));
const HEALTH_RPC_TIMEOUT_MS=1500;
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const int=value=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;

export function normalizeAiProviderAttemptType(value='CUSTOMER'){
  const type=clean(value,40).toUpperCase()||'CUSTOMER';
  if(!ATTEMPT_TYPES.has(type))throw Object.assign(new Error('AI_PROVIDER_ATTEMPT_TYPE_INVALID'),{code:'AI_PROVIDER_ATTEMPT_TYPE_INVALID'});
  return type;
}

export function providerForAiEndpoint(value=''){
  let url;
  try{url=new URL(String(value));}catch{return null}
  const host=url.hostname.toLowerCase();
  if(host==='generativelanguage.googleapis.com')return 'google-gemini';
  if(host==='api.groq.com')return 'groq';
  if(host==='api.cloudflare.com'&&url.pathname.includes('/ai/'))return 'cloudflare-workers-ai';
  if(host==='ai-gateway.vercel.sh')return 'vercel-ai-gateway';
  return null;
}

export function classifyAiProviderFailure({status=0,error=null}={}){
  const code=int(status);
  if(code>=200&&code<300)return 'SUCCESS';
  if(code===402)return 'BILLING_CAPACITY_HARD_BLOCK';
  if(code===429)return 'RATE_LIMIT';
  if(code===401||code===403)return 'AUTH_CONFIGURATION';
  if(code===408)return 'TIMEOUT';
  if(code>=500&&code<=599)return 'UPSTREAM_5XX';
  if(code>=400&&code<=499)return 'CONTRACT_REQUEST';
  if(error?.name==='AbortError'||error?.code==='ABORT_ERR')return 'TIMEOUT';
  return 'NETWORK';
}

export function retryAfterMs(response,now=Date.now()){
  const raw=clean(response?.headers?.get?.('retry-after'),80);
  if(!raw)return null;
  const seconds=Number(raw);
  if(Number.isFinite(seconds)&&seconds>=0)return Math.min(300000,Math.max(1000,Math.ceil(seconds*1000)));
  const at=Date.parse(raw);
  if(!Number.isFinite(at))return null;
  return Math.min(300000,Math.max(1000,at-now));
}

function serviceRoleKey(env){
  const key=clean(env?.SUPABASE_SERVICE_ROLE_KEY,8192);
  return key&&!key.startsWith('sb_publishable_')?key:null;
}

async function serviceRpc(name,body,{env=process.env,fetchImpl=globalThis.fetch}={}){
  const key=serviceRoleKey(env);
  if(!key||typeof fetchImpl!=='function')throw Object.assign(new Error('AI_PROVIDER_HEALTH_STORE_NOT_CONFIGURED'),{code:'AI_PROVIDER_HEALTH_STORE_NOT_CONFIGURED'});
  const response=await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',cache:'no-store',redirect:'manual',
    headers:supabaseKeyHeaders(key,{accept:'application/json','content-type':'application/json'}),
    body:JSON.stringify(body),signal:AbortSignal.timeout(HEALTH_RPC_TIMEOUT_MS),
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(`AI_PROVIDER_HEALTH_RPC_${response.status}`),{code:`AI_PROVIDER_HEALTH_RPC_${response.status}`});
  return Array.isArray(payload)?payload[0]:payload;
}

export function createSupabaseProviderHealthStore({env=process.env,fetchImpl=globalThis.fetch}={}){
  if(!serviceRoleKey(env))return null;
  return {
    async claim(provider,model,attemptType='CUSTOMER'){
      return serviceRpc('dabbir_ai_provider_health_claim_v1',{
        p_provider:provider,p_model:clean(model,160)||'unknown',p_attempt_type:normalizeAiProviderAttemptType(attemptType),
      },{env,fetchImpl});
    },
    async observe(provider,model,observation){
      return serviceRpc('dabbir_ai_provider_health_observe_v1',{
        p_provider:provider,p_model:clean(model,160)||'unknown',
        p_success:observation.success===true,
        p_failure_class:observation.failureClass||null,
        p_status:observation.status||null,
        p_retry_after_ms:observation.retryAfterMs??null,
        p_latency_ms:int(observation.latencyMs),
        p_attempt_type:normalizeAiProviderAttemptType(observation.attemptType||'CUSTOMER'),
        p_scope:clean(observation.scope||'model',20)||'model',
      },{env,fetchImpl});
    },
    async snapshot(){return serviceRpc('dabbir_ai_provider_health_snapshot_v1',{}, {env,fetchImpl});},
  };
}

function tracePush(trace,event){if(Array.isArray(trace))trace.push({...event,at:new Date().toISOString()});}
function healthWarning(stage,error){console.warn('dabbir_ai_provider_health_degraded',{stage,error:clean(error?.code||error?.message||error,120)});}

export class AiProviderCooldownError extends Error{
  constructor({provider,model,reason,failureClass,cooldownRemainingMs,attemptType='CUSTOMER'}={}){
    super(AI_PROVIDER_COOLDOWN_CODE);
    this.name='AiProviderCooldownError';this.code=AI_PROVIDER_COOLDOWN_CODE;
    this.provider=clean(provider,80);this.model=clean(model,160);this.reason=clean(reason,80)||'PROVIDER_COOLDOWN';
    this.failureClass=clean(failureClass,80)||null;this.cooldownRemainingMs=int(cooldownRemainingMs);
    this.attemptType=normalizeAiProviderAttemptType(attemptType);
  }
}

export function isAiProviderCooldown(error){return error?.code===AI_PROVIDER_COOLDOWN_CODE;}

function skipFromClaim({provider,model,attemptType,claim,trace,reason}){
  const event={
    provider,model,attempt_type:attemptType,decision:'SKIP',network_attempted:false,
    reason:clean(reason||claim?.reason,80)||'PROVIDER_COOLDOWN',
    failure_class:clean(claim?.failure_class,80)||null,
    cooldown_remaining_ms:int(claim?.cooldown_remaining_ms),
    health_state:claim?.health_state||'SHARED',recovery_state:clean(claim?.recovery_state,40)||null,
    scope:clean(claim?.scope,20)||'model',
  };
  tracePush(trace,event);console.info('dabbir_ai_provider_skip',event);
  throw new AiProviderCooldownError({provider,model,reason:event.reason,failureClass:event.failure_class,cooldownRemainingMs:event.cooldown_remaining_ms,attemptType});
}

export async function reliableAiProviderFetch(url,options={},meta={}){
  const provider=clean(meta.provider||providerForAiEndpoint(url),80);
  const model=clean(meta.model,160)||'unknown';
  const env=meta.env||process.env;
  const attemptType=normalizeAiProviderAttemptType(meta.attemptType||env.DABBIR_AI_ATTEMPT_TYPE||'CUSTOMER');
  if(!PROVIDERS.has(provider))throw Object.assign(new Error('AI_PROVIDER_AUTHORITY_UNRECOGNIZED_PROVIDER'),{code:'AI_PROVIDER_AUTHORITY_UNRECOGNIZED_PROVIDER'});
  const transport=meta.fetchImpl||globalThis.fetch;
  if(typeof transport!=='function')throw new TypeError('AI_PROVIDER_TRANSPORT_REQUIRED');
  const store=meta.healthStore===undefined?createSupabaseProviderHealthStore({env}):meta.healthStore;
  const trace=meta.trace;
  let claim={decision:'ATTEMPT',health_state:store?'SHARED':'DEGRADED',scope:'model'};

  if(store){
    try{claim=await store.claim(provider,model,attemptType)||claim;}
    catch(error){
      healthWarning('claim',error);
      if(attemptType!=='BENCHMARK')skipFromClaim({provider,model,attemptType,claim:{health_state:'DEGRADED'},trace,reason:'HEALTH_STATE_UNAVAILABLE'});
      claim={decision:'ATTEMPT',health_state:'DEGRADED',scope:'model'};
    }
  }else if(attemptType==='RECOVERY_PROBE'){
    skipFromClaim({provider,model,attemptType,claim:{health_state:'DEGRADED'},trace,reason:'HEALTH_STORE_REQUIRED'});
  }

  const decision=String(claim?.decision||'ATTEMPT').toUpperCase();
  if(decision==='SKIP')skipFromClaim({provider,model,attemptType,claim,trace});
  if(attemptType==='CUSTOMER'&&decision==='PROBE')skipFromClaim({provider,model,attemptType,claim,trace,reason:'RECOVERY_PROBE_REQUIRED'});
  if(attemptType==='RECOVERY_PROBE'&&decision!=='PROBE')skipFromClaim({provider,model,attemptType,claim,trace,reason:'RECOVERY_PROBE_NOT_GRANTED'});

  const started=Date.now();
  let response;
  try{
    response=await transport(url,options);
  }catch(error){
    const latencyMs=Date.now()-started;
    const failureClass=classifyAiProviderFailure({error});
    let observed=null;
    if(store){
      try{observed=await store.observe(provider,model,{success:false,failureClass,status:null,retryAfterMs:null,latencyMs,attemptType,scope:claim?.scope||'model'});}
      catch(storeError){healthWarning('observe_network',storeError);}
    }
    const event={provider,model,attempt_type:attemptType,decision,network_attempted:true,outcome:failureClass==='TIMEOUT'?'TIMEOUT':'NETWORK_ERROR',failure_class:failureClass,status:null,latency_ms:latencyMs,cooldown_applied_ms:int(observed?.cooldown_ms),health_state:claim.health_state||'SHARED',recovery_state:clean(observed?.recovery_state||claim?.recovery_state,40)||null,scope:clean(claim?.scope,20)||'model'};
    tracePush(trace,event);console.warn('dabbir_ai_provider_attempt',event);
    throw error;
  }

  const latencyMs=Date.now()-started;
  const status=int(response?.status);
  const success=response?.ok===true||(status>=200&&status<300);
  const failureClass=classifyAiProviderFailure({status});
  const retryMs=success?null:retryAfterMs(response);
  let observed=null;
  if(store){
    try{observed=await store.observe(provider,model,{success,failureClass:success?null:failureClass,status,retryAfterMs:retryMs,latencyMs,attemptType,scope:claim?.scope||'model'});}
    catch(error){healthWarning('observe_http',error);}
  }
  const event={provider,model,attempt_type:attemptType,decision,network_attempted:true,outcome:success?'SUCCESS':'HTTP_ERROR',failure_class:success?null:failureClass,status,latency_ms:latencyMs,retry_after_ms:retryMs,cooldown_applied_ms:int(observed?.cooldown_ms),health_state:claim.health_state||'SHARED',recovery_state:clean(observed?.recovery_state||claim?.recovery_state,40)||null,scope:clean(claim?.scope,20)||'model'};
  tracePush(trace,event);
  (success?console.info:console.warn)('dabbir_ai_provider_attempt',event);
  return response;
}

export function summarizeProviderReliability(trace=[],startedAt=Date.now()){
  const rows=Array.isArray(trace)?trace:[];
  const networkAttempts=rows.filter(row=>row.network_attempted===true).length;
  const skipped=rows.filter(row=>row.network_attempted===false&&row.decision==='SKIP').length;
  const byType=type=>rows.filter(row=>row.attempt_type===type);
  return {
    authority_version:AI_PROVIDER_RELIABILITY_VERSION,
    network_attempts:networkAttempts,
    skipped_attempts:skipped,
    provider_attempts_saved:skipped,
    customer_network_attempts:byType('CUSTOMER').filter(row=>row.network_attempted===true).length,
    customer_probe_network_attempts:byType('CUSTOMER').filter(row=>row.network_attempted===true&&row.decision==='PROBE').length,
    recovery_probe_network_attempts:byType('RECOVERY_PROBE').filter(row=>row.network_attempted===true).length,
    benchmark_network_attempts:byType('BENCHMARK').filter(row=>row.network_attempted===true).length,
    chain_latency_ms:Math.max(0,Date.now()-Number(startedAt||Date.now())),
    attempts:rows.slice(0,12).map(row=>({provider:row.provider,model:row.model,attempt_type:row.attempt_type||'CUSTOMER',decision:row.decision,outcome:row.outcome||'SKIPPED',failure_class:row.failure_class||null,status:row.status??null,latency_ms:int(row.latency_ms),retry_after_ms:row.retry_after_ms==null?null:int(row.retry_after_ms),cooldown_remaining_ms:int(row.cooldown_remaining_ms),cooldown_applied_ms:int(row.cooldown_applied_ms),reason:row.reason||null,health_state:row.health_state||null,recovery_state:row.recovery_state||null,scope:row.scope||null})),
  };
}