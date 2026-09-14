import { generateDABBIRAiReply } from './_dabbir-whatsapp-ai-meter.js';
import { sanitizeSemanticText, sanitizeSemanticContext } from './_dabbir-semantic-privacy.js';
import { validSemanticContract, semanticRequestSpans } from './_dabbir-semantic-contract.js';
import { applyDeterministicSemanticIntentPolicy } from './_dabbir-semantic-intent-policy.js';
import { understandConversation } from './_dabbir-semantic-engine.js';
import { QWEN37_CANARY_MODEL, loadQwen37CanaryControl, qwen37CanaryDecision, qwen37CanaryEnvironment, qwen37CanaryFetch } from './_dabbir-qwen37-canary.js';
import registry from './_dabbir-activity-registry.json' with {type:'json'};

const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';
const GATEWAY_GEMINI_SEMANTIC_MAX_TOKENS=2400;

function groundedServiceName(x,message,context) {
  const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const name=typeof x.service_name==='string'?x.service_name.trim():'';
  const names=(Array.isArray(context?.services)?context.services:[]).map(s=>s?.name).filter(n=>typeof n==='string');
  if(!name || !names.some(n=>norm(n)===norm(name)))return null;
  const text=sanitizeSemanticText(message);
  const evidence=typeof x.service_evidence==='string'?x.service_evidence.trim():name;
  if(!evidence || evidence.length>180 || !text.includes(evidence))return null;
  const mention=norm(evidence),label=norm(name);
  if(mention.length<2 || !(` ${label} `.includes(` ${mention} `)||` ${mention} `.includes(` ${label} `)))return null;
  return name;
}

function semanticRoleHistory(context) {
  const recent=Array.isArray(context?.recent_conversation)?context.recent_conversation:[];
  return recent.slice(-8).flatMap(item=>{
    const sender=String(item?.sender_type??item?.role??'').toLowerCase();
    const role=sender==='customer'||sender==='user'?'user':['ai','assistant','human'].includes(sender)?'assistant':null;
    const content=sanitizeSemanticText(item?.body??item?.content??'').trim().slice(0,600);
    return role&&content?[{role,content}]:[];
  }).slice(-4);
}

function providerSemanticContext(context,referenceTime) {
  const source=context&&typeof context==='object'&&!Array.isArray(context)?context:{};
  const {recent_conversation:_recentConversation,...rest}=source;
  return sanitizeSemanticContext({...rest,reference_time:referenceTime});
}

function gatewaySemanticOptions(url,options={}) {
  if(String(url)!==GATEWAY_ENDPOINT || !options.body)return options;
  try{
    const body=JSON.parse(String(options.body));
    const model=String(body?.model||'');
    if(body?.response_format?.type==='json_object' && model.startsWith('google/gemini-')){
      body.max_tokens=Math.max(Number(body.max_tokens)||0,GATEWAY_GEMINI_SEMANTIC_MAX_TOKENS);
      body.reasoning={effort:'low'};
      return {...options,body:JSON.stringify(body)};
    }
  }catch{}
  return options;
}

function makeSemanticFetch({activeEnv,fetchImpl,budgetMs=18000,maxAttempts=4}){
  const deadline=Date.now()+budgetMs;
  let attempts=0;
  return async(url,options={})=>{
    const remaining=deadline-Date.now();
    if(attempts>=maxAttempts || remaining<=0) throw Object.assign(new Error('SEMANTIC_PROVIDER_BUDGET'),{code:'SEMANTIC_PROVIDER_BUDGET'});
    const reserve=activeEnv.VERCEL_ENV&&String(url)!==GATEWAY_ENDPOINT?6000:0;
    if(reserve&&(attempts>=maxAttempts-1||remaining<=reserve))throw Object.assign(new Error('SEMANTIC_PROVIDER_RESERVED'),{code:'SEMANTIC_PROVIDER_RESERVED'});
    attempts++;
    const nextOptions=gatewaySemanticOptions(url,options);
    const signal=AbortSignal.timeout(Math.max(1,remaining-reserve));
    return fetchImpl(url,{...nextOptions,signal:nextOptions.signal?AbortSignal.any([signal,nextOptions.signal]):signal});
  };
}

