import { getVercelOidcToken } from '@vercel/oidc';
import {
  AI_PROVIDER_ATTEMPT_TYPES,
  createSupabaseProviderHealthStore,
  isAiProviderCooldown,
  reliableAiProviderFetch,
} from './_ai-provider-reliability.js';

const PROBE_TIMEOUT_MS=3500;
const SYNTHETIC_PROBE_TEXT='Reply exactly OK.';
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const cloudflareEndpoint=env=>`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(String(env.CLOUDFLARE_ACCOUNT_ID||''))}/ai/v1/chat/completions`;

async function gatewayCredential(env,oidcGetter=getVercelOidcToken){
  const explicit=clean(env.AI_GATEWAY_API_KEY||env.VERCEL_OIDC_TOKEN,16384);
  if(explicit)return explicit;
  if(!env.VERCEL_ENV)return '';
  try{return clean(await oidcGetter(),16384);}catch{return ''}
}

export async function configuredRecoveryTargets(env=process.env,{oidcGetter=getVercelOidcToken}={}){
  const targets=[];
  const gemini=clean(env.GEMINI_API_KEY,16384);
  if(gemini)targets.push({provider:'google-gemini',model:clean(env.DABBIR_GEMINI_MODEL||'gemini-3.7-flash',160),endpoint:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',credential:gemini});
  const groq=clean(env.GROQ_API_KEY,16384);
  if(groq)targets.push({provider:'groq',model:clean(env.DABBIR_AI_MODEL||env.DABBIR_GROQ_MODEL||'openai/gpt-oss-20b',160),endpoint:'https://api.groq.com/openai/v1/chat/completions',credential:groq});
  const cloudflare=clean(env.CLOUDFLARE_API_TOKEN,16384);
  if(cloudflare&&clean(env.CLOUDFLARE_ACCOUNT_ID,120))targets.push({provider:'cloudflare-workers-ai',model:clean(env.DABBIR_CLOUDFLARE_MODEL||'@cf/zai-org/glm-4.7-flash',160),endpoint:cloudflareEndpoint(env),credential:cloudflare});
  const gateway=await gatewayCredential(env,oidcGetter);
  if(gateway)targets.push({provider:'vercel-ai-gateway',model:clean(env.DABBIR_AI_GATEWAY_MODEL||'minimax/minimax-m3',160),endpoint:'https://ai-gateway.vercel.sh/v1/chat/completions',credential:gateway});
  return targets;
}

export function recoveryProbeRequest(target){
  return {
    method:'POST',
    cache:'no-store',
    redirect:'manual',
    headers:{'content-type':'application/json',authorization:`Bearer ${target.credential}`},
    body:JSON.stringify({
      model:target.model,
      messages:[{role:'user',content:SYNTHETIC_PROBE_TEXT}],
      temperature:0,
      max_tokens:4,
      stream:false,
    }),
    signal:AbortSignal.timeout(PROBE_TIMEOUT_MS),
  };
}

export async function probeAiProvider(target,{env=process.env,fetchImpl=globalThis.fetch,healthStore,trace=[]}={}){
  const store=healthStore===undefined?createSupabaseProviderHealthStore({env,fetchImpl}):healthStore;
  try{
    const response=await reliableAiProviderFetch(target.endpoint,recoveryProbeRequest(target),{
      provider:target.provider,
      model:target.model,
      attemptType:AI_PROVIDER_ATTEMPT_TYPES.RECOVERY_PROBE,
      env,fetchImpl,healthStore:store,trace,
    });
    return {provider:target.provider,model:target.model,state:response.ok?'PROBE_SUCCEEDED':'PROBE_FAILED',status:Number(response.status)||0};
  }catch(error){
    if(isAiProviderCooldown(error))return {provider:target.provider,model:target.model,state:'SKIPPED',reason:clean(error.reason,80)||'PROVIDER_COOLDOWN'};
    return {provider:target.provider,model:target.model,state:'PROBE_FAILED',error:clean(error?.code||error?.name||error?.message||'PROBE_FAILED',120)};
  }
}

export async function runAiProviderRecovery({env=process.env,fetchImpl=globalThis.fetch,healthStore,oidcGetter=getVercelOidcToken}={}){
  const targets=await configuredRecoveryTargets(env,{oidcGetter});
  const results=[];
  const traces=[];
  for(const target of targets){
    const trace=[];
    const result=await probeAiProvider(target,{env,fetchImpl,healthStore,trace});
    results.push(result);
    traces.push(...trace);
  }
  return {
    state:'RECOVERY_PROBES_EVALUATED',
    configured_targets:targets.length,
    network_probes:traces.filter(item=>item.attempt_type==='RECOVERY_PROBE'&&item.network_attempted===true).length,
    skipped:results.filter(item=>item.state==='SKIPPED').length,
    succeeded:results.filter(item=>item.state==='PROBE_SUCCEEDED').length,
    failed:results.filter(item=>item.state==='PROBE_FAILED').length,
    results,
    attempts:traces.map(item=>({provider:item.provider,model:item.model,attempt_type:item.attempt_type,decision:item.decision,outcome:item.outcome||'SKIPPED',status:item.status??null,reason:item.reason||null,recovery_state:item.recovery_state||null,network_attempted:item.network_attempted===true})),
  };
}

export const AI_PROVIDER_RECOVERY_PROBE_CONTRACT=Object.freeze({
  attempt_type:'RECOVERY_PROBE',
  synthetic_text:SYNTHETIC_PROBE_TEXT,
  max_tokens:4,
  timeout_ms:PROBE_TIMEOUT_MS,
  customer_content:false,
});
