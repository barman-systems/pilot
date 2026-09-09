import { generateDABBIRAiReply } from './_dabbir-whatsapp-ai-meter.js';
import { sanitizeSemanticText, sanitizeSemanticContext } from './_dabbir-semantic-privacy.js';
import { validSemanticContract } from './_dabbir-semantic-contract.js';
import { understandConversation } from './_dabbir-semantic-engine.js';
import { wantsServiceMenu } from './_dabbir-whatsapp-understanding.js';
import registry from './_dabbir-activity-registry.json' with {type:'json'};

const HIGH_CONFIDENCE_INTENT=.96;

function normalizedIntentText(value='') {
  return String(value||'').normalize('NFKC').toLowerCase()
    .replace(/[\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه')
    .replace(/[٠-٩]/g,n=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(n)))
    .replace(/[^\p{L}\p{N}:]+/gu,' ').replace(/\s+/g,' ').trim();
}

function hasTemporalBookingEvidence(text) {
  return /(?:^|\s)(?:اليوم|باجر|باكر|بكره|غدا|عقب باجر|بعد باجر|بعد بكره|today|tomorrow|day after tomorrow)(?:\s|$)/.test(text)
    || /(?:^|\s)(?:الصبح|صباح|صباحا|الفجر|الظهر|العصر|المسا|المساء|المغرب|الليل|morning|noon|afternoon|evening|night)(?:\s|$)/.test(text)
    || /(?:الساعه|الساع|at)\s*(?:[01]?\d|2[0-3])(?::[0-5]\d)?/.test(text)
    || /(?:^|\s)(?:0?[1-9]|1[0-2])(?::[0-5]\d)?\s*(?:ص|م|am|pm)(?:\s|$)/.test(text)
    || /\b20\d{2}-\d{2}-\d{2}\b/.test(text);
}

function hasConflictingExplicitIntent(text,message) {
  if(wantsServiceMenu(message))return true;
  return /(?:^|\s)(?:بكم|السعر|سعر|price|pricing|how much)(?:\s|$)/.test(text)
    || /(?:^|\s)(?:الغ|الغيه|الغي|الغاء|تلغي|cancel|reschedule)(?:\s|$)/.test(text)
    || /(?:تعديل|اجل|change (?:it|my|the) (?:appointment|booking|time))/.test(text)
    || /(?:المدير|المالك|موظف|انسان|manager|human|speak to staff|talk to the owner)/.test(text);
}

export function deterministicSemanticInvariant(message='') {
  const text=normalizedIntentText(message);
  if(!text||hasConflictingExplicitIntent(text,message))return null;
  if(/(?:لا|مب|مو|مش|not|dont|don't|do not)\s+(?:تحجز|احجز|حجز|book|booking)/.test(text))return null;
  const temporal=hasTemporalBookingEvidence(text);
  const availability=/(?:^|\s)(?:فاضي|فاضيين|فاضين|متوفر|متوفرين|متاح|متاحين)(?:\s|$)/.test(text)
    || /(?:^|\s)(?:عندكم|في|فيه)\s+(?:وقت|موعد|مجال)(?:\s|$)/.test(text)
    || /(?:^|\s)(?:available|availability|free|open slot|open slots|any slot|any slots)(?:\s|$)/.test(text);
  if(availability&&temporal)return {kind:'AVAILABILITY_BOOKING',intent:'BOOKING',action:'CHECK_AVAILABILITY',confidence:HIGH_CONFIDENCE_INTENT};
  const explicitBooking=/(?:^|\s)(?:احجز|حجز|booking|book)(?:\s|$)/.test(text)
    || /(?:^|\s)(?:ابا|ابي|ابغي|ابغى|اريد|احتاج|want|need)\s+(?:احجز|حجز|موعد|book|booking|appointment)(?:\s|$)/.test(text);
  if(explicitBooking)return {kind:'EXPLICIT_BOOKING',intent:'BOOKING',action:temporal?'CHECK_AVAILABILITY':'CLARIFY',confidence:HIGH_CONFIDENCE_INTENT};
  return null;
}

export function reconcileSemanticProposal(rawProposal,message='') {
  const invariant=deterministicSemanticInvariant(message);
  if(!invariant||rawProposal?.risk_level==='HIGH')return {proposal:rawProposal,reconciliation:null};
  const original={intent:rawProposal?.intent||null,action:rawProposal?.action||null,confidence:Number(rawProposal?.confidence)||0};
  const actionUnsafe=invariant.intent==='BOOKING'&&['CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING'].includes(String(rawProposal?.action||''));
  const mismatch=rawProposal?.intent!==invariant.intent||rawProposal?.action!==invariant.action||Number(rawProposal?.confidence)<invariant.confidence||actionUnsafe;
  if(!mismatch)return {proposal:rawProposal,reconciliation:null};
  return {
    proposal:{...rawProposal,intent:invariant.intent,action:invariant.action,confidence:Math.max(invariant.confidence,Number(rawProposal?.confidence)||0)},
    reconciliation:{reason:invariant.kind,from_intent:original.intent,to_intent:invariant.intent,from_action:original.action,to_action:invariant.action,provider_confidence:original.confidence}
  };
}

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
  const providerProposal=JSON.parse(result.reply);
  const {proposal:x,reconciliation}=reconcileSemanticProposal(providerProposal,message);
  const proposal={action:x.action,intent:x.intent,confidence:x.confidence,riskLevel:x.risk_level,
    serviceName:groundedServiceName(x,message,context),knowledgeKey:x.knowledge_key,entities:x.entities,
    missingFields:[],reasonCode:reconciliation?'SEMANTIC_RECONCILED':'SEMANTIC_INTERPRETATION'};
  return {proposal,provider:result.provider,model:result.model,reconciliation,
    provider_alignment:!reconciliation,provider_intent:providerProposal.intent,provider_action:providerProposal.action};
}

// Fixed, authenticated synthetic case exercises the SAME interpreter used by
// WhatsApp. It loads no customer data and has no tools or outbound side effects.
export function evaluateSemanticProbe(p) {
  // In-memory synthetic fixture only. No database reads/writes or execution
  // tools are reachable here. Verify the actual reducer's decision, not an
  // arbitrary provider risk label: MEDIUM can safely yield CLARIFY, HIGH must
  // still fail this availability case by producing HANDOFF.
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
    checks,policy_action,proposed_action,proposed_risk,provider_alignment:result.provider_alignment,
    reconciliation:result.reconciliation?.reason||null,provider_intent:result.provider_intent,provider_action:result.provider_action};
}
