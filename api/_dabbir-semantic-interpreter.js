import { generateDABBIRAiReply } from './_dabbir-whatsapp-ai-meter.js';
import { sanitizeSemanticText, sanitizeSemanticContext } from './_dabbir-semantic-privacy.js';
import { validSemanticContract, semanticRequestSpans } from './_dabbir-semantic-contract.js';
import { applyDeterministicSemanticIntentPolicy } from './_dabbir-semantic-intent-policy.js';
import { understandConversation } from './_dabbir-semantic-engine.js';
import registry from './_dabbir-activity-registry.json' with {type:'json'};

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

// Preserve the useful part of agent-style chat loops: the interpreter sees a
// bounded, role-correct dialogue instead of forcing it to rediscover the whole
// conversation from an opaque JSON blob. Human operator replies are assistant-
// side from the customer's point of view. The semantic state still owns truth,
// authority and long-lived memory; this history is interpretation evidence only.
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
  // recent_conversation is sent through the provider's native role history.
  // Removing the duplicate copy lowers tokens and prevents two conflicting
  // representations of the same turn from competing for attention.
  const {recent_conversation:_recentConversation,...rest}=source;
  return sanitizeSemanticContext({...rest,reference_time:referenceTime});
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
    businessContext:JSON.stringify(providerSemanticContext(context,referenceTime)),
    history:semanticRoleHistory(context),fetchImpl:fetchBounded,env,meteringContext});
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
  // Provider output proposes semantics; application policy owns deterministic
  // operational intent. Explicit availability + grounded temporal evidence is
  // a booking-journey signal even if a stochastic provider says SERVICE_MENU.
  const proposal=applyDeterministicSemanticIntentPolicy({message,proposal:providerProposal});
  return {proposal,provider:result.provider,model:result.model,telemetry:result.telemetry||null};
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
    checks,policy_action,proposed_action,proposed_risk};
}
