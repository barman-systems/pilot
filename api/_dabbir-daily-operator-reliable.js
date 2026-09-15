import {
  DAILY_OPERATOR_POLICY,
  DAILY_OPERATOR_VERSION,
  enhanceSummaryFreeFirst as enhanceCoreSummary,
  runDailyBusinessReview as runCoreDailyBusinessReview,
  runDailyOperatorBatch as runCoreDailyOperatorBatch,
} from './_dabbir-daily-operator-core.js';
import { createAiProviderAuthorityFetch } from './_ai-provider-authority-fetch.js';
import { SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

export * from './_dabbir-daily-operator-core.js';

const clean=(value,max=1000)=>String(value??'').trim().slice(0,max);
const safeArray=value=>Array.isArray(value)?value:[];

function localDateKey(value,timeZone='Asia/Dubai'){
  try{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    const map=Object.fromEntries(parts.filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }catch{return new Date(value).toISOString().slice(0,10)}
}

function usageBody(businessId,operationKey,evidence){
  const usage=evidence?.usage||{};
  return {
    p_business_id:businessId,
    p_operation_key:`${operationKey}:free-ai`,
    p_operation_type:'operator.daily_business_review.analysis',
    p_channel:'daily_operator',
    p_provider:evidence.provider,
    p_model:evidence.model,
    p_cost_mode:'FREE_TIER_ONLY',
    p_input_tokens:usage.input_tokens||0,
    p_output_tokens:usage.output_tokens||0,
    p_reasoning_tokens:usage.reasoning_tokens||0,
    p_request_count:Math.max(1,safeArray(evidence.attempts).reduce((sum,item)=>sum+Math.max(1,Number(item.attempt_count)||1),0)),
    p_actual_cost_microusd:null,
    p_cost_source:'DIRECT_PROVIDER_COST_UNPRICED',
    p_metadata:{feature:'daily_operator_analysis',version:DAILY_OPERATOR_VERSION,attempts:evidence.attempts},
  };
}

async function recordDirectEnhancementUsage({args,businessId,operationKey,evidence}){
  if(evidence?.state!=='FREE_DIRECT_VERIFIED'||!evidence?.provider)return null;
  const body=usageBody(businessId,operationKey,evidence);
  let receipt;
  if(typeof args.restClient==='function'){
    receipt=await args.restClient(args.key,'rpc/dabbir_record_ai_usage_v1',{
      method:'POST',headers:{'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify(body),
    });
  }else{
    const env=args.env||process.env;
    const key=clean(args.key||env.SUPABASE_SERVICE_ROLE_KEY,8192);
    if(!key||key.startsWith('sb_publishable_'))throw new Error('DAILY_OPERATOR_AI_USAGE_METER_UNVERIFIED');
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_record_ai_usage_v1`,{
      method:'POST',cache:'no-store',redirect:'manual',
      headers:supabaseKeyHeaders(key,{accept:'application/json','content-type':'application/json',prefer:'return=representation'}),
      body:JSON.stringify(body),signal:AbortSignal.timeout(8_000),
    });
    const text=await response.text();
    try{receipt=text?JSON.parse(text):null}catch{receipt=null}
    if(!response.ok)throw new Error(`DAILY_OPERATOR_AI_USAGE_METER_HTTP_${response.status}`);
  }
  if(receipt?.ok!==true)throw new Error('DAILY_OPERATOR_AI_USAGE_METER_UNVERIFIED');
  return receipt;
}

function optionsWithAuthority(options={}){
  const env=options.env||process.env;
  const trace=[];
  const fetchImpl=createAiProviderAuthorityFetch({
    env,
    fetchImpl:options.fetchImpl||globalThis.fetch,
    healthStore:options.providerHealthStore,
    trace,
  });
  return {...options,env,fetchImpl};
}

export async function runDailyBusinessReview(args={}){
  const env=args.env||process.env;
  const authorityArgs=optionsWithAuthority(args);
  const baseEnhance=args.enhance||enhanceCoreSummary;
  const businessId=args.business?.id;
  const timezone=clean(args.business?.timezone,80)||'Asia/Dubai';
  const day=localDateKey(args.now||new Date(),timezone);
  const operationKey=`${DAILY_OPERATOR_POLICY}:${day}:${DAILY_OPERATOR_VERSION}`;
  const meteredEnhance=async(report,options={})=>{
    const enhanced=await baseEnhance(report,{...options,env,fetchImpl:authorityArgs.fetchImpl});
    if(!enhanced?.ok||enhanced?.evidence?.state!=='FREE_DIRECT_VERIFIED')return enhanced;
    try{
      await recordDirectEnhancementUsage({args:{...args,env},businessId,operationKey,evidence:enhanced.evidence});
      return {
        ...enhanced,
        evidence:{
          ...enhanced.evidence,
          state:'FREE_DIRECT_METER_VERIFIED',
          meter_state:'VERIFIED',
        },
      };
    }catch(error){
      return {
        ok:false,
        evidence:{
          ...enhanced.evidence,
          state:'FREE_DIRECT_METER_UNVERIFIED',
          reason:'AI_USAGE_METER_UNVERIFIED',
          meter_error:clean(error?.message||error,120),
        },
      };
    }
  };
  return runCoreDailyBusinessReview({...authorityArgs,enhance:meteredEnhance});
}

export async function runDailyOperatorBatch(args={}){
  const env=args.env||process.env;
  const upstreamFetch=args.fetchImpl||globalThis.fetch;
  const providerHealthStore=args.providerHealthStore;
  const runner=args.runner||((runArgs)=>runDailyBusinessReview({...runArgs,env,fetchImpl:upstreamFetch,providerHealthStore}));
  return runCoreDailyOperatorBatch({...args,env,runner});
}
