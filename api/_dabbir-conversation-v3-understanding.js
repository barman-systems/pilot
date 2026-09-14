import {isSocialOnlyTurnV3} from './_dabbir-conversation-v3-episode.js';
const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=500)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,n);
const norm=v=>clean(v,300).normalize('NFKD').replace(/[\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const STRONG=new Set(['DATABASE_FACT','CUSTOMER_STATED','CUSTOMER_CONFIRMED','CUSTOMER_CORRECTION','CUSTOMER_MEMORY','OWNER_POLICY','VERIFIED_BUSINESS_KNOWLEDGE','PROVIDER_VERIFIED']);
const TRUSTED_FAST_FIELDS=new Set(['location','slot']);
const TRUSTED_FAST_SOURCES=new Set(['PROVIDER_VERIFIED','CUSTOMER_CONFIRMED','DATABASE_FACT']);
const TIME_WINDOWS=new Set(['EARLY_MORNING','MORNING','AFTERNOON','EVENING','NIGHT']);
const currentMessage=context=>arr(context?.batch_messages).at(-1)||null;
const currentText=context=>arr(context?.batch_messages).map(m=>String(m?.language_body??m?.body??'')).filter(Boolean).join(' ').trim();
const scopedServices=context=>arr(context?.services).filter(s=>(!s?.business_id||s.business_id===context?.business?.id)&&(!s?.branch_id||s.branch_id===context?.conversation?.branch_id));
const profileServices=context=>arr(context?.activity_profile?.services).filter(s=>(!s?.business_id||s.business_id===context?.business?.id)&&(!s?.branch_id||s.branch_id===context?.conversation?.branch_id));
const fact=(field,value,source,resolution,extra={})=>{const {confidence=1,surface=null,...rest}=extra||{};return {field,status:'VERIFIED',value,source,confidence,resolution,surface,...rest};};
const tentative=(field,candidate_value,surface,resolution,extra={})=>({field,status:'TENTATIVE',value:candidate_value??null,candidate_value:candidate_value??null,source:extra.source||'SEMANTIC_PROPOSAL',confidence:extra.confidence??0,resolution,surface:clean(surface,300)||null});
function legacySeedFacts(canonical){return Object.entries(canonical?.entities||{}).flatMap(([field,f])=>f?.status==='active'&&f.value!=null&&STRONG.has(f.source)&&Number(f.confidence)>=.9?[fact(field,f.value,f.source,'CANONICAL_SEED',{confidence:Number(f.confidence),...(f.starts_at?{starts_at:f.starts_at}:{}),...(f.receipt_id?{receipt_id:f.receipt_id}:{})})]:[]);}
function stateFacts(state,canonical){if(Array.isArray(state?.facts))return state.facts.filter(f=>f?.status==='VERIFIED').map(f=>({...f}));return legacySeedFacts(canonical);}
function reconcileTentatives(state,facts){
  const location=facts.find(f=>f.field==='location'&&f.source==='PROVIDER_VERIFIED'&&f.resolution==='SIGNED_WHATSAPP_LOCATION'&&f.receipt_id);
  const lat=location?.value?.lat,lng=location?.value?.lng;
  const providerSurface=typeof lat==='number'&&Number.isFinite(lat)&&Math.abs(lat)<=90&&typeof lng==='number'&&Number.isFinite(lng)&&Math.abs(lng)<=180
    ?`📍 موقع واتساب: ${lat.toFixed(6)}, ${lng.toFixed(6)}${location.value.label?` — ${location.value.label}`:''}`:null;
  const invalidations=[],tentatives=[];
  for(const item of arr(state?.tentatives)){
    if(providerSurface&&item.field!=='location'&&item.source==='CURRENT_TURN_SURFACE'&&item.resolution==='SEMANTIC_SURFACE_UNMAPPED'&&item.value==null&&item.candidate_value==null&&item.surface===providerSurface){invalidations.push({field:item.field,reason:'PROVIDER_EVIDENCE_FIELD_MISMATCH',receipt_id:location.receipt_id});}
    else tentatives.push({...item});
  }
  return {tentatives,invalidations};
}
function putFact(map,f){if(f?.field&&f.status==='VERIFIED')map.set(f.field,f);}
function localParts(at,tz){try{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};}catch{return null}}
function serviceByName(context,name){const wanted=norm(name);if(!wanted)return null;const hits=scopedServices(context).filter(s=>[s?.name,s?.name_ar,s?.name_en].some(x=>norm(x)===wanted));return hits.length===1?hits[0]:null;}
function serviceById(context,id){return scopedServices(context).find(s=>s.id===id)||null;}
function contractFor(context,serviceId){return profileServices(context).find(s=>s.service_id===serviceId)||null;}
function unionDefinition(context,field){const defs=profileServices(context).map(s=>s?.entity_definitions?.[field]).filter(Boolean);if(!defs.length)return null;if(defs.every(d=>d.type===defs[0].type)){const values=[...new Set(defs.flatMap(d=>arr(d.values)))];return {...defs[0],...(values.length?{values}: {})};}return null;}
function activityWideSingleMode(context){const rows=profileServices(context);if(!rows.length)return null;const modes=[...new Set(rows.flatMap(r=>arr(r.delivery_modes)).filter(Boolean))];return modes.length===1?modes[0]:null;}
function validDate(value){return typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T12:00:00Z`));}
function validTime(value){return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);}
function evidenceOk(raw,evidence){const e=clean(evidence,300);return !!e&&raw.includes(e);}
function serviceSelectionVerified(proposal){return proposal?.serviceVerified===true||(proposal?.serviceVerified==null&&proposal?.serviceCandidateLabel==null);}
function applyTrustedFastFacts(context,factMap,turnVerified){for(const item of arr(context?.v3_fast_facts).slice(0,8)){const field=clean(item?.field,80),source=clean(item?.source,80);if(!TRUSTED_FAST_FIELDS.has(field)||!TRUSTED_FAST_SOURCES.has(source)||item?.value==null)continue;if(field==='location'&&source!=='PROVIDER_VERIFIED')continue;if(field==='slot'&&source!=='CUSTOMER_CONFIRMED')continue;const f=fact(field,item.value,source,clean(item?.resolution,120)||'TRUSTED_RUNTIME_FACT',{confidence:1,...(item?.starts_at?{starts_at:clean(item.starts_at,80)}:{}),...(item?.receipt_id?{receipt_id:clean(item.receipt_id,100)}:{}),...(item?.service_id?{service_id:clean(item.service_id,100)}:{}),...(item?.worker_id?{worker_id:clean(item.worker_id,100)}:{})});putFact(factMap,f);turnVerified.push(f);}}
export function seedConversationStateV3({previousShadow=null,canonicalState=null}){
  const facts=stateFacts(previousShadow,canonicalState),reconciled=reconcileTentatives(previousShadow,facts),pending=previousShadow?.pending_question||null;
  return {version:2,goal:previousShadow?.goal||canonicalState?.goal||'UNKNOWN',intent_confirmed:previousShadow?.intent_confirmed===true||canonicalState?.intent_confirmed===true,facts,tentatives:reconciled.tentatives,evidence_invalidations:reconciled.invalidations,pending_question:reconciled.invalidations.some(x=>arr(pending?.fields).includes(x.field))?null:pending,last_turn_at:previousShadow?.last_turn_at||canonicalState?.updated_at||canonicalState?.created_at||null,last_operational_turn_at:previousShadow?.last_operational_turn_at||previousShadow?.last_turn_at||null,episode_id:previousShadow?.episode_id||null,episode_started_at:previousShadow?.episode_started_at||null};
}
export function freshConversationStateV3({context,at}){return {version:2,goal:'UNKNOWN',intent_confirmed:false,facts:[],tentatives:[],pending_question:null,last_turn_at:null,episode_id:`${clean(context?.conversation?.id,80)}:${at.toISOString()}`,episode_started_at:at.toISOString()};}
export function understandTurnV3({context,proposal,previousState,now=new Date()}){
  const msg=currentMessage(context),raw=currentText(context),at=msg?.created_at?new Date(msg.created_at):now instanceof Date?now:new Date(now),safeAt=Number.isNaN(at.getTime())?new Date():at;
  const factMap=new Map(arr(previousState?.facts).filter(f=>f?.status==='VERIFIED').map(f=>[f.field,{...f}])),previousTentatives=arr(previousState?.tentatives).map(x=>({...x}));
  const turnVerified=[],turnTentative=[],sideQuestions=[],invalidations=arr(previousState?.evidence_invalidations).map(x=>({...x}));
  const invalidateFact=(field,reason)=>{if(factMap.has(field)){factMap.delete(field);if(!invalidations.some(x=>x.field===field&&x.reason===reason))invalidations.push({field,reason});}};
  if(context?.conversation?.branch_id){const f=fact('branch',context.conversation.branch_id,'DATABASE_FACT','SERVER_SCOPE');putFact(factMap,f);}
  applyTrustedFastFacts(context,factMap,turnVerified);
  const role=String(proposal?.dialogue?.message_role||'').toUpperCase();for(const field of arr(proposal?.dialogue?.invalidated_fields).map(x=>clean(x,80)).filter(Boolean))invalidateFact(field,'CUSTOMER_CORRECTION');
  const currentTemporal=arr(proposal?.entities).filter(item=>['date','time','time_window'].includes(clean(item?.entity,80))&&evidenceOk(raw,item?.evidence));
  if(currentTemporal.some(x=>x.entity==='time_window'))for(const field of ['time','slot','immediacy'])invalidateFact(field,'TEMPORAL_WINDOW_SUPERSEDES_EXACT_TIME');
  if(currentTemporal.some(x=>x.entity==='time'))for(const field of ['time_window','slot','immediacy'])invalidateFact(field,'EXACT_TIME_SUPERSEDES_TEMPORAL_WINDOW');
  if(currentTemporal.some(x=>x.entity==='date'&&x.correction===true))for(const field of ['slot','immediacy'])invalidateFact(field,'DATE_CORRECTION_INVALIDATES_DERIVED_TIME');
  const wideMode=activityWideSingleMode(context),semanticIntent=String(proposal?.intent||'').toUpperCase();if(wideMode&&['BOOKING','SERVICE_DISCOVERY','PRICING','RESCHEDULE_BOOKING'].includes(semanticIntent)){const f=fact('delivery_mode',wideMode,'DATABASE_FACT','ACTIVITY_SINGLE_MODE');putFact(factMap,f);turnVerified.push(f);}
  let selectedService=null;
  if(proposal?.serviceName){const candidate=serviceByName(context,proposal.serviceName);if(candidate&&serviceSelectionVerified(proposal)){selectedService=candidate;const f=fact('service',candidate.id,'CUSTOMER_CONFIRMED','V3_SCOPED_CATALOG_VERIFIED_SELECTION',{surface:proposal.serviceSurface||proposal.serviceName,confidence:1});putFact(factMap,f);turnVerified.push(f);if(Number.isFinite(Number(candidate.price))){const p=fact('price',Number(candidate.price),'DATABASE_FACT','SCOPED_CATALOG_PRICE');putFact(factMap,p);turnVerified.push(p);}}else if(candidate){turnTentative.push(tentative('service',candidate.id,proposal.serviceSurface||proposal.serviceName,'SCOPED_CATALOG_CANDIDATE_NEEDS_CONFIRMATION',{source:'V3_SEMANTIC_PROPOSAL',confidence:Number(proposal?.confidence)||0}));}}
  if(!selectedService){const serviceFact=factMap.get('service');if(serviceFact)selectedService=serviceById(context,serviceFact.value);}let contract=selectedService?contractFor(context,selectedService.id):null;
  if(role==='CONFIRMATION'&&previousState?.pending_question?.purpose==='CONFIRM_TENTATIVE_SERVICE'){const priorService=previousTentatives.find(x=>x.field==='service'&&x.candidate_value),row=priorService?serviceById(context,priorService.candidate_value):null;if(row){const f=fact('service',row.id,'CUSTOMER_CONFIRMED','TENTATIVE_CONFIRMED_BY_CUSTOMER',{surface:raw,confidence:1});putFact(factMap,f);turnVerified.push(f);invalidations.push({field:'service',reason:'TENTATIVE_CONFIRMED'});selectedService=row;contract=contractFor(context,row.id);if(Number.isFinite(Number(row.price))){const p=fact('price',Number(row.price),'DATABASE_FACT','SCOPED_CATALOG_PRICE');putFact(factMap,p);turnVerified.push(p);}}}
  if(contract&&arr(contract.delivery_modes).length===1){const f=fact('delivery_mode',contract.delivery_modes[0],'DATABASE_FACT','SERVICE_SINGLE_MODE');putFact(factMap,f);if(!turnVerified.some(x=>x.field==='delivery_mode'))turnVerified.push(f);}
  for(const item of arr(proposal?.entities).slice(0,16)){
    const field=clean(item?.entity,80),surface=clean(item?.evidence,300),value=item?.value,confidence=Number(item?.confidence)||0;if(!field||!evidenceOk(raw,surface))continue;const def=contract?.entity_definitions?.[field]||unionDefinition(context,field);
    if(field==='date'&&validDate(value)){const f=fact(field,value,item?.correction===true?'CUSTOMER_CORRECTION':'CUSTOMER_STATED','V3_SEMANTIC_DATE',{surface,confidence});putFact(factMap,f);turnVerified.push(f);continue;}
    if(field==='time'&&validTime(value)){const f=fact(field,value,item?.correction===true?'CUSTOMER_CORRECTION':'CUSTOMER_STATED','V3_SEMANTIC_TIME',{surface,confidence});putFact(factMap,f);turnVerified.push(f);continue;}
    if(field==='time_window'&&TIME_WINDOWS.has(value)){const f=fact(field,value,item?.correction===true?'CUSTOMER_CORRECTION':'CUSTOMER_STATED','V3_SEMANTIC_TIME_WINDOW',{surface,confidence});putFact(factMap,f);turnVerified.push(f);continue;}
    if(field==='vehicle'){
      const allowed=def?.type==='ENUM'&&arr(def.values).includes(value),pendingVehicle=arr(previousState?.pending_question?.fields).includes('vehicle')||previousState?.pending_question?.field==='vehicle';
      if(allowed&&pendingVehicle&&role==='ANSWER_TO_PENDING_QUESTION'&&confidence>=.9){const f=fact(field,value,item?.correction===true?'CUSTOMER_CORRECTION':'CUSTOMER_STATED','V3_PENDING_ENUM_ANSWER_VERIFIED',{surface,confidence});putFact(factMap,f);turnVerified.push(f);}
      else turnTentative.push(tentative(field,value,surface,allowed?'ALLOWED_VALUE_NEEDS_GROUNDING':'SEMANTIC_VALUE_NEEDS_MAPPING',{confidence}));
      continue;
    }
    if(field==='location'){turnTentative.push(tentative(field,value,surface,'LOCATION_REQUIRES_PROVIDER_VERIFICATION',{confidence}));continue;}
    if(field==='delivery_mode'){const allowed=def?.type==='ENUM'&&(!arr(def.values).length||arr(def.values).includes(value));if((wideMode&&value===wideMode)||(contract&&arr(contract.delivery_modes).length===1&&value===contract.delivery_modes[0])){const f=fact(field,value,item?.correction===true?'CUSTOMER_CORRECTION':'CUSTOMER_STATED','V3_SEMANTIC_DELIVERY_MODE',{surface,confidence:1});putFact(factMap,f);turnVerified.push(f);}else if(allowed)turnTentative.push(tentative(field,value,surface,'ALLOWED_VALUE_NEEDS_GROUNDING',{confidence}));continue;}
    if(def?.type==='TEXT')turnTentative.push(tentative(field,value??surface,surface,'TEXT_NEEDS_DIALOGUE_CONFIRMATION',{confidence}));
  }
  if(role==='CONFIRMATION'&&previousState?.pending_question?.purpose==='CONFIRM_TENTATIVE_VEHICLE'){const priorVehicle=previousTentatives.find(x=>x.field==='vehicle'&&x.candidate_value),row=priorVehicle;if(row){const f=fact('vehicle',row.candidate_value,'CUSTOMER_CONFIRMED','TENTATIVE_CONFIRMED_BY_CUSTOMER',{surface:raw,confidence:1});putFact(factMap,f);turnVerified.push(f);invalidations.push({field:'vehicle',reason:'TENTATIVE_CONFIRMED'});}}
  if(role==='DENIAL'&&['CONFIRM_TENTATIVE_VEHICLE','CONFIRM_TENTATIVE_SERVICE'].includes(previousState?.pending_question?.purpose)){const field=previousState.pending_question.purpose.endsWith('SERVICE')?'service':'vehicle';if(previousTentatives.some(x=>x.field===field))invalidations.push({field,reason:'CUSTOMER_DENIED_TENTATIVE'});}
  const serviceQuestions=Array.isArray(proposal?.serviceQuestions)?proposal.serviceQuestions:proposal?.serviceQuestion?[proposal.serviceQuestion]:[];
  for(const q of serviceQuestions.slice(0,4)){if(['price','duration_minutes','availability'].includes(q?.field))sideQuestions.push({type:q.field,evidence:q.evidence||null});}
  if(!sideQuestions.length&&String(proposal?.action||'').toUpperCase()==='PRICING')sideQuestions.push({type:'price',evidence:null});
  const pendingField=previousState?.pending_question?.fields?.[0]||previousState?.pending_question?.field||null;
  const explicitTurnEvidence=[...turnVerified,...turnTentative].filter(f=>f?.source!=='DATABASE_FACT');
  const hasIndependentEvidence=sideQuestions.length>0||explicitTurnEvidence.some(f=>f.field!==pendingField)||invalidations.some(f=>f.field!==pendingField);
  const pendingCompatible=!pendingField||role!=='ANSWER_TO_PENDING_QUESTION'||turnVerified.some(f=>f.field===pendingField)||turnTentative.some(f=>f.field===pendingField)||!hasIndependentEvidence;
  if(pendingField&&role==='ANSWER_TO_PENDING_QUESTION'&&pendingCompatible&&!turnVerified.some(f=>f.field===pendingField)&&!turnTentative.some(f=>f.field===pendingField)&&raw){if(!['service','slot','location'].includes(pendingField))turnTentative.push(tentative(pendingField,null,raw,'SEMANTIC_SURFACE_UNMAPPED',{source:'CURRENT_TURN_SURFACE',confidence:Number(proposal?.confidence)||0}));}
  const parts=localParts(safeAt,context?.business?.timezone||'Asia/Dubai'),date=factMap.get('date'),time=factMap.get('time');if(parts&&date?.value===parts.date&&time?.value===parts.time&&turnVerified.some(f=>f.field==='date'||f.field==='time')){const f=fact('immediacy','NOW','CUSTOMER_STATED','MESSAGE_RECEIPT_TIME');putFact(factMap,f);turnVerified.push(f);}
  const bookingIntentStrong=semanticIntent==='BOOKING'&&Number(proposal?.confidence||0)>=.5&&['NEW_REQUEST','ANSWER_TO_PENDING_QUESTION','CONTINUATION','CORRECTION','CONFIRMATION','REFERENCE'].includes(role||'NEW_REQUEST');const serviceSelectedThisTurn=turnVerified.some(f=>f.field==='service');let goal=previousState?.goal||'UNKNOWN';if(semanticIntent==='BOOKING')goal='BOOK_SERVICE';else if(semanticIntent==='RESCHEDULE_BOOKING')goal='RESCHEDULE_BOOKING';else if(semanticIntent==='CANCEL_BOOKING')goal='CANCEL_BOOKING';else if(semanticIntent==='SERVICE_DISCOVERY'&&!['BOOK_SERVICE','RESCHEDULE_BOOKING'].includes(goal))goal='DISCOVER_SERVICE';else if(semanticIntent==='PRICING'&&!['BOOK_SERVICE','RESCHEDULE_BOOKING'].includes(goal))goal='PRICE_SERVICE';else if(semanticIntent==='SUPPORT'&&goal==='UNKNOWN')goal='SUPPORT';
  const currentTentativeFields=new Set(turnTentative.map(x=>x.field)),confirmedTurnFields=new Set(turnVerified.map(x=>x.field));const tentatives=[...previousTentatives.filter(x=>!currentTentativeFields.has(x.field)&&!confirmedTurnFields.has(x.field)&&!invalidations.some(i=>i.field===x.field)),...turnTentative];
  return {version:2,turn:{message_id:msg?.id||null,created_at:safeAt.toISOString()},goal,role,confidence:Number(proposal?.confidence)||0,facts:[...factMap.values()],tentatives,invalidations,turn_verified:turnVerified,turn_tentative:turnTentative,side_questions:sideQuestions,signals:{social_only:isSocialOnlyTurnV3(proposal)&&explicitTurnEvidence.length===0,booking_intent_strong:bookingIntentStrong||serviceSelectedThisTurn&&previousState?.goal==='BOOK_SERVICE',service_selected_this_turn:serviceSelectedThisTurn,semantic_intent:semanticIntent,proposed_action:proposal?.action||null,pending_field:pendingField,pending_compatible:pendingCompatible,independent_turn_evidence:hasIndependentEvidence}};
}
