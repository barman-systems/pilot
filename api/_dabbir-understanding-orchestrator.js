import { BUDGET, normalizeSemanticText, resolveOrdinal, understandConversation, semanticPlannerContext } from './_dabbir-semantic-engine.js';

const arr=v=>Array.isArray(v)?v:[];
const val=(s,k)=>s.entities[k]?.value;
const MUTATIONS=new Set(['CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING']);
const SEMANTIC_INTENTS=new Set(['SUPPORT','SERVICE_DISCOVERY','PRICING','BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING','HUMAN_ASSISTANCE']);
const RECOVERABLE_PLANNER_ERRORS=new Set(['AI_PLANNER_UNAVAILABLE','AI_PLANNER_CONTRACT_INVALID','SEMANTIC_PROVIDER_BUDGET']);
export const SEMANTIC_SESSION_IDLE_MS=30*60*1000;
const safeMetrics=(s,d)=>({intent:d.intent,action:d.action,missing_count:s.missing_fields.length,
  unresolved_count:s.unresolved_references.length,correction_count:s.user_corrections.length,
  clarification_count:d.action==='CLARIFY'?1:0,voice:s.transcription_confidence!=null,
  semantic_confidence:s.semantic_confidence??0,operational_confidence:s.operational_confidence??0,
  tool_selection:d.reasonCode,model_calls:s.model_calls||0,planner_failure_code:s.planner_failure_code||null,
  semantic_interpreter:s.semantic_interpreter||'deterministic',semantic_override:s.semantic_ai_override?.to||null,
  session_reset:s.session_reset===true,greeting:d.reasonCode==='GREETING'||d.reasonCode==='NEW_SESSION_GREETING'});
