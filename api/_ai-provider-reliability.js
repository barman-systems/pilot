import { SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

export const AI_PROVIDER_RELIABILITY_VERSION='v1';
export const AI_PROVIDER_COOLDOWN_CODE='AI_PROVIDER_COOLDOWN';
const PROVIDERS=new Set(['google-gemini','groq','cloudflare-workers-ai','vercel-ai-gateway']);
const HEALTH_RPC_TIMEOUT_MS=1500;
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const int=value=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;

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
    async claim(provider,model){
      return serviceRpc('dabbir_ai_provider_health_claim_v1',{p_provider:provider,p_model:clean(model,160)||'unknown'},{env,fetchImpl});
    },
    async observe(provider,model,observation){
      return serviceRpc('dabbir_ai_provider_health_observe_v1',{
        p_provider:provider,p_model:clean(model,160)||'unknown',
        p_success:observation.success===true,
        p_failure_class:observation.failureClass||null,
        p_status:observation.status||null,
        p_retry_after_ms:observation.retryAfterMs??null,
        p_latency_ms:int(observation.latencyMs),
      },{env,fetchImpl});
    },
    async snapshot(){return serviceRpc('dabbir_ai_provider_health_snapshot_v1',{}, {env,fetchImpl});},
  };
}

function tracePush(trace,event){if(Array.isArray(trace))trace.push({...event,at:new Date().toISOString()});}
function healthWarning(stage,error){console.warn('dabbir_ai_provider_health_degraded',{stage,error:clean(error?.code||error?.message||error,120)});}

export class AiProviderCooldownError extends Error{
  constructor({provider,model,reason,failureClass,cooldownRemainingMs}={}){
    super(AI_PROVIDER_COOLDOWN_CODE);
    this.name='AiProviderCooldownError';this.code=AI_PROVIDER_COOLDOWN_CODE;
    this.provider=clean(provider,80);this.model=clean(model,160);this.reason=clean(reason,80)||'PROVIDER_COOLDOWN';
    this.failureClass=clean(failureClass,80)||null;this.cooldownRemainingMs=int(cooldownRemainingMs);
  }
}

export function isAiProviderCooldown(error){return error?.code===AI_PROVIDER_COOLDOWN_CODE;}

export async function reliableAiProviderFetch(url,options={},meta={}){
  const provider=clean(meta.provider||providerForAiEndpoint(url),80);
  const model=clean(meta.model,160)||'unknown';
  if(!PROVIDERS.has(provider))throw Object.assign(new Error('AI_PROVIDER_AUTHORITY_UNRECOGNIZED_PROVIDER'),{code:'AI_PROVIDER_AUTHORITY_UNRECOGNIZED_PROVIDER'});
  const env=meta.env||process.env;
  const transport=meta.fetchImpl||globalThis.fetch;
  if(typeof transport!=='function')throw new TypeError('AI_PROVIDER_TRANSPORT_REQUIRED');
  const store=meta.healthStore===undefined?createSupabaseProviderHealthStore({env}):meta.healthStore;
  const trace=meta.trace;
  let claim={decision:'ATTEMPT',health_state:store?'SHARED':'DEGRADED'};
  if(store){
    try{claim=await store.claim(provider,model)||claim;}
    catch(error){claim={decision:'ATTEMPT',health_state:'DEGRADED'};healthWarning('claim',error);}
  }
  if(String(claim?.decision).toUpperCase()==='SKIP'){
    const event={provider,model,decision:'SKIP',network_attempted:false,reason:clean(claim.reason,80)||'PROVIDER_COOLDOWN',failure_class:clean(claim.failure_class,80)||null,cooldown_remaining_ms:int(claim.cooldown_remaining_ms),health_state:claim.health_state||'SHARED'};
    tracePush(trace,event);
    console.info('dabbir_ai_provider_skip',event);
    throw new AiProviderCooldownError({provider,model,reason:event.reason,failureClass:event.failure_class,cooldownRemainingMs:event.cooldown_remaining_ms});
  }

  const started=Date.now();
  let response;
  try{
    response=await transport(url,options);
  }catch(error){
    const latencyMs=Date.now()-started;
    const failureClass=classifyAiProviderFailure({error});
    let observed=null;
    if(store){
      try{observed=await store.observe(provider,model,{success:false,failureClass,status:null,retryAfterMs:null,latencyMs});}
      catch(storeError){healthWarning('observe_network',storeError);}
    }
    const event={provider,model,decision:String(claim?.decision||'ATTEMPT').toUpperCase(),network_attempted:true,outcome:failureClass==='TIMEOUT'?'TIMEOUT':'NETWORK_ERROR',failure_class:failureClass,status:null,latency_ms:latencyMs,cooldown_applied_ms:int(observed?.cooldown_ms),health_state:claim.health_state||'SHARED'};
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
    try{observed=await store.observe(provider,model,{success,failureClass:success?null:failureClass,status,retryAfterMs:retryMs,latencyMs});}
    catch(error){healthWarning('observe_http',error);}
  }
  const event={provider,model,decision:String(claim?.decision||'ATTEMPT').toUpperCase(),network_attempted:true,outcome:success?'SUCCESS':'HTTP_ERROR',failure_class:success?null:failureClass,status,latency_ms:latencyMs,retry_after_ms:retryMs,cooldown_applied_ms:int(observed?.cooldown_ms),health_state:claim.health_state||'SHARED'};
  tracePush(trace,event);
  (success?console.info:console.warn)('dabbir_ai_provider_attempt',event);
  return response;
}

export function summarizeProviderReliability(trace=[],startedAt=Date.now()){
  const rows=Array.isArray(trace)?trace:[];
  const networkAttempts=rows.filter(row=>row.network_attempted===true).length;
  const skipped=rows.filter(row=>row.network_attempted===false&&row.decision==='SKIP').length;
  return {
    authority_version:AI_PROVIDER_RELIABILITY_VERSION,
    network_attempts:networkAttempts,
    skipped_attempts:skipped,
    provider_attempts_saved:skipped,
    chain_latency_ms:Math.max(0,Date.now()-Number(startedAt||Date.now())),
    attempts:rows.slice(0,12).map(row=>({provider:row.provider,model:row.model,decision:row.decision,outcome:row.outcome||'SKIPPED',failure_class:row.failure_class||null,status:row.status??null,latency_ms:int(row.latency_ms),cooldown_remaining_ms:int(row.cooldown_remaining_ms),cooldown_applied_ms:int(row.cooldown_applied_ms),reason:row.reason||null,health_state:row.health_state||null})),
  };
}
