import {normalizeSemanticText,clarification} from './_dabbir-semantic-engine-core.js';
import {verifiedOperationalFact} from './_dabbir-activity-intelligence.js';

const arr=v=>Array.isArray(v)?v:[];
const goals=new Set(['BOOK_SERVICE','CANCEL_BOOKING','RESCHEDULE_BOOKING']);
const roles=new Set(['NEW_REQUEST','ANSWER_TO_PENDING_QUESTION','CORRECTION','CONFIRMATION','DENIAL','SIDE_QUESTION','TOPIC_SWITCH','CONTINUATION','CANCELLATION','REFERENCE','SOCIAL']);
const value=(s,k)=>s?.entities?.[k]?.status==='active'?s.entities[k].value:null;
const name=s=>s?.name_ar||s?.name||s?.name_en||'';
const text=c=>arr(c.batch_messages).map(m=>m.language_body??m.body??'').join(' ');
const completed=s=>s?.last_verified_action?.at&&Date.parse(s.last_verified_action.at)>=Date.parse(s.updated_at);
export function activeJourney(s){return !!(goals.has(s?.goal)&&!completed(s));}
export function scopedPrevious(s,c,now){return s?.version===2&&Date.parse(s.expires_at)>now.getTime()&&['business_id','conversation_id','customer_id','branch_id'].every(k=>s.scope?.[k]===({business_id:c.business?.id,conversation_id:c.conversation?.id,customer_id:c.customer?.id,branch_id:c.conversation?.branch_id})[k])?s:null;}
export function pendingField(s){return s?.cognition?.pending_field||s?.clarification_entity||null;}

// The same rule applies to every field. A changed grounded value or a parsed
// incomplete answer (e.g. hour without AM/PM) outranks a generic intent label.
export function resolvesPending(previous,state){
 const field=pendingField(previous);if(!activeJourney(previous)||!field)return false;
 const before=previous.entities?.[field],after=state.entities?.[field];
 return !!(after&&after.source!=='AI_INFERENCE'&&
  (verifiedOperationalFact(after)||after.hour!=null||after.part)&&
  (JSON.stringify(before?.value)!==JSON.stringify(after.value)||before?.hour!==after.hour||before?.part!==after.part||before?.status!==after.status));
}
export function mayReplaceGoal(previous,proposal,currentMessages){
 if(!activeJourney(previous))return true;
 const d=proposal?.dialogue,raw=arr(currentMessages).map(m=>m.language_body??m.body??'').join(' ');
 // A model role alone never authorizes a reset. The user must explicitly end
// or replace the goal, and the model must cite the current message.
 return d?.message_role==='TOPIC_SWITCH'&&typeof d.evidence==='string'&&d.evidence.length>=2&&raw.includes(d.evidence)&&
  /(?:خل(?:نا|يني).*نترك|انس(?:ى)? (?:الحجز|الطلب)|ما ابي احجز|forget (?:the )?(?:booking|request)|start (?:over|a new)|different topic)/i.test(normalizeSemanticText(d.evidence));
}
function groundedDialogue(proposal,c){
 const d=proposal?.dialogue,raw=text(c);
 return d&&roles.has(d.message_role)&&typeof d.evidence==='string'&&d.evidence.trim().length>0&&raw.includes(d.evidence)?d:null;
}
function decisionView(state,decision,previous,c,role){
 const facts=Object.entries(state.entities||{}),confirmed=facts.filter(([,f])=>verifiedOperationalFact(f));
 const pending=decision.action==='CLARIFY'||decision.resumeReply?state.clarification_entity:null;
 const primary=activeJourney(state)?state.goal:null;
 const old=previous?.cognition;
 state.cognition={version:1,revision:state.revision,primary_goal:primary,secondary_goals:arr(old?.secondary_goals).slice(-4),
  active_journey:primary,journey_stage:decision.action==='HANDOFF'?'NEEDS_ATTENTION':decision.action==='CLARIFY'?'COLLECTING':decision.action==='CHECK_AVAILABILITY'?'CHECKING_AVAILABILITY':['CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING'].includes(decision.action)?'AWAITING_RECEIPT':primary?'CONTINUING':'INQUIRY',
  current_activity:state.service_type||c.business?.business_type||null,current_service:value(state,'service'),delivery_mode:state.delivery_mode||null,
  customer_confirmed_facts:confirmed.filter(([,f])=>!['DATABASE_FACT','OWNER_POLICY'].includes(f.source)).map(([k])=>k),
  business_confirmed_facts:confirmed.filter(([,f])=>['DATABASE_FACT','OWNER_POLICY'].includes(f.source)).map(([k])=>k),
  inferred_facts:facts.filter(([,f])=>f.source==='AI_INFERENCE').map(([k])=>k),unverified_facts:facts.filter(([,f])=>!verifiedOperationalFact(f)).map(([k])=>k),
  missing_requirements:arr(state.missing_fields),pending_field:pending,pending_question:pending?{field:pending,text:decision.resumeReply||decision.reply||null,presentation:'PENDING_DELIVERY'}:null,
  message_role:role,last_system_action:old?.next_action||null,last_tool_result:state.last_verified_outcome?{verified:state.last_verified_outcome.verified===true,action:state.last_verified_action?.action||null}:null,
  last_customer_correction:arr(state.user_corrections).at(-1)?.entity||null,interrupted_goal:role==='SIDE_QUESTION'?primary:null,resumable_goal:primary,
  goal_confidence:primary?(state.intent_confirmed===true?1:.5):0,next_action:decision.action,response_strategy:decision.action==='CLARIFY'?'ASK_NEXT_REQUIREMENT':role==='SIDE_QUESTION'?'ANSWER_AND_RESUME':'REPORT_VERIFIED_RESULT',
  do_not_ask:confirmed.map(([k])=>k),do_not_reset:!!primary};
 return {state,decision};
}

