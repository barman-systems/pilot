// Cognitive Business Operator V2 turn contract.
//
// The model is allowed to propose semantic observations, but continuity of an
// already verified business journey is an application decision. This layer
// turns the current message role + persisted journey into one bounded state
// transition without another model call and without granting execution authority.

const ACTIVE_GOALS=new Set(['BOOK_SERVICE','CANCEL_BOOKING','RESCHEDULE_BOOKING']);
const OPERATIONAL_INTENTS=new Set(['BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING']);
const READ_ONLY_INTENTS=new Set(['SUPPORT','SERVICE_DISCOVERY','PRICING']);
const KEEP_ROLES=new Set(['CONTINUATION','CONFIRMATION','REFERENCE','SOCIAL']);
const UPDATE_ROLES=new Set(['ANSWER_TO_PENDING_QUESTION','CORRECTION','DENIAL']);

const arr=v=>Array.isArray(v)?v:[];
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const scopeFor=c=>({business_id:c?.business?.id,conversation_id:c?.conversation?.id,customer_id:c?.customer?.id,branch_id:c?.conversation?.branch_id});

function sameScope(previous,context){
 const scope=previous?.scope,current=scopeFor(context);
 return !!(scope&&previous?.version===2&&Object.keys(current).every(k=>scope[k]===current[k]));
}
function completed(previous){
 const actionAt=Date.parse(previous?.last_verified_action?.at||''),updated=Date.parse(previous?.updated_at||'');
 return Number.isFinite(actionAt)&&Number.isFinite(updated)&&actionAt>=updated;
}
function activePrevious(previous,context,now){
 if(!sameScope(previous,context)||!ACTIVE_GOALS.has(previous?.goal)||completed(previous))return false;
 const expires=Date.parse(previous?.expires_at||'');
 return !Number.isFinite(expires)||expires>now.getTime();
}
function currentText(context){return arr(context?.batch_messages).map(x=>String(x?.language_body??x?.body??'')).join(' ');}
function groundedDialogue(proposal,context){
 const d=proposal?.dialogue,raw=currentText(context);
 return d&&typeof d.message_role==='string'&&typeof d.evidence==='string'&&d.evidence.trim()&&raw.includes(d.evidence)?d:null;
}
function explicitReplacement(evidence){
 const text=norm(evidence);
 return /(?:خل(?:نا|يني).*نترك|انس(?:ى)? (?:الحجز|الطلب)|ما ابي احجز|forget (?:the )?(?:booking|request)|start (?:over|a new)|different topic)/i.test(text);
}
function intentForGoal(previous){
 if(previous?.goal==='BOOK_SERVICE')return 'BOOKING';
 if(previous?.goal==='CANCEL_BOOKING')return 'CANCEL_BOOKING';
 if(previous?.goal==='RESCHEDULE_BOOKING')return 'RESCHEDULE_BOOKING';
 return previous?.intent||null;
}
function referenceResolution(role,previous,context){
 if(role==='ANSWER_TO_PENDING_QUESTION'&&previous?.cognition?.pending_field)return 'PENDING_FIELD';
 if(role==='REFERENCE'&&context?.pending_state?.payload?.presented===true)return 'PRESENTED_OPTION';
 if(previous?.goal&&role!=='NEW_REQUEST')return 'ACTIVE_GOAL';
 return 'NONE';
}
function meaningFor(role,active,operation){
 if(operation==='REPLACE')return 'REPLACES_ACTIVE_GOAL';
 if(role==='SIDE_QUESTION')return 'SIDE_BUSINESS_QUESTION';
 if(role==='ANSWER_TO_PENDING_QUESTION')return 'ANSWERS_PENDING_FIELD';
 if(role==='CORRECTION'||role==='DENIAL')return 'CORRECTS_ACTIVE_FACTS';
 if(role==='CONFIRMATION')return 'CONFIRMS_ACTIVE_STEP';
 if(role==='REFERENCE')return 'REFERS_TO_EXISTING_CONTEXT';
 if(role==='SOCIAL'&&active)return 'SOCIAL_WITH_ACTIVE_GOAL';
 if(active)return 'CONTINUES_ACTIVE_GOAL';
 return 'NEW_BUSINESS_REQUEST';
}
function strategyFor(role,operation){
 if(role==='SIDE_QUESTION')return 'ANSWER_AND_RESUME';
 if(role==='CORRECTION'||role==='DENIAL')return 'APPLY_CORRECTION_AND_CONTINUE';
 if(role==='ANSWER_TO_PENDING_QUESTION'||KEEP_ROLES.has(role))return 'ADVANCE_ACTIVE_GOAL';
 if(operation==='REPLACE')return 'START_REPLACEMENT_GOAL';
 return 'START_OR_CLARIFY_GOAL';
}

