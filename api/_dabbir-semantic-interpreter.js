import { generateDABBIRAiReply } from './_dabbir-whatsapp-ai-meter.js';
import { sanitizeSemanticText, sanitizeSemanticContext } from './_dabbir-semantic-privacy.js';
import { validSemanticContract } from './_dabbir-semantic-contract.js';

function groundedServiceName(x,message,context) {
  // Catalog membership proves existence, never customer selection. Missing
  // evidence drops the proposal; existing verified state/memory stays in the
  // semantic engine. Owner aliases are also resolved there, before AI.
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

export async function interpretSemanticMessage({ message, context, referenceTime, meteringContext, fetchImpl=fetch, env=process.env }) {
  const deadline=Date.now()+18000; let attempts=0;
  const fetchBounded=async(url,options={})=>{
    if(++attempts>4 || Date.now()>=deadline) throw Object.assign(new Error('SEMANTIC_PROVIDER_BUDGET'),{code:'SEMANTIC_PROVIDER_BUDGET'});
    const signal=AbortSignal.timeout(Math.max(1,deadline-Date.now()));
    return fetchImpl(url,{...options,signal:options.signal?AbortSignal.any([signal,options.signal]):signal});
  };
  const result=await generateDABBIRAiReply({project:'dabbir_businesses',semantic:true,
    message:sanitizeSemanticText(message).slice(0,2000),
    businessContext:JSON.stringify(sanitizeSemanticContext({...context,reference_time:referenceTime})),
    history:[],fetchImpl:fetchBounded,env,meteringContext});
  if(!result?.ok) throw Object.assign(new Error('AI_PLANNER_UNAVAILABLE'),{code:'AI_PLANNER_UNAVAILABLE'});
  if(!validSemanticContract(result.reply)) throw Object.assign(new Error('AI_PLANNER_CONTRACT_INVALID'),{code:'AI_PLANNER_CONTRACT_INVALID'});
  const x=JSON.parse(result.reply);
  const proposal={action:x.action,intent:x.intent,confidence:x.confidence,riskLevel:x.risk_level,
    serviceName:groundedServiceName(x,message,context),knowledgeKey:x.knowledge_key,entities:x.entities,
    missingFields:[],reasonCode:'SEMANTIC_INTERPRETATION'};
  return {proposal,provider:result.provider,model:result.model};
}

// Fixed, authenticated synthetic case exercises the SAME interpreter used by
// WhatsApp. It loads no customer data and has no tools or outbound side effects.
export async function probeSemanticInterpreter() {
  const result=await interpretSemanticMessage({message:'فاضين بكره 9 الصبح',
    referenceTime:'2026-09-08T18:10:11Z',context:{business:{type:'car_wash',timezone:'Asia/Dubai'},
      services:[{name:'غسيل كامل'}],activity:{delivery_mode:'MOBILE',required:['service','vehicle','location','date','time']}}});
  const p=result.proposal;
  const has=(entity,value)=>p.entities.some(f=>f.entity===entity && f.value===value && f.confidence>=.9 && 'فاضين بكره 9 الصبح'.includes(f.evidence));
  const passed=p.intent==='BOOKING' && p.confidence>=.86 && p.riskLevel==='LOW' && p.serviceName===null
    && has('date','2026-09-09') && has('time','09:00');
  return {ok:passed,state:passed?'SUCCESS':'PROVIDER_ERROR',error:passed?null:'SEMANTIC_PROBE_FAILED',
    provider:result.provider,model:result.model,semantic_probe:true,case_id:'gcc_availability_tomorrow_morning',
    checks:{booking_intent:p.intent==='BOOKING' && p.confidence>=.86,date:has('date','2026-09-09'),time:has('time','09:00'),unknown_service:p.serviceName===null}};
}
