const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=500)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,n);
const norm=v=>clean(v,300).normalize('NFKD').replace(/[\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const STRONG=new Set(['DATABASE_FACT','CUSTOMER_STATED','CUSTOMER_CONFIRMED','CUSTOMER_CORRECTION','CUSTOMER_MEMORY','OWNER_POLICY','VERIFIED_BUSINESS_KNOWLEDGE','PROVIDER_VERIFIED']);

const currentMessage=context=>arr(context?.batch_messages).at(-1)||null;
const currentText=context=>arr(context?.batch_messages).map(m=>String(m?.language_body??m?.body??'')).filter(Boolean).join(' ').trim();
const scopedServices=context=>arr(context?.services).filter(s=>(!s?.business_id||s.business_id===context?.business?.id)&&(!s?.branch_id||s.branch_id===context?.conversation?.branch_id));
const profileServices=context=>arr(context?.activity_profile?.services).filter(s=>(!s?.business_id||s.business_id===context?.business?.id)&&(!s?.branch_id||s.branch_id===context?.conversation?.branch_id));
const fact=(field,value,source,resolution,extra={})=>({field,status:'VERIFIED',value,source,confidence:extra.confidence??1,resolution,surface:extra.surface??null});
const tentative=(field,candidate_value,surface,resolution,extra={})=>({field,status:'TENTATIVE',value:candidate_value??null,candidate_value:candidate_value??null,source:extra.source||'SEMANTIC_PROPOSAL',confidence:extra.confidence??0,resolution,surface:clean(surface,300)||null});

function legacySeedFacts(canonical){
  return Object.entries(canonical?.entities||{}).flatMap(([field,f])=>f?.status==='active'&&f.value!=null&&STRONG.has(f.source)&&Number(f.confidence)>=.9?[fact(field,f.value,f.source,'CANONICAL_SEED',{confidence:Number(f.confidence)})]:[]);
}
function stateFacts(state,canonical){
  if(Array.isArray(state?.facts))return state.facts.filter(f=>f?.status==='VERIFIED').map(f=>({...f}));
  return legacySeedFacts(canonical);
}
function stateTentatives(state){return arr(state?.tentatives).map(x=>({...x}));}
function putFact(map,f){if(f?.field&&f.status==='VERIFIED')map.set(f.field,f);}
function localParts(at,tz){
  try{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};}catch{return null}
}
function serviceByName(context,name){
  const wanted=norm(name);if(!wanted)return null;
  const hits=scopedServices(context).filter(s=>[s?.name,s?.name_ar,s?.name_en].some(x=>norm(x)===wanted));
  return hits.length===1?hits[0]:null;
}
function contractFor(context,serviceId){return profileServices(context).find(s=>s.service_id===serviceId)||null;}
function unionDefinition(context,field){
  const defs=profileServices(context).map(s=>s?.entity_definitions?.[field]).filter(Boolean);
  if(!defs.length)return null;
  if(defs.every(d=>d.type===defs[0].type)){
    const values=[...new Set(defs.flatMap(d=>arr(d.values)))];return {...defs[0],...(values.length?{values}: {})};
  }
  return null;
}
function activityWideSingleMode(context){
  const rows=profileServices(context);if(!rows.length)return null;
  const modes=[...new Set(rows.flatMap(r=>arr(r.delivery_modes)).filter(Boolean))];
  return modes.length===1?modes[0]:null;
}
function validDate(value){return typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T12:00:00Z`));}
function validTime(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return false;return true;}
function evidenceOk(raw,evidence){const e=clean(evidence,300);return !!e&&raw.includes(e);}

export function seedConversationStateV3({previousShadow=null,canonicalState=null}){
  return {version:2,goal:previousShadow?.goal||canonicalState?.goal||'UNKNOWN',intent_confirmed:previousShadow?.intent_confirmed===true||canonicalState?.intent_confirmed===true,
    facts:stateFacts(previousShadow,canonicalState),tentatives:stateTentatives(previousShadow),pending_question:previousShadow?.pending_question||null,
    last_turn_at:previousShadow?.last_turn_at||canonicalState?.updated_at||canonicalState?.created_at||null,episode_id:previousShadow?.episode_id||null,episode_started_at:previousShadow?.episode_started_at||null};
}

export function freshConversationStateV3({context,at}){
  return {version:2,goal:'UNKNOWN',intent_confirmed:false,facts:[],tentatives:[],pending_question:null,last_turn_at:null,
    episode_id:`${clean(context?.conversation?.id,80)}:${at.toISOString()}`,episode_started_at:at.toISOString()};
}

export function understandTurnV3({context,proposal,previousState,now=new Date()}){
  const msg=currentMessage(context),raw=currentText(context),at=msg?.created_at?new Date(msg.created_at):now instanceof Date?now:new Date(now);
  const safeAt=Number.isNaN(at.getTime())?new Date():at;
  const factMap=new Map(arr(previousState?.facts).filter(f=>f?.status==='VERIFIED').map(f=>[f.field,{...f}]));
  const previousTentatives=arr(previousState?.tentatives).map(x=>({...x}));
  const turnVerified=[],turnTentative=[],sideQuestions=[],invalidations=[];
  if(context?.conversation?.branch_id){const f=fact('branch',context.conversation.branch_id,'DATABASE_FACT','SERVER_SCOPE');putFact(factMap,f);}

  const role=String(proposal?.dialogue?.message_role||'').toUpperCase();
  for(const field of arr(proposal?.dialogue?.invalidated_fields).map(x=>clean(x,80)).filter(Boolean)){if(factMap.has(field)){factMap.delete(field);invalidations.push({field,reason:'CUSTOMER_CORRECTION'});}}
  const wideMode=activityWideSingleMode(context);
  const semanticIntent=String(proposal?.intent||'').toUpperCase();
  if(wideMode&&['BOOKING','SERVICE_DISCOVERY','PRICING','RESCHEDULE_BOOKING'].includes(semanticIntent)){
    const f=fact('delivery_mode',wideMode,'DATABASE_FACT','ACTIVITY_SINGLE_MODE');putFact(factMap,f);turnVerified.push(f);
  }

  let selectedService=null;
  if(proposal?.serviceName){
    selectedService=serviceByName(context,proposal.serviceName);
    if(selectedService){
      const f=fact('service',selectedService.id,'CUSTOMER_STATED','SCOPED_CATALOG_MATCH',{surface:proposal.serviceName,confidence:Math.max(.9,Number(proposal?.confidence)||0)});putFact(factMap,f);turnVerified.push(f);
      if(Number.isFinite(Number(selectedService.price))){const p=fact('price',Number(selectedService.price),'DATABASE_FACT','SCOPED_CATALOG_PRICE');putFact(factMap,p);turnVerified.push(p);}
    }
  }
  if(!selectedService){const serviceFact=factMap.get('service');if(serviceFact)selectedService=scopedServices(context).find(s=>s.id===serviceFact.value)||null;}
  const contract=selectedService?contractFor(context,selectedService.id):null;
  if(contract&&arr(contract.delivery_modes).length===1){const f=fact('delivery_mode',contract.delivery_modes[0],'DATABASE_FACT','SERVICE_SINGLE_MODE');putFact(factMap,f);if(!turnVerified.some(x=>x.field==='delivery_mode'))turnVerified.push(f);}

  for(const item of arr(proposal?.entities).slice(0,16)){
    const field=clean(item?.entity,80),surface=clean(item?.evidence,300),value=item?.value,confidence=Number(item?.confidence)||0;
    if(!field||!evidenceOk(raw,surface))continue;
    const def=contract?.entity_definitions?.[field]||unionDefinition(context,field);
    if(field==='date'&&validDate(value)){
      const f=fact(field,value,'CUSTOMER_STATED','SEMANTIC_STRUCTURAL_DATE',{surface,confidence});putFact(factMap,f);turnVerified.push(f);continue;
    }
    if(field==='time'&&validTime(value)){
      const f=fact(field,value,'CUSTOMER_STATED','SEMANTIC_STRUCTURAL_TIME',{surface,confidence});putFact(factMap,f);turnVerified.push(f);continue;
    }
    if(field==='vehicle'){
      const allowed=def?.type==='ENUM'&&arr(def.values).includes(value);
      turnTentative.push(tentative(field,value,surface,allowed?'ALLOWED_VALUE_NEEDS_GROUNDING':'SEMANTIC_VALUE_NEEDS_MAPPING',{confidence}));continue;
    }
    if(field==='location'){
      turnTentative.push(tentative(field,value,surface,'LOCATION_REQUIRES_PROVIDER_VERIFICATION',{confidence}));continue;
    }
    if(field==='delivery_mode'){
      const allowed=def?.type==='ENUM'&&(!arr(def.values).length||arr(def.values).includes(value));
      if((wideMode&&value===wideMode)||(contract&&arr(contract.delivery_modes).length===1&&value===contract.delivery_modes[0])){
        const f=fact(field,value,'DATABASE_FACT','SINGLE_MODE_CONFIRMED',{surface,confidence:1});putFact(factMap,f);turnVerified.push(f);
      }else if(allowed)turnTentative.push(tentative(field,value,surface,'ALLOWED_VALUE_NEEDS_GROUNDING',{confidence}));
      continue;
    }
    if(def?.type==='TEXT')turnTentative.push(tentative(field,value??surface,surface,'TEXT_NEEDS_DIALOGUE_CONFIRMATION',{confidence}));
  }

  if(role==='CONFIRMATION'&&previousState?.pending_question?.purpose==='CONFIRM_TENTATIVE_VEHICLE'){
    const priorVehicle=previousTentatives.find(x=>x.field==='vehicle'&&x.candidate_value);
    if(priorVehicle){const f=fact('vehicle',priorVehicle.candidate_value,'CUSTOMER_CONFIRMED','TENTATIVE_CONFIRMED_BY_CUSTOMER',{surface:raw,confidence:1});putFact(factMap,f);turnVerified.push(f);invalidations.push({field:'vehicle',reason:'TENTATIVE_CONFIRMED'});}
  }
  const pendingField=previousState?.pending_question?.fields?.[0]||previousState?.pending_question?.field||null;
  if(pendingField&&role==='ANSWER_TO_PENDING_QUESTION'&&!turnVerified.some(f=>f.field===pendingField)&&!turnTentative.some(f=>f.field===pendingField)&&raw){
    if(!['SIDE_QUESTION','SOCIAL','TOPIC_SWITCH','CANCELLATION'].includes(role))turnTentative.push(tentative(pendingField,null,raw,'SEMANTIC_SURFACE_UNMAPPED',{source:'CURRENT_TURN_SURFACE',confidence:Number(proposal?.confidence)||0}));
  }

  const parts=localParts(safeAt,context?.business?.timezone||'Asia/Dubai'),date=factMap.get('date'),time=factMap.get('time');
  if(parts&&date?.value===parts.date&&time?.value===parts.time&&turnVerified.some(f=>f.field==='date'||f.field==='time')){
    const f=fact('immediacy','NOW','CUSTOMER_STATED','MESSAGE_RECEIPT_TIME');putFact(factMap,f);turnVerified.push(f);
  }
  const serviceQuestion=proposal?.serviceQuestion?.field||null;
  if(serviceQuestion)sideQuestions.push({type:serviceQuestion,evidence:proposal.serviceQuestion?.evidence||null});
  else if(String(proposal?.action||'').toUpperCase()==='PRICING')sideQuestions.push({type:'price',evidence:null});

  const bookingIntentStrong=semanticIntent==='BOOKING'&&Number(proposal?.confidence||0)>=.5&&['NEW_REQUEST','ANSWER_TO_PENDING_QUESTION','CONTINUATION','CORRECTION'].includes(role||'NEW_REQUEST');
  const serviceSelectedThisTurn=turnVerified.some(f=>f.field==='service');
  const goal=semanticIntent==='BOOKING'?'BOOK_SERVICE':semanticIntent==='RESCHEDULE_BOOKING'?'RESCHEDULE_BOOKING':semanticIntent==='CANCEL_BOOKING'?'CANCEL_BOOKING':previousState?.goal||'UNKNOWN';
  const currentTentativeFields=new Set(turnTentative.map(x=>x.field));
  const confirmedTurnFields=new Set(turnVerified.map(x=>x.field));
  const tentatives=[...previousTentatives.filter(x=>!currentTentativeFields.has(x.field)&&!confirmedTurnFields.has(x.field)&&!invalidations.some(i=>i.field===x.field)),...turnTentative];
  return {version:2,turn:{message_id:msg?.id||null,created_at:safeAt.toISOString()},goal,role,confidence:Number(proposal?.confidence)||0,
    facts:[...factMap.values()],tentatives,invalidations,turn_verified:turnVerified,turn_tentative:turnTentative,side_questions:sideQuestions,
    signals:{booking_intent_strong:bookingIntentStrong||serviceSelectedThisTurn&&previousState?.goal==='BOOK_SERVICE',service_selected_this_turn:serviceSelectedThisTurn,semantic_intent:semanticIntent,proposed_action:proposal?.action||null}};
}