export function cognitiveTurnTransition({context,previous,proposal,now=new Date()}){
 const active=activePrevious(previous,context,now),dialogue=groundedDialogue(proposal,context);
 const role=dialogue?.message_role||'NEW_REQUEST';
 let goalOperation='NONE';
 if(active){
  if(role==='TOPIC_SWITCH'&&explicitReplacement(dialogue?.evidence))goalOperation='REPLACE';
  else if(role==='CANCELLATION')goalOperation='REPLACE';
  else if(role==='SIDE_QUESTION')goalOperation='PAUSE';
  else if(UPDATE_ROLES.has(role))goalOperation='UPDATE';
  else goalOperation='KEEP';
 }else if(OPERATIONAL_INTENTS.has(proposal?.intent))goalOperation='START';

 const preserveGoal=active&&!['REPLACE'].includes(goalOperation);
 const next=proposal?{...proposal}:proposal;
 if(next&&preserveGoal){
  // A side question may temporarily use a read-only intent so the existing
  // catalog/knowledge path can answer it. Every other turn inherits the active
  // journey intent, preventing a stochastic SUPPORT/PRICING label from erasing
  // or redirecting the verified goal.
  if(role==='SIDE_QUESTION'){
   if(!READ_ONLY_INTENTS.has(next.intent))next.intent='SUPPORT';
  }else{
   const protectedIntent=intentForGoal(previous);
   if(protectedIntent)next.intent=protectedIntent;
  }
  next.intentResolution='COGNITIVE_ACTIVE_GOAL_CONTINUITY_V2';
 }

 return {proposal:next,transition:{
  version:2,
  goal_operation:goalOperation,
  protected_goal:preserveGoal?previous.goal:null,
  protected_intent:preserveGoal?intentForGoal(previous):null,
  message_role:role,
  customer_meaning:meaningFor(role,active,goalOperation),
  reference_resolution:referenceResolution(role,previous,context),
  response_strategy:strategyFor(role,goalOperation),
  active_before:active,
  replacement_evidence_verified:goalOperation==='REPLACE'&&role==='TOPIC_SWITCH'?true:null,
 }};
}

export function prepareCognitiveTurn(args){
 const {proposal,transition}=cognitiveTurnTransition({context:args?.context,previous:args?.previous,proposal:args?.proposal,now:args?.now||new Date()});
 return {args:{...args,proposal},transition};
}

export function finalizeCognitiveTransition(transition,state,decision){
 if(!transition)return transition;
 let responseStrategy=transition.response_strategy;
 if(decision?.action==='CLARIFY')responseStrategy='ASK_NEXT_REQUIREMENT';
 else if(['CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING'].includes(decision?.action))responseStrategy='EXECUTE_THEN_VERIFY';
 else if(decision?.action==='CHECK_AVAILABILITY')responseStrategy='CHECK_THEN_CONTINUE';
 else if(decision?.reasonCode&&String(decision.reasonCode).includes('VERIFIED')&&decision?.action==='REPLY')responseStrategy='REPORT_VERIFIED_RESULT';
 return {...transition,response_strategy:responseStrategy,
  active_after:ACTIVE_GOALS.has(state?.goal),next_action:decision?.action||null,
  next_pending_field:state?.cognition?.pending_field||state?.clarification_entity||null};
}
