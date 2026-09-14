import { requireSameOrigin } from './_auth-core.js';
import { interpretSemanticMessage, evaluateSemanticProbe } from './_dabbir-semantic-interpreter.js';
import { QWEN37_CANARY_MODEL, qwen37CanaryDecision } from './_dabbir-qwen37-canary.js';

const PROBE_SCOPE='qwen37-canary-live-v2';
const PROBE_BRANCH='fix/qwen37-canary-capability-control';
const SYNTHETIC_BUSINESS_ID='91000000-0000-4000-8000-000000000001';
const REFERENCE_TIME='2026-09-08T18:10:11Z';
const PROBE_CONTROL={enabled:true,percent:1,source:'SYNTHETIC_PROBE_CONTROL'};

function json(res,status,body){
  return res.status(status).setHeader('cache-control','no-store').json(body);
}

function selectedSyntheticIdentity(){
  for(let i=0;i<10_000;i++){
    const conversationId=`92000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
    const context={business:{id:SYNTHETIC_BUSINESS_ID},conversation:{id:conversationId}};
    const decision=qwen37CanaryDecision({control:PROBE_CONTROL,context});
    if(decision.selected)return {conversationId,decision};
  }
  throw Object.assign(new Error('QWEN37_CANARY_PROBE_SELECTION_FAILED'),{code:'QWEN37_CANARY_PROBE_SELECTION_FAILED'});
}

function safeUsage(telemetry){
  const usage=telemetry?.final_request_usage||{};
  return {
    input_tokens:Number(usage.inputTokens??usage.input_tokens)||0,
    output_tokens:Number(usage.outputTokens??usage.output_tokens)||0,
    reasoning_tokens:Number(usage.reasoningTokens??usage.reasoning_tokens)||0,
    latency_ms:Number(telemetry?.latency_ms)||0,
    request_count:Number(telemetry?.request_count)||0,
    actual_cost_usd:typeof telemetry?.actual_cost_usd==='number'?telemetry.actual_cost_usd:null,
  };
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  if(process.env.VERCEL_ENV!=='preview')return json(res,403,{ok:false,error:'PREVIEW_CANARY_PROBE_ONLY'});
  if(String(process.env.VERCEL_GIT_COMMIT_REF||'')!==PROBE_BRANCH)return json(res,403,{ok:false,error:'CANARY_PROBE_BRANCH_MISMATCH'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  if(String(req.headers?.['x-dabbir-canary-probe-scope']||'')!==PROBE_SCOPE)return json(res,403,{ok:false,error:'CANARY_PROBE_SCOPE_REQUIRED'});
  if(req.body?.synthetic!==true)return json(res,403,{ok:false,error:'SYNTHETIC_MODE_REQUIRED'});

  try{
    const {conversationId,decision}=selectedSyntheticIdentity();
    const context={
      business:{id:SYNTHETIC_BUSINESS_ID,business_type:'car_wash',timezone:'Asia/Dubai'},
      conversation:{id:conversationId,state:'ai_active'},
      services:[{name:'غسيل كامل'}],
      activity:{delivery_mode:'MOBILE',required:['service','vehicle','location','date','time']},
    };
    const result=await interpretSemanticMessage({
      message:'فاضين بكره 9 الصبح',
      referenceTime:REFERENCE_TIME,
      context,
      meteringContext:{synthetic:true},
      env:process.env,
      canaryControlLoader:async()=>PROBE_CONTROL,
    });
    const semantic=evaluateSemanticProbe(result.proposal);
    const canary=result.telemetry?.qwen37_canary||{};
    const passed=Boolean(
      semantic.passed
      && result.provider==='vercel-ai-gateway'
      && result.model===QWEN37_CANARY_MODEL
      && canary.selected===true
      && canary.fallback===false
      && decision.selected===true
    );
    return json(res,passed?200:502,{
      ok:passed,
      state:passed?'SUCCESS':'FAILED',
      model:result.model||null,
      provider:result.provider||null,
      canary:{selected:Boolean(canary.selected),fallback:Boolean(canary.fallback),percent:Number(canary.percent)||0,bucket:Number(canary.bucket),control:String(canary.source||'').slice(0,80)},
      semantic_checks:semantic.checks,
      usage:safeUsage(result.telemetry),
      synthetic_only:true,
      customer_delivery:false,
      database_metering:false,
      production_mutations:0,
      timestamp:new Date().toISOString(),
    });
  }catch(error){
    const code=String(error?.code||error?.message||'QWEN37_CANARY_PROBE_FAILED');
    const safe=/^(?:QWEN37_CANARY_[A-Z_]+|AI_PLANNER_[A-Z_]+)$/.test(code)?code:'QWEN37_CANARY_PROBE_FAILED';
    return json(res,500,{ok:false,error:safe,synthetic_only:true,customer_delivery:false,database_metering:false,production_mutations:0});
  }
}