async function requestSemanticProvider({message,context,referenceTime,meteringContext,activeEnv,fetchImpl,budgetMs,maxAttempts}){
  const bounded=makeSemanticFetch({activeEnv,fetchImpl,budgetMs,maxAttempts});
  return generateDABBIRAiReply({project:'dabbir_businesses',semantic:true,
    message:sanitizeSemanticText(message).slice(0,2000),
    businessContext:JSON.stringify(providerSemanticContext(context,referenceTime)),
    history:semanticRoleHistory(context),fetchImpl:bounded,env:activeEnv,meteringContext});
}

function acceptedQwen37CanaryResult(result){
  return Boolean(result?.ok
    && validSemanticContract(result.reply)
    && result.provider==='vercel-ai-gateway'
    && String(result.model||'')===QWEN37_CANARY_MODEL);
}

export async function interpretSemanticMessage({ message, context, referenceTime, meteringContext, fetchImpl=fetch, env=process.env, canaryControlLoader=loadQwen37CanaryControl }) {
  let control;
  try{
    control=await canaryControlLoader({env});
  }catch{
    control={enabled:false,percent:0,source:'CAPABILITY_CONTROL_LOADER_FAILED'};
  }
  const canary=qwen37CanaryDecision({control,meteringContext,context});
  let result;
  let canaryFallback=false;
  let canaryFailure=null;

  if(canary.selected){
    try{
      const candidateEnv=qwen37CanaryEnvironment(env);
      result=await requestSemanticProvider({
        message,context,referenceTime,meteringContext,
        activeEnv:candidateEnv,
        fetchImpl:qwen37CanaryFetch(fetchImpl),
        budgetMs:7000,
        maxAttempts:2,
      });
      if(!acceptedQwen37CanaryResult(result))throw Object.assign(new Error('QWEN37_CANARY_RESULT_REJECTED'),{code:'QWEN37_CANARY_RESULT_REJECTED'});
    }catch(error){
      canaryFallback=true;
      canaryFailure=String(error?.code||error?.message||'QWEN37_CANARY_FAILED').slice(0,80);
      console.warn('dabbir_qwen37_canary_fallback',{reason:canaryFailure,bucket:canary.bucket,percent:canary.percent});
      result=await requestSemanticProvider({message,context,referenceTime,meteringContext,activeEnv:env,fetchImpl,budgetMs:18000,maxAttempts:4});
    }
  }else{
    result=await requestSemanticProvider({message,context,referenceTime,meteringContext,activeEnv:env,fetchImpl,budgetMs:18000,maxAttempts:4});
  }

  if(!result?.ok) throw Object.assign(new Error('AI_PLANNER_UNAVAILABLE'),{code:'AI_PLANNER_UNAVAILABLE',telemetry:result?.telemetry||null});
  if(!validSemanticContract(result.reply)) throw Object.assign(new Error('AI_PLANNER_CONTRACT_INVALID'),{code:'AI_PLANNER_CONTRACT_INVALID',telemetry:result.telemetry||null});
  const x=JSON.parse(result.reply);
  const serviceQuestion=x.service_question&&x.confidence>=.8&&sanitizeSemanticText(message).includes(x.service_question.evidence)
    ? {...x.service_question,explicit_service:x.service_name!=null}:null;
  const providerProposal={action:x.action,intent:x.intent,confidence:x.confidence,riskLevel:x.risk_level,
    serviceName:groundedServiceName(x,message,context),knowledgeKey:x.knowledge_key,entities:x.entities,dialogue:x.dialogue||null,requestSpans:semanticRequestSpans(x.request_spans),
    serviceQuestion,contextReference:x.context_reference||null,
    missingFields:[],reasonCode:'SEMANTIC_INTERPRETATION'};
  if(serviceQuestion){providerProposal.intent=serviceQuestion.field==='price'?'PRICING':'SERVICE_DISCOVERY';providerProposal.action=serviceQuestion.field==='price'?'PRICING':'SERVICE_MENU';}
  const proposal=applyDeterministicSemanticIntentPolicy({message,proposal:providerProposal});
  const telemetry={...(result.telemetry||{}),qwen37_canary:{eligible:canary.enabled,selected:canary.selected,bucket:canary.bucket,percent:canary.percent,source:canary.source,fallback:canaryFallback,failure:canaryFailure}};
  return {proposal,provider:result.provider,model:result.model,telemetry};
}