const serviceLabel=s=>String(s?.name_ar||s?.name||s?.name_en||'').trim().slice(0,180);
const workerLabel=w=>String(w?.display_name||w?.name||'').trim().slice(0,160);
const scopedServices=c=>arr(c?.services).filter(s=>(!s?.business_id||s.business_id===c.business?.id)&&(!s?.branch_id||s.branch_id===c.conversation?.branch_id));
const scopedWorkers=c=>arr(c?.workers).filter(w=>(!w?.business_id||w.business_id===c.business?.id)&&(!w?.branch_id||w.branch_id===c.conversation?.branch_id));
function exactServiceByText(c,raw,allowedIds=null){
  const wanted=normalizeSemanticText(raw);if(!wanted)return null;
  const allowed=allowedIds?new Set(allowedIds):null;
  const matches=scopedServices(c).filter(s=>(!allowed||allowed.has(s.id))&&[s?.name_ar,s?.name,s?.name_en].some(name=>name&&normalizeSemanticText(name)===wanted));
  return matches.length===1?matches[0]:null;
}
function liveServicePresentation(c,at){
  const pending=c?.pending_state,payload=pending?.payload||{};
  if(pending?.pending_action!=='choose_service'||payload.presented!==true||!payload.provider_message_id||!pending.expires_at||Date.parse(pending.expires_at)<=at.getTime())return null;
  const offered=arr(payload.services).slice(0,10).filter(x=>x?.id&&scopedServices(c).some(s=>s.id===x.id));
  return offered.length?offered:null;
}
function groundedServiceChoice(c,raw,previous,at){
  const offered=liveServicePresentation(c,at);
  if(offered){
    const ordinal=resolveOrdinal(raw);
    if(!ordinal.ambiguous&&ordinal.index!=null&&offered[ordinal.index]){
      const selected=scopedServices(c).find(s=>s.id===offered[ordinal.index].id);
      if(selected)return selected;
    }
    const exact=exactServiceByText(c,raw,offered.map(x=>x.id));
    if(exact)return exact;
  }
  // Recovery for conversations affected before choose_service existed: an exact,
  // active service name after a service-discovery turn is sufficient database grounding.
  if(previous?.intent==='SERVICE_DISCOVERY')return exactServiceByText(c,raw);
  return null;
}
function previousForGroundedService(previous,grounded){
  if(!grounded||!previous||previous.intent!=='SERVICE_DISCOVERY')return previous;
  const next=structuredClone(previous);
  // A bare menu ordinal such as "2" used to leak into time parsing. It was never
  // operationally supported, so discard only that unresolved artifact while repairing.
  const time=next?.entities?.time;
  if(time?.status==='unresolved'&&time?.source==='CUSTOMER_STATED'&&Number(time?.confidence)<.9&&time?.part==='am_pm')delete next.entities.time;
  return next;
}
function pendingStateLive(c,at){
  const pending=c?.pending_state;
  return !!(pending?.pending_action&&pending.pending_action!=='none'&&pending.expires_at&&Date.parse(pending.expires_at)>at.getTime());
}
function sameSemanticScope(previous,c){
  const scope=previous?.scope;
  return !!(scope&&previous?.version===2&&scope.business_id===c.business?.id&&scope.conversation_id===c.conversation?.id&&scope.customer_id===c.customer?.id&&scope.branch_id===c.conversation?.branch_id);
}
function sessionPrevious(previous,c,at){
  if(!sameSemanticScope(previous,c))return {previous,reset:false};
  const updated=Date.parse(previous?.updated_at||previous?.created_at||'');
  const expired=previous?.expires_at&&Date.parse(previous.expires_at)<=at.getTime();
  const idle=!Number.isFinite(updated)||at.getTime()-updated>SEMANTIC_SESSION_IDLE_MS;
  if((expired||idle)&&!pendingStateLive(c,at))return {previous:null,reset:true};
  return {previous,reset:false};
}
function greetingOnly(messages){
  const text=normalizeSemanticText(arr(messages).map(x=>String(x?.body||'')).filter(Boolean).join(' '));
  return /^(?:السلام (?:عليكم|علیکم)(?: ورحمه الله(?: وبركاته)?)?|وعليكم السلام|وعلیکم السلام|سلام(?: (?:عليكم|علیکم))?|مرحبا(?: بك)?|هلا(?: والله)?|hello|hi|hey|good morning|good evening)$/.test(text);
}
function orphanChoiceOnly(messages){
  const text=normalizeSemanticText(arr(messages).map(x=>String(x?.body||'')).filter(Boolean).join(' '));
  return /^(?:[123]|الاول|اول|الثاني|ثاني|الثالث|ثالث|first|second|third|the first|the second|the third)$/.test(text);
}
function naturalLanguageTurn(messages){
  const text=normalizeSemanticText(arr(messages).map(x=>String(x?.language_body??x?.body||'')).filter(Boolean).join(' '));
  if(!text||orphanChoiceOnly(messages))return false;
  return text.length>=2;
}
function greetingDecision(state,sessionReset){
  state.sub_intent='GREETING';
  state.missing_fields=[];state.unresolved_references=[];
  state.overall_confidence=1;state.semantic_confidence=1;
  state.operational_confidence=Math.min(1,state.transcription_confidence==null?1:Number(state.transcription_confidence)||0);
  if(sessionReset){state.session_reset=true;state.goal='UNKNOWN';state.intent='SUPPORT';}
  const ar=state.language==='ar';
  return {action:'REPLY',intent:'SUPPORT',confidence:1,riskLevel:'LOW',missingFields:[],reasonCode:sessionReset?'NEW_SESSION_GREETING':'GREETING',reply:ar?'وعليكم السلام، حياك. كيف أقدر أساعدك؟':'Hello. How can I help you?'};
}
function staleChoiceDecision(state){
  delete state.entities?.time;delete state.entities?.slot;
  state.goal='UNKNOWN';state.intent='SUPPORT';state.sub_intent='STALE_OPTION_REFERENCE';state.pending_action=null;
  state.missing_fields=[];state.unresolved_references=[];state.overall_confidence=1;state.semantic_confidence=1;state.operational_confidence=1;state.session_reset=true;
  const ar=state.language==='ar';
  return {action:'REPLY',intent:'SUPPORT',confidence:1,riskLevel:'LOW',missingFields:[],reasonCode:'STALE_OPTION_REFERENCE',reply:ar?'انتهت القائمة السابقة. اكتب طلبك أو أرسل «شو خدماتكم» لعرض الخدمات من جديد.':'The previous list has expired. Tell me what you need or ask for the services again.'};
}
function plannerRecoveryDecision(state,code){
  state.model_calls=1;state.planner_failure_code=code;
  state.pending_action='CLARIFY';state.clarification_entity='request';
  state.overall_confidence=.35;state.semantic_confidence=.35;
  state.operational_confidence=Math.min(.35,state.transcription_confidence??1);
  return {action:'CLARIFY',intent:state.intent,confidence:.35,riskLevel:'LOW',missingFields:[],reasonCode:'PLANNER_RECOVERY_CLARIFICATION',
    reply:state.language==='ar'?'تقصد الاستفسار عن الخدمات والأسعار، أو تبا تحجز؟':'Are you asking about services and prices, or would you like to book?'};
}
function safePlannerHistory(c){
  return arr(c?.history).map(item=>{
    const sender=String(item?.sender_type||'').toLowerCase();
    const body=String(item?.body||'').trim().slice(0,600);
    if(!body||!['customer','ai','human'].includes(sender))return null;
    return {sender_type:sender,body,created_at:item?.created_at||null};
  }).filter(Boolean).slice(-8);
}
function aiFirstPlannerContext(c,state){
  const base=semanticPlannerContext(c,state),services=scopedServices(c),workers=scopedWorkers(c);
  const serviceName=id=>serviceLabel(services.find(x=>x.id===id));
  const workerName=id=>workerLabel(workers.find(x=>x.id===id));
  const pending=c?.pending_state||{},payload=pending?.payload||{};
  return {...base,
    current_messages:arr(c?.batch_messages).slice(-4).map(x=>String(x?.language_body??x?.body||'').trim().slice(0,700)).filter(Boolean),
    recent_conversation:safePlannerHistory(c),
    upcoming_appointments:arr(c?.upcoming_appointments).slice(0,6).map((a,index)=>({index:index+1,starts_at:a?.starts_at||null,status:a?.status||null,service:serviceName(a?.service_id)||null,worker:workerName(a?.worker_id)||null})),
    pending:{action:pending?.pending_action||'none',mode:payload?.mode||null,presented:payload?.presented===true,expires_at:pending?.expires_at||null,slot_count:arr(payload?.slots).length,service_count:arr(payload?.services).length,appointment_count:arr(payload?.appointments).length},
    verified_memory_keys:[...new Set(arr(c?.verified_memory).filter(m=>m?.status==='verified').map(m=>String(m?.memory_key||'').slice(0,80)).filter(Boolean))].slice(0,12),
  };
}
function normalizedProposalIntent(proposal){
  const intent=String(proposal?.intent||'').toUpperCase();
  return SEMANTIC_INTENTS.has(intent)?intent:null;
}
function proposalConflicts(state,proposal){
  const intent=normalizedProposalIntent(proposal),confidence=Number(proposal?.confidence)||0;
  return !!(intent&&confidence>=.86&&intent!==state.intent);
}
function proposalOverrideBase(state,previous,proposal){
  const next=structuredClone(state),to=normalizedProposalIntent(proposal);
  next.revision=previous?.revision||0;
  next.goal='UNKNOWN';next.intent='SUPPORT';next.sub_intent=null;next.pending_action=null;next.missing_fields=[];
  // Keep only safety/grounding ambiguity produced independently of the deterministic intent classifier.
  next.unresolved_references=arr(next.unresolved_references).filter(ref=>['branch','voice_transcript','multiple_options','slot_confirmation'].includes(ref));
  if(['BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING'].includes(to))next.intent_confirmed=false;else delete next.intent_confirmed;
  next.semantic_ai_override={from:state.intent,to,confidence:Number(proposal?.confidence)||0};
  return next;
}

