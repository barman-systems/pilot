import crypto from 'node:crypto';

const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=240)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,n);
const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const sha256=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex');
const ALLOWED_MODES=new Set(['off','preview','sampled']);
const SAFE_ENTITY_FIELDS=new Set(['service','date','time','delivery_mode','price']);

export const V3_REASONING_OBSERVER_POLICY=Object.freeze({
  contract:'DABBIR_V3_REASONING_OBSERVER_V1',
  max_input_bytes:12000,
  max_message_chars:1200,
  max_services:12,
  max_verified_entities:8,
  max_latency_ms:4000,
  max_cost_usd:0.0015,
  max_production_sample_permille:10,
  max_preview_sample_permille:100,
  production_ack:'OBSERVER_ONLY_NO_AUTHORITY_V1',
});

export function reasoningObserverConfig(env=process.env){
  const requested=clean(env.DABBIR_V3_REASONING_OBSERVER_MODE,20).toLowerCase()||'off';
  const mode=ALLOWED_MODES.has(requested)?requested:'off';
  const environment=clean(env.VERCEL_ENV,20).toLowerCase()||'unknown';
  const killSwitch=String(env.DABBIR_V3_REASONING_OBSERVER_KILL_SWITCH||'0').trim()==='1';
  const ack=clean(env.DABBIR_V3_REASONING_OBSERVER_PRODUCTION_ACK,80);
  const rawPermille=Math.max(0,Math.floor(finite(env.DABBIR_V3_REASONING_OBSERVER_SAMPLE_PERMILLE,0)));
  const maxPermille=environment==='production'?V3_REASONING_OBSERVER_POLICY.max_production_sample_permille:V3_REASONING_OBSERVER_POLICY.max_preview_sample_permille;
  const samplePermille=Math.min(rawPermille,maxPermille);
  const productionAuthorized=environment!=='production'||ack===V3_REASONING_OBSERVER_POLICY.production_ack;
  const environmentAllowed=mode==='preview'?environment==='preview':mode==='sampled';
  const enabled=!killSwitch&&mode!=='off'&&environmentAllowed&&productionAuthorized&&samplePermille>0;
  return Object.freeze({mode,environment,enabled,kill_switch:killSwitch,production_authorized:productionAuthorized,sample_permille:samplePermille,max_latency_ms:V3_REASONING_OBSERVER_POLICY.max_latency_ms,max_cost_usd:V3_REASONING_OBSERVER_POLICY.max_cost_usd});
}

export function shouldSampleReasoningObservation({batchId,config}={}){
  if(!config?.enabled||!batchId||Number(config.sample_permille)<=0)return false;
  const bucket=Number.parseInt(sha256(batchId).slice(0,8),16)%1000;
  return bucket<Number(config.sample_permille);
}

function latestMessage(context){
  return arr(context?.batch_messages).map(row=>clean(row?.body,V3_REASONING_OBSERVER_POLICY.max_message_chars)).filter(Boolean).join('\n').slice(0,V3_REASONING_OBSERVER_POLICY.max_message_chars);
}
function compactServices(context){
  const rows=arr(context?.activity_profile?.services||context?.services).slice(0,V3_REASONING_OBSERVER_POLICY.max_services);
  return rows.map(row=>({
    service_id:clean(row?.service_id||row?.id,80)||null,
    name_ar:clean(row?.name_ar||row?.name,120)||null,
    name_en:clean(row?.name_en,120)||null,
    price:Number.isFinite(Number(row?.price))?Number(row.price):null,
    currency_code:clean(row?.currency_code||context?.business?.currency_code,8)||null,
    supported_actions:arr(row?.supported_actions||row?.actions).map(x=>clean(x,40)).filter(Boolean).slice(0,8),
  }));
}
function compactEntities(load){
  const src=load?.semantic_state?.entities&&typeof load.semantic_state.entities==='object'?load.semantic_state.entities:{};
  const out={};
  for(const field of SAFE_ENTITY_FIELDS){
    const row=src[field];if(!row||row.value==null)continue;
    out[field]={value:typeof row.value==='string'?clean(row.value,120):row.value,source:clean(row.source,50)||null,status:clean(row.status,30)||null};
    if(Object.keys(out).length>=V3_REASONING_OBSERVER_POLICY.max_verified_entities)break;
  }
  return out;
}

