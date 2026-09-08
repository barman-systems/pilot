import { generateDABBIRAiReply } from './_dabbir-whatsapp-ai-meter.js';
import { sanitizeSemanticText, sanitizeSemanticContext } from './_dabbir-semantic-privacy.js';
import { validSemanticContract } from './_dabbir-semantic-contract.js';

const arr=value=>Array.isArray(value)?value:[];
function normalizeEvidence(value) {
  return sanitizeSemanticText(value).normalize('NFKD').replace(/[\u064b-\u065f\u0670ـ]/g,'')
    .replace(/[٠-٩]/g,n=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(n))).replace(/[أإآ]/g,'ا').replace(/ة/g,'ه')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}
function groundedServiceName(serviceName,message,context) {
  if(!serviceName)return null;
  const proposed=normalizeEvidence(serviceName),text=` ${normalizeEvidence(message)} `;
  if(!proposed||!text.trim())return null;
  const service=arr(context?.services).find(item=>[item?.name,item?.name_ar,item?.name_en]
    .some(name=>name&&normalizeEvidence(name)===proposed));
  if(!service)return null;
  const labels=[service.name,service.name_ar,service.name_en].map(normalizeEvidence).filter(Boolean);
  return labels.some(label=>text.includes(` ${label} `))?serviceName:null;
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
  // Catalog labels are context, not customer evidence. A provider may not promote a
  // visible service into the semantic proposal unless the current customer message
  // explicitly names that same catalog service. Existing grounded conversation state
  // is preserved separately by the semantic engine.
  const serviceName=groundedServiceName(x.service_name,message,context);
  const proposal={action:x.action,intent:x.intent,confidence:x.confidence,riskLevel:x.risk_level,
    serviceName,knowledgeKey:x.knowledge_key,entities:x.entities,
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
  const has=(entity,value)=>p.entities.some(f=>f.entity===entity && f.value===value && 'فاضين بكره 9 الصبح'.includes(f.evidence));
  const passed=p.intent==='BOOKING' && p.riskLevel==='LOW' && p.serviceName===null
    && has('date','2026-09-09') && has('time','09:00');
  return {ok:passed,state:passed?'SUCCESS':'PROVIDER_ERROR',error:passed?null:'SEMANTIC_PROBE_FAILED',
    provider:result.provider,model:result.model,semantic_probe:true,case_id:'gcc_availability_tomorrow_morning',
    checks:{booking_intent:p.intent==='BOOKING',date:has('date','2026-09-09'),time:has('time','09:00'),unknown_service:p.serviceName===null}};
}