// Safe minimal model snapshot: values with execution provenance remain in the
// scoped state/DB. No customer IDs, coordinates, receipt IDs or raw memory rows.
export function situationSnapshot(c,s,previous){
 const p=scopedPrevious(previous,c,new Date(s.updated_at)),contract=s.activity_requirements?.contract;
 return {primary_goal:p?.cognition?.primary_goal||p?.goal||s.goal,active_journey:activeJourney(p)?p.goal:null,
  pending_question:p?.cognition?.pending_question?.text||null,pending_field:pendingField(p),
  last_system_action:p?.pending_action||null,confirmed_fields:Object.entries(p?.entities||{}).filter(([,f])=>verifiedOperationalFact(f)).map(([k])=>k),
  candidate_fields:Object.entries(s.entities||{}).filter(([,f])=>f.source==='AI_INFERENCE').map(([k])=>k),
  recent_corrections:arr(p?.user_corrections).slice(-3).map(x=>({field:x.entity})),
  activity:s.service_type||c.business?.business_type,service:name(arr(c.services).find(x=>x.id===value(s,'service')))||null,
  requirements:arr(s.required_entities),missing:arr(s.missing_fields),delivery_mode:s.delivery_mode,
  allowed_actions:arr(s.supported_actions),field_definitions:contract?.entity_definitions||{},
  owner_approval:contract?.owner_approval===true,automatic_booking:contract?.automatic_booking===true,
  verified_memory_fields:arr(c.verified_memory).filter(m=>m.status==='verified').map(m=>m.memory_key).slice(0,12)};
}