// One bounded orchestrator owns Understanding -> Semantic AI -> Policy -> Tool -> Verification.
// The model interprets natural language; only database-grounded facts and existing mutation gates can execute.
export async function runUnderstandingTurn({claim,context,rpc,deliver,deliverMenu,resolveProduct,finish,handoff,bookingText,slotsText,planner,now=()=>new Date()}) {
  const started=Date.now();let steps=0;
  function budget(){if(++steps>BUDGET.maxSteps||Date.now()-started>BUDGET.timeoutMs)throw Object.assign(new Error('SEMANTIC_BUDGET_EXCEEDED'),{code:'SEMANTIC_BUDGET_EXCEEDED'});}
  const load=await rpc('dabbir_semantic_load_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token});
  const c={...context,...load},turnNow=now();
  const session=sessionPrevious(load.semantic_state,c,turnNow);
  let semanticPrevious=session.previous,groundedMenuSelection=false;
  const isGreeting=greetingOnly(c.batch_messages);
  // Product markers originate in the signed webhook. Text-menu choices are accepted
  // only from a provider-verified, unexpired ordered service presentation. Both paths
  // reduce to the same scoped catalog_service_id contract.
  c.batch_messages=await Promise.all(arr(c.batch_messages).map(async message=>{
    const body=String(message.body||'');
    const selected=groundedServiceChoice(c,body,semanticPrevious,turnNow);
    if(selected){groundedMenuSelection=true;return {...message,language_body:body,body:serviceLabel(selected),catalog_service_id:selected.id};}
    const product=body.match(/\[DABBIR_CATALOG_PRODUCT catalog_id=([0-9]{5,40}) product_retailer_id=([^\]\s]+)\]/);
    const order=body.match(/\[DABBIR_CATALOG_ORDER catalog_id=([0-9]{5,40}) items=([^\]]+)\]/);
    if(!product&&!order)return message;
    const items=order?order[2].split(','):[];
    if(order&&(items.length!==1||!items[0].endsWith('*1'))){c.catalog_error='CATALOG_MULTIPLE_ITEMS';return message;}
    let retailer;try{retailer=decodeURIComponent(product?product[2]:items[0].slice(0,-2));}catch{c.catalog_error='CATALOG_INVALID_SELECTION';return message;}
    budget();
    const mapped=resolveProduct?await resolveProduct({businessId:c.business.id,conversationId:c.conversation.id,catalogId:product?.[1]||order[1],productRetailerId:retailer}):null;
    if(!mapped?.service_id||!arr(c.services).some(s=>s.id===mapped.service_id)){c.catalog_error='CATALOG_UNMAPPED';return message;}
    return {...message,body:body.replace(/\[DABBIR_CATALOG_(?:PRODUCT|ORDER)[^\]]*\]/g,'').trim(),catalog_service_id:mapped.service_id};
  }));
  semanticPrevious=previousForGroundedService(semanticPrevious,groundedMenuSelection);
  let {state,decision}=understandConversation({context:c,previous:semanticPrevious,now:turnNow});
  const newScope=!sameSemanticScope(load.semantic_state,c);
  const orphanChoice=session.reset&&!pendingStateLive(c,turnNow)&&!groundedMenuSelection&&orphanChoiceOnly(c.batch_messages);
  state.model_calls=0;state.semantic_interpreter='deterministic';delete state.planner_failure_code;delete state.semantic_ai_override;
  if(decision.action==='SUPERSEDED'){await finish(claim,'CANCELLED','SEMANTIC_SUPERSEDED');return {state:'CANCELLED',action:'SUPERSEDED'};}
  // Safety and provider-verified shortcuts remain deterministic and never wait for a model.
  const shortcutAllowed=!['HANDOFF','SUPERSEDED'].includes(decision.action)&&!state.unresolved_references.includes('voice_transcript');
  if(shortcutAllowed&&orphanChoice)decision=staleChoiceDecision(state);
  else if(shortcutAllowed&&isGreeting)decision=greetingDecision(state,session.reset||newScope);
  const deterministic={state:structuredClone(state),decision:{...decision}};
  const shouldInterpret=!!(planner&&shortcutAllowed&&!isGreeting&&!orphanChoice&&!groundedMenuSelection&&naturalLanguageTurn(c.batch_messages));
  if(shouldInterpret){
    budget();
    let proposal,plannerFailure;
    try{proposal=await planner(c,aiFirstPlannerContext(c,state));}
    catch(error){
      if(!RECOVERABLE_PLANNER_ERRORS.has(error?.code))throw error;
      plannerFailure=error.code;
    }
    if(plannerFailure){
      state=deterministic.state;decision=deterministic.decision;state.model_calls=1;state.planner_failure_code=plannerFailure;
      // If deterministic understanding had no useful interpretation, preserve the existing safe clarification fallback.
      if(decision.reasonCode==='NO_OPERATIONAL_AUTHORITY')decision=plannerRecoveryDecision(state,plannerFailure);
    }else{
      const conflict=proposalConflicts(state,proposal);
      const providerContext=conflict?{...c,batch_messages:[]}:c;
      const providerPrevious=conflict?proposalOverrideBase(state,semanticPrevious,proposal):semanticPrevious;
      ({state,decision}=understandConversation({context:providerContext,previous:providerPrevious,now:turnNow,proposal}));
      state.model_calls=1;state.semantic_interpreter='ai_first_v1';delete state.planner_failure_code;
      if(conflict&&!state.semantic_ai_override)state.semantic_ai_override={from:deterministic.state.intent,to:normalizedProposalIntent(proposal),confidence:Number(proposal?.confidence)||0};
    }
  }
  if(session.reset)state.session_reset=true;else delete state.session_reset;
  budget();
  const committed=await rpc('dabbir_semantic_commit_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,
    p_expected_version:load.version,p_message_revision:load.message_revision,p_state:state,p_metrics:safeMetrics(state,decision)});
  if(committed.replay){
    state=committed.state;decision={...decision,action:state.pending_action||decision.action};
    if(shortcutAllowed&&orphanChoice)decision=staleChoiceDecision(state);else if(shortcutAllowed&&isGreeting)decision=greetingDecision(state,session.reset||newScope);
  }
  const version=committed.version,lang=state.language;
  const assertCurrent=()=>rpc('dabbir_semantic_assert_current_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:version});
  const setPending=(action,payload)=>rpc('dabbir_semantic_set_pending_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:version,p_action:action,p_payload:payload});
  const send=async(text,purpose)=>{budget();await assertCurrent();return deliver({...claim,semantic_version:version},c,text,purpose);};
  if(session.reset&&c.pending_state?.pending_action&&c.pending_state.pending_action!=='none'&&!pendingStateLive(c,turnNow)&&!['human_active','action_required'].includes(c.conversation?.state))await setPending('none',{});
  // A verified service choice is single-use. Retire the menu before the next customer
  // turn so a later bare number cannot be reinterpreted as the old service choice.
  if(groundedMenuSelection&&c.pending_state?.pending_action==='choose_service')await setPending('none',{});
  await rpc('dabbir_record_ai_operator_decision_v1',{p_business_id:c.business.id,p_conversation_id:c.conversation.id,p_batch_id:claim.batch_id,
    p_action:['CLARIFY','PRICING','SERVICE_MENU'].includes(decision.action)?'REPLY':decision.action,p_intent:decision.intent,p_confidence:decision.confidence,
    p_risk_level:decision.riskLevel,p_missing_fields:decision.missingFields,p_reason_code:decision.reasonCode}).catch(()=>null);
  if(decision.action==='HANDOFF') {
    await assertCurrent();await handoff(c,decision.reasonCode,'Understanding V2 requires human assistance','SUPPORT');
    await finish(claim,'HUMAN_REQUIRED',decision.reasonCode);return {state:'HUMAN_REQUIRED',action:'HANDOFF'};
  }
  if(MUTATIONS.has(decision.action)) {
    budget();
    const result=await rpc('dabbir_semantic_execute_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:version,p_action:decision.action});
    if(result?.verified!==true||!result?.appointment_id)throw Object.assign(new Error('SEMANTIC_OUTCOME_NOT_VERIFIED'),{code:'SEMANTIC_OUTCOME_NOT_VERIFIED'});
    const text=decision.action==='CANCEL_BOOKING'?(lang==='ar'?'تم إلغاء الموعد ✅.':'Your appointment has been cancelled ✅.'):
      decision.action==='RESCHEDULE_BOOKING'?(lang==='ar'?`تم تعديل الموعد ✅ إلى ${result.starts_at}.`:`Your appointment was rescheduled ✅ to ${result.starts_at}.`):bookingText(result,lang);
    await send(text,decision.action.toLowerCase());
    // Clear pending only after delivery finalization. Retry keeps the stable operation id.
    await setPending('none',{});await finish(claim,'PROCESSED');
    return {state:'PROCESSED',action:decision.action,verified:true,provider_verified:false};
  }
  if(decision.action==='CHECK_AVAILABILITY') {
    budget();await assertCurrent();
    const appt=arr(c.upcoming_appointments).find(x=>x.id===val(state,'appointment'));
    const av=await rpc('dabbir_whatsapp_ai_check_availability',{p_business_id:c.business.id,p_conversation_id:c.conversation.id,
      p_service_id:appt?.service_id||val(state,'service'),p_worker_id:appt?.worker_id||val(state,'worker')||null,
      p_requested_local:`${val(state,'date')}T${val(state,'time')}:00`});
    const slots=arr(av?.slots).slice(0,3);
    if(!slots.length){await send(lang==='ar'?'ما حصلت وقتًا متاحًا قريبًا. أي وقت آخر يناسبك؟':'No nearby time is available. What other time works for you?','no-slots');}
    else {
      const payload={mode:state.intent==='RESCHEDULE_BOOKING'?'reschedule':'booking',...(appt?{appointment_id:appt.id}:{}),slots,presented:false};
      await setPending('choose_slot',payload);
      const sent=await send(slotsText(slots,lang),'availability');
      if(!sent?.providerMessageId)throw Object.assign(new Error('SEMANTIC_PRESENTATION_UNVERIFIED'),{code:'SEMANTIC_PRESENTATION_UNVERIFIED'});
      await setPending('choose_slot',{...payload,presented:true,provider_message_id:sent.providerMessageId});
    }
    await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'CHECK_AVAILABILITY',slots:slots.length};
  }
  if(decision.action==='CLARIFY' && (state.missing_fields.includes('appointment') || state.unresolved_references.includes('appointment'))) {
    const appointments=arr(c.upcoming_appointments).slice(0,3);
    if(appointments.length){
      c.appointmentPresentation={appointments:appointments.map(a=>({id:a.id,starts_at:a.starts_at})),mode:state.intent,presented:false};
      await setPending('choose_appointment',c.appointmentPresentation);
      const lines=appointments.map((a,i)=>`${i+1}) ${new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-AE',{timeZone:c.business.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(a.starts_at))}`);
      decision.reply+='\n'+lines.join('\n');
    }
  }
  if(decision.action==='PRICING'||decision.action==='SERVICE_MENU') {
    if(decision.action==='SERVICE_MENU'&&deliverMenu){budget();await assertCurrent();const menu=await deliverMenu({...claim,semantic_version:version},c,lang);if(menu?.providerMessageId){await setPending('none',{});await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'CATALOG_MENU',semantic_version:version};}}
    const services=scopedServices(c).filter(x=>decision.action==='SERVICE_MENU'||!val(state,'service')||x.id===val(state,'service')).slice(0,10);
    if(services.length){c.servicePresentation={services:services.map(x=>({id:x.id,label:serviceLabel(x)})),presented:false};await setPending('choose_service',c.servicePresentation);}
    decision.reply=services.map((x,i)=>`${i+1}) ${serviceLabel(x)} — ${Number(x.price)} ${c.business.currency_code}`).join('\n')||(lang==='ar'?'لا توجد خدمات مفعّلة حاليًا.':'There are no active services right now.');
  }
  const sent=await send(decision.reply|| (lang==='ar'?'أي خدمة تحتاج؟':'Which service do you need?'),decision.action==='CLARIFY'?'clarify':'reply');
  if(c.appointmentPresentation&&sent?.providerMessageId)await setPending('choose_appointment',{...c.appointmentPresentation,presented:true,provider_message_id:sent.providerMessageId});
  if(c.servicePresentation){if(!sent?.providerMessageId)throw Object.assign(new Error('SEMANTIC_PRESENTATION_UNVERIFIED'),{code:'SEMANTIC_PRESENTATION_UNVERIFIED'});await setPending('choose_service',{...c.servicePresentation,presented:true,provider_message_id:sent.providerMessageId});}
  await finish(claim,'PROCESSED');return {state:'PROCESSED',action:decision.action,semantic_version:version};
}
