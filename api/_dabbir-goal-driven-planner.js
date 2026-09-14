import {applyActivityRequirements,verifiedOperationalFact} from './_dabbir-activity-intelligence.js';
import {normalizeSemanticText} from './_dabbir-semantic-engine-core.js';
import {goalClarificationReply} from './_dabbir-conversation-brain-response.js';

// Conversation policy only. This layer may choose what to ask next, but it never
// grants tool, tenant, service, slot or mutation authority. Missing fields remain
// execution prerequisites, not a scripted questionnaire. Customer-facing wording
// is owned by the Conversation Brain response boundary.
const ASKABLE=new Set(['service','delivery_mode','vehicle','location','property_details','worker','date','time','appointment','slot','request','intent_confirmation']);
const ELIGIBLE_REASONS=new Set(['MISSING_OR_AMBIGUOUS_FACT','COGNITIVE_REPLAN']);
const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=320)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,n);
const hasArabic=v=>/[\u0600-\u06ff]/.test(String(v||''));
const verified=(s,k)=>verifiedOperationalFact(s?.entities?.[k]);

function liveMissing(state){
  return [...new Set([...arr(state?.missing_fields),...arr(state?.unresolved_references)])]
    .filter(k=>ASKABLE.has(k))
    .filter(k=>!verified(state,k)||arr(state?.invalid_fields).includes(k));
}
function contract(state){return state?.activity_requirements?.contract||null;}
function singleDeliveryMode(state){
  const modes=arr(contract(state)?.delivery_modes).filter(x=>typeof x==='string'&&x!=='HYBRID');
  return modes.length===1?modes[0]:null;
}
function currentPending(previous){return previous?.cognition?.pending_field||previous?.clarification_entity||null;}
function incompleteCandidate(state,key){
  const f=state?.entities?.[key];
  return !!(f&&f.status==='active'&&!verifiedOperationalFact(f)&&(f.hour!=null||f.part||f.value!=null));
}
function latestMessage(context){return arr(context?.batch_messages).at(-1)||null;}
function messageInstant(args,context){
  const raw=latestMessage(context)?.created_at||latestMessage(context)?.occurred_at||args?.now||Date.now();
  const d=raw instanceof Date?raw:new Date(raw);
  return Number.isNaN(d.getTime())?new Date():d;
}
function wallClock(instant,timeZone){
  try{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:timeZone||'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    if(!parts.year||!parts.month||!parts.day||parts.hour==null||parts.minute==null)return null;
    return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
  }catch{return null;}
}
function immediateRequest(context){
  const t=normalizeSemanticText(latestMessage(context)?.language_body??latestMessage(context)?.body??'');
  if(!t||/(?:^|\s)(?:مب|مو|مش|ليس|not)\s+(?:الحين|الان|now)(?:\s|$)/.test(t))return false;
  return /(?:^|\s)(?:الحين|الان|الحينه|now|right now)(?:\s|$)/.test(t);
}
function setGroundedFact(state,key,value,source,stamp,extra={}){
  const old=state.entities?.[key];
  if(old&&old.status==='active'&&JSON.stringify(old.value)!==JSON.stringify(value)){
    state.user_corrections=arr(state.user_corrections);
    state.user_corrections.push({entity:key,previous:{...old,status:'superseded'},superseded_at:stamp});
    state.user_corrections=state.user_corrections.slice(-16);
  }
  state.entities=state.entities||{};
  state.entities[key]={value,source,confidence:1,status:'active',updated_at:stamp,...extra};
}
function reconcileTrustedFacts({args,state,context}){
  const stamp=state.updated_at||new Date().toISOString(),oneMode=singleDeliveryMode(state);
  const mode=state.entities?.delivery_mode,explicitConflict=arr(state.unresolved_references).includes('delivery_mode');
  let changed=false,temporal=false;

  // A single database-authorized mode outranks any AI inference, including a
  // conflicting inference. Only an actual customer-stated/confirmed conflict is
  // allowed to remain unresolved for clarification.
  if(oneMode&&(!mode||(mode.source==='AI_INFERENCE'&&!explicitConflict))){
    setGroundedFact(state,'delivery_mode',oneMode,'DATABASE_FACT',stamp,{service_id:state.entities?.service?.value||contract(state)?.service_id});
    state.delivery_mode=oneMode;
    changed=true;
  }

  // "الحين / الآن / now" is a direct temporal instruction, not an AI guess.
  // Anchor it to the message receipt time in the business timezone, then let the
  // normal activity/tool guards decide whether the requested instant is usable.
  if(immediateRequest(context)){
    const instant=messageInstant(args,context),wall=wallClock(instant,context?.business?.timezone);
    if(wall){
      setGroundedFact(state,'date',wall.date,'CUSTOMER_STATED',stamp,{grounded_by:'MESSAGE_RECEIPT_TIME'});
      setGroundedFact(state,'time',wall.time,'CUSTOMER_STATED',stamp,{grounded_by:'MESSAGE_RECEIPT_TIME'});
      changed=true;temporal=true;
      if(state.cognition){
        state.cognition.inferred_facts=arr(state.cognition.inferred_facts).filter(k=>!['date','time'].includes(k));
        state.cognition.unverified_facts=arr(state.cognition.unverified_facts).filter(k=>!['date','time'].includes(k));
        state.cognition.immediate_time_grounded=true;
      }
    }
  }

  if(!changed)return;
  const instant=messageInstant(args,context);
  if(context?.business&&context?.activity_profile&&Array.isArray(context?.services)){
    const resolution=applyActivityRequirements(state,context,instant);
    state.missing_fields=[...arr(resolution.missing)];
    state.invalid_fields=[...arr(resolution.invalid)];
    state.confirmed_fields=[...arr(resolution.already_satisfied)];
  }else{
    if(oneMode){state.missing_fields=arr(state.missing_fields).filter(k=>k!=='delivery_mode');state.invalid_fields=arr(state.invalid_fields).filter(k=>k!=='delivery_mode');}
    if(temporal){state.missing_fields=arr(state.missing_fields).filter(k=>!['date','time'].includes(k));state.invalid_fields=arr(state.invalid_fields).filter(k=>!['date','time'].includes(k));}
  }
}
function fieldScore(field,{state,previous,proposal}){
  // Finish the thought the customer is already answering before switching to a
  // different question. Outside that constraint, rank by information gain for
  // the current business contract instead of array position in missing_fields.
  const pending=currentPending(previous);
  if(field===pending)return 120;
  if(incompleteCandidate(state,field))return 115;
  const referenced=new Set(arr(proposal?.contextReference?.fields));
  if(referenced.has(field))return 110;
  if(field==='service')return 100; // selecting a service can change the whole contract.
  if(field==='appointment')return 98;
  if(field==='delivery_mode')return 95; // multiple modes change downstream requirements.
  if(field==='property_details')return 90;
  if(field==='vehicle')return 85;
  if(field==='location')return 80;
  if(field==='worker')return 70;
  if(field==='date'||field==='time')return 60;
  if(field==='intent_confirmation')return 40;
  if(field==='slot')return 30;
  return 0;
}
function chooseFocus({state,previous,proposal}){
  let missing=liveMissing(state);
  const oneMode=singleDeliveryMode(state);
  // A single database-authorized mode is a business fact, not a customer
  // question. PR704 already grounds this upstream; this is a presentation
  // backstop so a stale implementation detail never becomes a WhatsApp form.
  if(oneMode)missing=missing.filter(k=>k!=='delivery_mode');
  if(!missing.length)return {fields:[],singleDeliveryMode:oneMode};
  const ordered=[...missing].sort((a,b)=>fieldScore(b,{state,previous,proposal})-fieldScore(a,{state,previous,proposal}));
  const first=ordered[0];
  const pending=currentPending(previous);
  const selected=state?.clarification_entity||null;
  // A customer who is already answering a specific question, or a reducer that
  // already selected a contract-aware targeted clarification, keeps that exact
  // semantic episode. This preserves grounded context such as vehicle options,
  // "after Maghrib", and a date ambiguity repair instead of flattening them to
  // a generic planner prompt.
  if(first===pending||first===selected)return {fields:[first],singleDeliveryMode:oneMode};
  // Date and time are naturally one scheduling question only when the planner
  // starts a genuinely fresh scheduling step. The primary field remains stable
  // for state/receipt tracking while the customer may provide both at once.
  if((first==='date'||first==='time')&&missing.includes('date')&&missing.includes('time'))return {fields:['date','time'],singleDeliveryMode:oneMode};
  return {fields:[first],singleDeliveryMode:oneMode};
}
function activityLabel(state,context){return clean(state?.service_type||context?.business?.business_type,80).toLowerCase();}
function responseLanguage(state,context){
  if(state?.language==='en')return 'en';
  if(hasArabic(arr(context?.batch_messages).map(x=>x?.language_body??x?.body).join(' ')))return 'ar';
  return state?.language==='ar'?'ar':'en';
}
function renderGoalQuestion(fields,state,context){
  return goalClarificationReply({
    fields,
    language:responseLanguage(state,context),
    activity:activityLabel(state,context),
    deliveryModes:arr(contract(state)?.delivery_modes).filter(x=>x!=='HYBRID'),
  });
}
function updateCognition(state,fields,source,reply){
  if(!state.cognition)return;
  state.cognition.pending_field=fields[0]||null;
  state.cognition.pending_question=fields.length?{field:fields[0],fields,text:reply,presentation:'PENDING_DELIVERY'}:null;
  state.cognition.next_action=fields.length?'CLARIFY':state.cognition.next_action;
  state.cognition.response_strategy=fields.length>1?'ASK_COMBINED_BLOCKING_FACTS':'ASK_BEST_BLOCKING_FACT';
  state.cognition.planner={version:1,source,focus_fields:fields};
}

