import { createHash } from 'node:crypto';
import { SEMANTIC_JSON_SCHEMA } from './_dabbir-semantic-contract.js';

export const QWEN37_CANARY_MODEL='alibaba/qwen3.7-flash';
export const QWEN37_CANARY_MAX_PERCENT=1;
const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';

const clean=(value,max=160)=>String(value??'').trim().slice(0,max);

function identityFrom({meteringContext,context}={}){
  const businessId=clean(meteringContext?.business?.id||context?.business?.id,80);
  const conversationId=clean(meteringContext?.conversation?.id||context?.conversation?.id,80);
  return {businessId,conversationId};
}

function stableBucket(key){
  const digest=createHash('sha256').update(String(key)).digest();
  return digest.readUInt32BE(0)%10_000;
}

export function qwen37CanaryDecision({env=process.env,meteringContext,context}={}){
  const enabled=String(env.DABBIR_QWEN37_CANARY_ENABLED||'0')==='1';
  const requested=Number(env.DABBIR_QWEN37_CANARY_PERCENT||0);
  const percent=Number.isFinite(requested)?Math.min(QWEN37_CANARY_MAX_PERCENT,Math.max(0,requested)):0;
  const {businessId,conversationId}=identityFrom({meteringContext,context});
  if(!enabled||percent<=0||!businessId||!conversationId)return {selected:false,enabled,percent,bucket:null,businessId,conversationId};
  const bucket=stableBucket(`${businessId}:${conversationId}`);
  return {selected:bucket<Math.round(percent*100),enabled:true,percent,bucket,businessId,conversationId};
}

export function qwen37CanaryEnvironment(env=process.env){
  const vercelEnv=clean(env.VERCEL_ENV,40);
  const apiKey=clean(env.AI_GATEWAY_API_KEY,8192);
  const oidc=clean(env.VERCEL_OIDC_TOKEN,8192);
  if(!vercelEnv&&!apiKey&&!oidc)throw new Error('QWEN37_CANARY_GATEWAY_NOT_CONFIGURED');
  return {
    VERCEL_ENV:vercelEnv||'production',
    DABBIR_AI_GATEWAY_MODEL:QWEN37_CANARY_MODEL,
    ...(apiKey?{AI_GATEWAY_API_KEY:apiKey}:{}),
    ...(oidc?{VERCEL_OIDC_TOKEN:oidc}:{}),
  };
}

export function qwen37CanaryFetch(fetchImpl=fetch){
  return async(url,options={})=>{
    if(String(url)!==GATEWAY_ENDPOINT||!options.body)return fetchImpl(url,options);
    let body;
    try{body=JSON.parse(String(options.body));}
    catch{throw Object.assign(new Error('QWEN37_CANARY_GATEWAY_BODY_INVALID'),{code:'QWEN37_CANARY_GATEWAY_BODY_INVALID'});}
    if(String(body.model||'')!==QWEN37_CANARY_MODEL)throw Object.assign(new Error('QWEN37_CANARY_MODEL_DRIFT'),{code:'QWEN37_CANARY_MODEL_DRIFT'});
    body.providerOptions={
      ...(body.providerOptions||{}),
      gateway:{
        ...(body.providerOptions?.gateway||{}),
        only:['alibaba'],
        order:['alibaba'],
      },
    };
    body.response_format={type:'json_schema',json_schema:{name:'dabbir_semantic_interpretation',strict:true,schema:SEMANTIC_JSON_SCHEMA}};
    body.reasoning={effort:'none'};
    body.max_tokens=Math.max(Number(body.max_tokens)||0,2400);
    return fetchImpl(url,{...options,body:JSON.stringify(body)});
  };
}