export function buildReasoningObserverProjection({context,load}={}){
  const message=latestMessage(context);
  const projection={
    contract:V3_REASONING_OBSERVER_POLICY.contract,
    message,
    language:clean(load?.semantic_state?.language||context?.conversation?.language,12)||(/[\u0600-\u06FF]/.test(message)?'ar':'en'),
    business:{business_type:clean(context?.business?.business_type,60)||null,timezone:clean(context?.business?.timezone,60)||null,currency_code:clean(context?.business?.currency_code,8)||null},
    semantic:{goal:clean(load?.semantic_state?.goal,80)||null,intent:clean(load?.semantic_state?.intent,80)||null,missing_fields:arr(load?.semantic_state?.missing_fields).map(x=>clean(x,60)).filter(Boolean).slice(0,12),pending_action:clean(load?.semantic_state?.pending_action,80)||null,entities:compactEntities(load)},
    activity:{services:compactServices(context)},
    authority:{customer_visible:false,mutation_authority:false,execution_authority:false,allowed_tools:['inspect_context','find_options_read_only']},
  };
  const bytes=Buffer.byteLength(JSON.stringify(projection),'utf8');
  if(bytes>V3_REASONING_OBSERVER_POLICY.max_input_bytes)throw Object.assign(new Error('V3_REASONING_OBSERVER_INPUT_TOO_LARGE'),{code:'V3_REASONING_OBSERVER_INPUT_TOO_LARGE'});
  return projection;
}

export function sanitizeReasoningObservationOutcome(outcome={}){
  const latency=Math.max(0,Math.round(finite(outcome.latency_ms,0)));
  const cost=Math.max(0,finite(outcome.cost_usd,0));
  const guardCodes=arr(outcome.guard_codes).map(x=>clean(x,80)).filter(Boolean).slice(0,12);
  const kind=['ASK','PROPOSE','SAFE_STOP','TOOL'].includes(outcome.kind)?outcome.kind:'SAFE_STOP';
  const budgetOk=latency<=V3_REASONING_OBSERVER_POLICY.max_latency_ms&&cost<=V3_REASONING_OBSERVER_POLICY.max_cost_usd;
  return Object.freeze({kind,goal:clean(outcome.goal,80)||null,tool:kind==='TOOL'&&['inspect_context','find_options_read_only'].includes(outcome.tool)?outcome.tool:null,needs_revalidation:outcome.needs_revalidation===true,confidence:Math.max(0,Math.min(1,finite(outcome.confidence,0))),guard_codes:guardCodes,provider:clean(outcome.provider,80)||null,model:clean(outcome.model,120)||null,latency_ms:latency,cost_usd:cost,budget_ok:budgetOk,customer_visible:false,mutation_authority:false,execution_authority:false});
}

export function reasoningObservationLog({batchId,projection,outcome,error=null}={}){
  const safe=sanitizeReasoningObservationOutcome(outcome||{});
  const inputJson=JSON.stringify(projection||{});
  return Object.freeze({event:'DABBIR_V3_REASONING_OBSERVER',version:1,batch_fingerprint:batchId?sha256(batchId).slice(0,20):null,input_sha256:sha256(inputJson),input_bytes:Buffer.byteLength(inputJson,'utf8'),message_chars:String(projection?.message||'').length,kind:safe.kind,goal:safe.goal,tool:safe.tool,needs_revalidation:safe.needs_revalidation,confidence:safe.confidence,guard_codes:safe.guard_codes,provider:safe.provider,model:safe.model,latency_ms:safe.latency_ms,cost_usd:safe.cost_usd,budget_ok:safe.budget_ok,error_code:error?clean(error?.code||error?.message||error,100):null,customer_visible:false,mutation_authority:false,execution_authority:false});
}

export function assertReasoningObserverBoundary(value={}){
  if(value?.customer_visible!==false||value?.mutation_authority!==false||value?.execution_authority!==false)throw Object.assign(new Error('V3_REASONING_OBSERVER_AUTHORITY_VIOLATION'),{code:'V3_REASONING_OBSERVER_AUTHORITY_VIOLATION'});
  if(Number(value?.latency_ms||0)>V3_REASONING_OBSERVER_POLICY.max_latency_ms||Number(value?.cost_usd||0)>V3_REASONING_OBSERVER_POLICY.max_cost_usd)throw Object.assign(new Error('V3_REASONING_OBSERVER_BUDGET_EXCEEDED'),{code:'V3_REASONING_OBSERVER_BUDGET_EXCEEDED'});
  return true;
}