export function applyGoalDrivenConversationPlan({args,result}){
  if(!result?.state||!result?.decision)return result;
  const state=result.state,decision=result.decision,proposal=args?.proposal||null,previous=args?.previous||null,context=args?.context||{};
  reconcileTrustedFacts({args,state,context});
  // Special clarification flows (verified memory confirmation, service/slot
  // presentation, recovery, ambiguity and security) keep their dedicated
  // semantics. This planner only replaces the generic first-missing-field rule.
  if(decision.action!=='CLARIFY'||!ELIGIBLE_REASONS.has(decision.reasonCode))return result;
  const focus=chooseFocus({state,previous,proposal});
  if(!focus.fields.length)return result;
  const first=focus.fields[0];
  if(verified(state,first)&&!arr(state.invalid_fields).includes(first))return result;
  const old=state.clarification_entity;
  state.clarification_entity=first;
  if(old!==first)state.requirement_loop={key:first,count:1,revision:state.revision,updated_at:state.updated_at};
  // If the cognitive reducer already selected the same single field, retain its
  // contract-aware wording. It may contain grounded service/time context or a
  // precise ambiguity repair. We only rewrite when the planner actually changes
  // focus or deliberately combines a fresh date+time request.
  const keepExisting=focus.fields.length===1&&old===first&&clean(decision.reply,500).length>0;
  const reply=keepExisting?decision.reply:renderGoalQuestion(focus.fields,state,context);
  const nextDecision={...decision,action:'CLARIFY',reply,missingFields:arr(state.missing_fields),reasonCode:keepExisting?decision.reasonCode:'GOAL_DRIVEN_NEXT_BEST_QUESTION'};
  updateCognition(state,focus.fields,proposal?'MODEL_SEMANTICS_PLUS_BUSINESS_STATE':'BUSINESS_STATE',reply);
  return {state,decision:nextDecision};
}
