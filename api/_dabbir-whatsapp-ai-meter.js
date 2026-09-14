import { createHash } from 'node:crypto';
import { generateDABBIRAiReply as generateCoreReply } from './_ai-core.js';
import { providerForAiEndpoint, retryAfterMs } from './_ai-provider-reliability.js';
import { SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';
const clean=(value,max=400)=>String(value??'').trim().slice(0,max);
const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const int=value=>Math.max(0,Math.trunc(finite(value)));
const hash=value=>createHash('sha256').update(String(value)).digest('hex');

function contextIdentity(raw){
  try{
    const value=typeof raw==='string'?JSON.parse(raw):raw;
    const history=Array.isArray(value?.conversation_history)?value.conversation_history:[];
    const last=history.at(-1)||{};
    return {
      businessId:clean(value?.business?.id,80),
      conversationId:clean(value?.conversation?.id,80),
      messageTimestamp:clean(value?.batch_message_created_at||last?.created_at,80),
    };
  }catch{return {businessId:'',conversationId:'',messageTimestamp:''}}
}

function usageFromPayload(payload={}){
  const usage=payload?.usage||{};
  return {
    inputTokens:int(usage.prompt_tokens??usage.input_tokens),
    outputTokens:int(usage.completion_tokens??usage.output_tokens),
    reasoningTokens:int(usage?.completion_tokens_details?.reasoning_tokens??usage.reasoning_tokens),
  };
}

export function actualGatewayCost(payload={},response){
  const candidates=[
    payload?.providerMetadata?.gateway?.cost,
    payload?.provider_metadata?.gateway?.cost,
    payload?.usage?.cost,
    payload?.cost,
    response?.headers?.get?.('x-vercel-ai-gateway-cost'),
  ];
  for(const value of candidates){
    if(typeof value!=='number'&&(typeof value!=='string'||!value.trim()))continue;
    const number=Number(value);
    if(Number.isFinite(number)&&number>=0)return number;
  }
  return null;
}

async function recordUsage({businessId,operationKey,result,attempts,skippedAttempts,usage,actualCostUsd}){
  const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);
  if(!businessId||!key||key.startsWith('sb_publishable_'))return {ok:false,state:'METER_NOT_CONFIGURED'};
  const provider=clean(result?.provider,120)||'unknown';
  const gateway=provider==='vercel-ai-gateway';
  const body={
    p_business_id:businessId,
    p_operation_key:operationKey,
    p_operation_type:'whatsapp.customer_ai_reply',
    p_channel:'whatsapp',
    p_provider:provider,
    p_model:clean(result?.model,160)||null,
    p_cost_mode:gateway?'PAID_FALLBACK':'FREE_FIRST_DIRECT',
    p_input_tokens:usage.inputTokens,
    p_output_tokens:usage.outputTokens,
    p_reasoning_tokens:usage.reasoningTokens,
    p_request_count:Math.max(1,attempts.length),
    p_actual_cost_microusd:actualCostUsd==null?null:Math.max(0,Math.ceil(actualCostUsd*1_000_000)),
    p_cost_source:actualCostUsd==null?(gateway?'VERCEL_REPORT_RECONCILIATION_REQUIRED':'DIRECT_PROVIDER_COST_UNPRICED'):'VERIFIED_GATEWAY_RESPONSE',
    p_metadata:{
      final_provider:provider,
      final_model:clean(result?.model,160)||null,
      auth_mode:clean(result?.auth_mode,80)||null,
      core_cost_mode:clean(result?.cost_mode,80)||null,
      gateway_user_attribution:gateway,
      attempts:attempts.slice(0,8),
      skipped_attempts:(skippedAttempts||[]).slice(0,8),
      provider_reliability:result?.telemetry?.provider_reliability||null,
      billing_note:gateway?'Paid fallback is attributed to business_id in Vercel AI Gateway; exact report cost remains authoritative when response cost is absent.':'Direct-provider calls are metered by tokens; monetary cost is not guessed when the provider response has no billing amount.',
    },
  };
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_record_ai_usage_v1`,{
    method:'POST',cache:'no-store',redirect:'manual',
    headers:supabaseKeyHeaders(key,{accept:'application/json','content-type':'application/json',prefer:'return=representation'}),
    body:JSON.stringify(body),signal:AbortSignal.timeout(8000),
  });
  if(!response.ok)throw new Error(`AI_USAGE_METER_HTTP_${response.status}`);
  return response.json().catch(()=>({ok:true}));
}

export async function generateDABBIRAiReply(args={}){
  const identity=contextIdentity(args.meteringContext||args.businessContext);
  const attempts=[];
  let successfulPayload=null;
  let successfulResponse=null;
  const upstreamFetch=args.fetchImpl||fetch;

  const meteredFetch=async(url,options={})=>{
    let nextOptions=options;
    const endpoint=String(url||'');
    const provider=providerForAiEndpoint(endpoint)||'unknown';
    let requestedModel=null;
    if(options?.body){
      try{
        const parsed=JSON.parse(String(options.body));
        requestedModel=clean(parsed?.model,160)||null;
        if(endpoint===GATEWAY_ENDPOINT&&identity.businessId){
          parsed.providerOptions={...(parsed.providerOptions||{}),gateway:{...(parsed.providerOptions?.gateway||{}),user:identity.businessId,tags:['channel:whatsapp','feature:customer-ai-reply']}};
          nextOptions={...options,body:JSON.stringify(parsed)};
        }
      }catch{}
    }
    const started=Date.now();
    let response;
    try{response=await upstreamFetch(url,nextOptions);}catch(error){
      if(['SEMANTIC_PROVIDER_BUDGET','SEMANTIC_PROVIDER_RESERVED'].includes(error?.code))throw error;
      attempts.push({endpoint:provider,model:requestedModel,status:0,duration_ms:Date.now()-started,outcome:error?.name==='AbortError'?'TIMEOUT':'NETWORK_ERROR'});
      throw error;
    }
    const attempt={endpoint:provider,model:requestedModel,status:Number(response?.status)||0,duration_ms:Date.now()-started,retry_after_ms:retryAfterMs(response)};
    attempts.push(attempt);
    if(response?.ok){
      try{
        const payload=await response.clone().json();
        successfulPayload=payload;
        successfulResponse=response;
      }catch{}
    }
    return response;
  };

  const startedAt=Date.now();
  const coreResult=await generateCoreReply({...args,fetchImpl:meteredFetch});
  const reliability=coreResult?.telemetry?.provider_reliability||null;
  const skippedAttempts=(reliability?.attempts||[]).filter(item=>item?.outcome==='SKIPPED'||item?.decision==='SKIP').map(item=>({provider:item.provider,model:item.model||null,reason:item.reason||'PROVIDER_COOLDOWN',failure_class:item.failure_class||null,retry_after_ms:item.cooldown_remaining_ms||0}));
  const reportedUsage=successfulPayload?.usage;
  const hasUsage=reportedUsage&&[reportedUsage.prompt_tokens??reportedUsage.input_tokens,reportedUsage.completion_tokens??reportedUsage.output_tokens].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);
  const actualCostUsd=coreResult?.provider==='vercel-ai-gateway'?actualGatewayCost(successfulPayload||{},successfulResponse):null;
  const result={...coreResult,telemetry:{...(coreResult?.telemetry||{}),final_request_usage:hasUsage?usageFromPayload(successfulPayload):null,actual_cost_usd:actualCostUsd,
    latency_ms:Date.now()-startedAt,request_count:attempts.length,attempts:attempts.map(a=>({provider:a.endpoint,model:a.model||null,status:a.status,latency_ms:a.duration_ms,retry_after_ms:a.retry_after_ms??null})),skipped_attempts:skippedAttempts}};
  if(!result?.ok){
    console.warn('dabbir_whatsapp_ai_provider_chain_failed',{attempts:attempts.slice(0,8).map(a=>({provider:a.endpoint,status:a.status,duration_ms:a.duration_ms,outcome:a.outcome||'HTTP_RESPONSE'})),skipped_attempts:skippedAttempts.slice(0,8),configured_attempts:attempts.length});
    return result;
  }
  if(!identity.businessId)return result;

  const usage=usageFromPayload(successfulPayload||{});
  const operationKey=`wa-ai-usage:${hash([identity.businessId,identity.conversationId,identity.messageTimestamp,clean(args.message,2000)].join('|')).slice(0,48)}`;
  await recordUsage({businessId:identity.businessId,operationKey,result,attempts,skippedAttempts,usage,actualCostUsd}).catch(error=>{
    console.warn('dabbir_whatsapp_ai_meter_failed',{error:clean(error?.message||error,120),provider:clean(result?.provider,80)});
  });
  return result;
}