export function cognitiveReduce(args,reduce){
 const c=args.context,now=args.now||new Date(),previous=scopedPrevious(args.previous,c,now),d=groundedDialogue(args.proposal,c);
 let prepared=previous?structuredClone(previous):previous;
 // Invalidating a fact can only remove authority. The model cannot replace it
// with business truth or invalidate an unrelated tenant's saved state.
 if(prepared&&d&&['CORRECTION','DENIAL'].includes(d.message_role))for(const key of arr(d.invalidated_fields).slice(0,4)){
  if(['service','worker','vehicle','location','date','time','delivery_mode','property_details'].includes(key)){
   if(prepared.entities[key])prepared.entities[key]={...prepared.entities[key],value:null,status:'unresolved',source:'CUSTOMER_CORRECTION',confidence:0};
   delete prepared.entities.slot;
  }
 }
 let result=reduce({...args,previous:prepared,context:{...c,cognitive_active:true,cognitive_message_role:d?.message_role||null}});
 let {state,decision}=result;
 if(['HANDOFF','SUPERSEDED'].includes(decision.action)||['UNTRUSTED_INSTRUCTION','BOOKING_NEGATED'].includes(decision.reasonCode))return decisionView(state,decision,previous,c,d?.message_role||'NEW_REQUEST');
 const wasActive=activeJourney(previous);
 const knowledge=d?.message_role==='SIDE_QUESTION'?arr(c.knowledge).find(k=>k.key===args.proposal?.knowledgeKey&&k.source==='owner_approved'&&Number(k.confidence)>=.95):null;
 const proposedRead=d?.message_role==='SIDE_QUESTION'?({PRICING:'PRICING',SERVICE_DISCOVERY:'SERVICE_MENU'}[args.proposal?.intent]||null):null;
 const side=wasActive&&(['PRICING','SERVICE_MENU'].includes(decision.action)||proposedRead||knowledge);
 let role=d?.message_role||(side?'SIDE_QUESTION':resolvesPending(previous,state)?'ANSWER_TO_PENDING_QUESTION':arr(state.user_corrections).length>arr(previous?.user_corrections).length?'CORRECTION':wasActive?'CONTINUATION':'NEW_REQUEST');
 if(side){
  const inquiry={action:proposedRead||(knowledge?'REPLY':decision.action),service_id:value(state,'service')};
  // Recompute the next business requirement from the retained goal. A pricing
// target never overwrites the service being booked or reuses a slot approval.
  result=reduce({...args,proposal:null,previous:prepared,context:{...c,batch_messages:[],cognitive_message_role:'SIDE_QUESTION'}});
  state=result.state;decision={...result.decision,action:inquiry.action,intent:inquiry.action==='PRICING'?'PRICING':'SERVICE_DISCOVERY',reasonCode:'SIDE_QUESTION_RESUME',queryServiceId:inquiry.service_id,resumeReply:result.decision.action==='CLARIFY'?result.decision.reply:null};
  if(knowledge){const answer=state.language==='en'?knowledge.value?.answer_en||knowledge.value?.answer_ar:knowledge.value?.answer_ar||knowledge.value?.answer_en;if(typeof answer==='string')decision.reply=answer.slice(0,1400)+(decision.resumeReply?'\n'+decision.resumeReply:'');else decision=result.decision;}
  role='SIDE_QUESTION';
 }
 if(wasActive&&state.goal==='UNKNOWN'&&!mayReplaceGoal(previous,args.proposal,c.batch_messages)){
  result=reduce({...args,proposal:null,previous:prepared});state=result.state;decision=result.decision;
 }
 state.cognitive_pending_resolved=resolvesPending(previous,state);
 return decisionView(state,decision,previous,c,role);
}

export function qualityGate({state,decision,previous,context}){
 const violations=[];
 if(activeJourney(state)&&decision.reasonCode==='NO_OPERATIONAL_AUTHORITY')violations.push('ACTIVE_GOAL_GENERIC_REPLY');
 if(activeJourney(previous)&&state.goal==='UNKNOWN'&&!['BOOKING_NEGATED','UNTRUSTED_INSTRUCTION'].includes(decision.reasonCode))violations.push('GOAL_RESET');
 if(decision.action==='CLARIFY'&&verifiedOperationalFact(state.entities?.[state.clarification_entity])&&!arr(state.invalid_fields).includes(state.clarification_entity))violations.push('ASKED_CONFIRMED_FACT');
 if(violations.length&&activeJourney(state)&&state.missing_fields?.length){
  const field=state.missing_fields.find(k=>!verifiedOperationalFact(state.entities?.[k])||arr(state.invalid_fields).includes(k));
  if(field){state.pending_action='CLARIFY';state.clarification_entity=field;decision={...decision,action:'CLARIFY',reasonCode:'COGNITIVE_REPLAN',reply:clarification({...state,missing_fields:[field]},context)};}
 }
 const blocked=violations.length>0&&decision.reasonCode!=='COGNITIVE_REPLAN';
 return {state,decision,violations,blocked};
}