export function evaluateSemanticProbe(p) {
  const businessId='10000000-0000-4000-8000-000000000001',branchId='20000000-0000-4000-8000-000000000001';
  const serviceId='30000000-0000-4000-8000-000000000001';
  const schema=registry.activities.car_wash;
  const context={business:{id:businessId,business_type:'car_wash',timezone:'Asia/Dubai'},
    conversation:{id:'40000000-0000-4000-8000-000000000001',branch_id:branchId,state:'ai_active'},
    customer:{id:'50000000-0000-4000-8000-000000000001'},
    services:[{id:serviceId,business_id:businessId,branch_id:branchId,name:'غسيل كامل'}],workers:[],
    batch_messages:[{body:'فاضين بكره 9 الصبح',created_at:'2026-09-08T18:10:11Z'}],
    activity_profile:{version:1,source:'DATABASE_FACT',business_id:businessId,branch_id:branchId,
      services:[{business_id:businessId,branch_id:branchId,service_id:serviceId,activity_type:'car_wash',
        schema_version:1,contract_version:'synthetic-probe-v1',delivery_modes:['MOBILE'],
        mode_requirements:schema.mode_requirements,collection_priority:registry.platform.collection_priority,
        entity_definitions:registry.platform.entity_definitions,automatic_booking:true,owner_approval:false}]}};
  const {state,decision}=understandConversation({context,now:new Date('2026-09-08T18:10:11Z'),proposal:p});
  const has=(entity,value)=>p.entities.some(f=>f.entity===entity && f.value===value && f.confidence>=.9 && 'فاضين بكره 9 الصبح'.includes(f.evidence));
  const verified=(key,value)=>state.entities[key]?.value===value && state.entities[key]?.source==='CUSTOMER_STATED';
  const checks={booking_intent:p.intent==='BOOKING' && p.confidence>=.86,
    date:has('date','2026-09-09'),time:has('time','09:00'),unknown_service:p.serviceName===null,
    operational_clarification:decision.action==='CLARIFY' && state.missing_fields.includes('service')
      && verified('date','2026-09-09') && verified('time','09:00') && !state.last_verified_action};
  return {checks,passed:Object.values(checks).every(Boolean),policy_action:decision.action,
    proposed_action:p.action,proposed_risk:p.riskLevel};
}

export async function probeSemanticInterpreter() {
  const result=await interpretSemanticMessage({message:'فاضين بكره 9 الصبح',
    referenceTime:'2026-09-08T18:10:11Z',context:{business:{type:'car_wash',timezone:'Asia/Dubai'},
      services:[{name:'غسيل كامل'}],activity:{delivery_mode:'MOBILE',required:['service','vehicle','location','date','time']}}});
  const {passed,checks,policy_action,proposed_action,proposed_risk}=evaluateSemanticProbe(result.proposal);
  return {ok:passed,state:passed?'SUCCESS':'PROVIDER_ERROR',error:passed?null:'SEMANTIC_PROBE_FAILED',
    provider:result.provider,model:result.model,semantic_probe:true,case_id:'gcc_availability_tomorrow_morning',
    checks,policy_action,proposed_action,proposed_risk};
}
