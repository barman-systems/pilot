import { createHash } from 'node:crypto';
import { SEMANTIC_JSON_SCHEMA } from './_dabbir-semantic-contract.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

export const QWEN37_CANARY_MODEL='alibaba/qwen3.7-flash';
export const QWEN37_CANARY_MAX_PERCENT=1;
export const QWEN37_CANARY_CAPABILITY_KEY='ai.semantic.qwen37_canary';
const QWEN37_CANARY_SCOPE='SEMANTIC_INTERPRETER_ONLY';
const QWEN37_CANARY_TOOL='QWEN37_SEMANTIC_INTERPRETER';
const QWEN37_CANARY_CONTROL_VERSION=1;
const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';
const CONTROL_CACHE_MS=5_000;
const CONTROL_ERROR_CACHE_MS=1_000;
const CONTROL_TIMEOUT_MS=2_000;

const clean=(value,max=160)=>String(value??'').trim().slice(0,max);
let controlCache={key:'',expiresAt:0,value:null};

function disabledControl(source='CAPABILITY_CONTROL_OFF'){
  return {enabled:false,percent:0,source,controlVersion:QWEN37_CANARY_CONTROL_VERSION};
}

function identityFrom({meteringContext,context}={}){
  const businessId=clean(meteringContext?.business?.id||context?.business?.id,80);
  const conversationId=clean(meteringContext?.conversation?.id||context?.conversation?.id,80);
  return {businessId,conversationId};
}

function stableBucket(key){
  const digest=createHash('sha256').update(String(key)).digest();
  return digest.readUInt32BE(0)%10_000;
}

function normalizeCapabilityControl(row){
  if(!row||typeof row!=='object')return disabledControl('CAPABILITY_MISSING');
  const contract=row.contract&&typeof row.contract==='object'&&!Array.isArray(row.contract)?row.contract:{};
  const percent=Number(contract.rollout_percent);
  const contractValid=
    row.capability_key===QWEN37_CANARY_CAPABILITY_KEY
    && row.action_class==='READ'
    && row.risk_level==='LOW'
    && row.tool_name===QWEN37_CANARY_TOOL
    && row.mutates===false
    && row.human_approval===false
    && contract.authority==='runtime_control'
    && contract.scope===QWEN37_CANARY_SCOPE
    && contract.model===QWEN37_CANARY_MODEL
    && Number(contract.control_version)===QWEN37_CANARY_CONTROL_VERSION
    && Number(contract.max_percent)===QWEN37_CANARY_MAX_PERCENT
    && Number.isFinite(percent)
    && percent>=0
    && percent<=QWEN37_CANARY_MAX_PERCENT;
  if(!contractValid)return disabledControl('CAPABILITY_INVALID');
  const enabled=row.enabled===true&&row.shadow_only===false&&percent>0;
  return {
    enabled,
    percent:enabled?percent:0,
    source:enabled?'CAPABILITY_REGISTRY_ACTIVE':row.enabled===true&&row.shadow_only===true?'CAPABILITY_SHADOW_ONLY':'CAPABILITY_DISABLED',
    controlVersion:QWEN37_CANARY_CONTROL_VERSION,
  };
}

export async function loadQwen37CanaryControl({env=process.env,fetchImpl=fetch,now=Date.now(),cache=true}={}){
  const dataUrl=clean(env.SUPABASE_DATA_URL||env.SUPABASE_URL,600).replace(/\/$/,'');
  const serviceKey=clean(env.SUPABASE_SERVICE_ROLE_KEY,8192);
  if(!dataUrl||!serviceKey||serviceKey.startsWith('sb_publishable_'))return disabledControl('CAPABILITY_CONTROL_NOT_CONFIGURED');
  const cacheKey=`${dataUrl}:${createHash('sha256').update(serviceKey).digest('hex').slice(0,16)}`;
  if(cache&&controlCache.key===cacheKey&&controlCache.value&&controlCache.expiresAt>now)return controlCache.value;
  let value;
  try{
    const url=new URL(`${dataUrl}/rest/v1/dabbir_capability_registry`);
    url.searchParams.set('capability_key',`eq.${QWEN37_CANARY_CAPABILITY_KEY}`);
    url.searchParams.set('select','capability_key,action_class,risk_level,tool_name,mutates,human_approval,enabled,shadow_only,contract');
    url.searchParams.set('limit','1');
    const response=await fetchImpl(url,{method:'GET',cache:'no-store',redirect:'manual',headers:supabaseKeyHeaders(serviceKey,{accept:'application/json'}),signal:AbortSignal.timeout(CONTROL_TIMEOUT_MS)});
    if(!response.ok){
      value=disabledControl(`CAPABILITY_CONTROL_HTTP_${Number(response.status)||0}`);
    }else{
      const rows=await response.json().catch(()=>[]);
      value=normalizeCapabilityControl(Array.isArray(rows)?rows[0]:null);
    }
  }catch{
    value=disabledControl('CAPABILITY_CONTROL_UNAVAILABLE');
  }
  if(cache){
    controlCache={key:cacheKey,expiresAt:now+(value.enabled?CONTROL_CACHE_MS:CONTROL_ERROR_CACHE_MS),value};
  }
  return value;
}

export function qwen37CanaryDecision({control=disabledControl(),meteringContext,context}={}){
  const requested=Number(control?.percent||0);
  const enabled=control?.enabled===true;
  const percent=Number.isFinite(requested)?Math.min(QWEN37_CANARY_MAX_PERCENT,Math.max(0,requested)):0;
  const {businessId,conversationId}=identityFrom({meteringContext,context});
  if(!enabled||percent<=0||!businessId||!conversationId)return {selected:false,enabled,percent,bucket:null,businessId,conversationId,source:clean(control?.source,80)||'CAPABILITY_CONTROL_OFF'};
  const bucket=stableBucket(`${businessId}:${conversationId}`);
  return {selected:bucket<Math.round(percent*100),enabled:true,percent,bucket,businessId,conversationId,source:clean(control?.source,80)||'CAPABILITY_REGISTRY_ACTIVE'};
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
