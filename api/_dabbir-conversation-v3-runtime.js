import {interpretConversationTurnV3} from './_dabbir-conversation-v3-interpreter.js';
import {classifyEpisodeBoundaryV3} from './_dabbir-conversation-v3-episode.js';
import {seedConversationStateV3,freshConversationStateV3,understandTurnV3} from './_dabbir-conversation-v3-understanding.js';
import {planConversationTurnV3} from './_dabbir-conversation-v3-brain.js';
import {assertFinalResponseSourceV3,brainResponseV3,V3_RESPONSE_SOURCE} from './_dabbir-conversation-v3-invariants.js';
import {verifiedAvailability,assertResponseGrounding} from './_dabbir-brain-contract.js';

const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=500)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,n);
const ALLOWED_ENTITY_FIELDS=new Set(['service','date','time','location','vehicle','delivery_mode','worker','branch','appointment','slot','price','customer_reference']);
const ALLOWED_SOURCES=new Set(['DATABASE_FACT','CUSTOMER_STATED','CUSTOMER_CONFIRMED','CUSTOMER_CORRECTION','CUSTOMER_MEMORY','OWNER_POLICY','VERIFIED_BUSINESS_KNOWLEDGE','PROVIDER_VERIFIED','AI_INFERENCE']);
const LIVE_MODES=new Set(['canary','active']);
const READ_TYPES=new Set(['BUSINESS_HOURS','AVAILABILITY_DISCOVERY','SERVICE_PRICE','SERVICE_DURATION','SERVICE_MENU','UNKNOWN_READ']);
const TIME_WINDOW_RANGES=Object.freeze({
  EARLY_MORNING:{from:'05:00',to:'07:59'},
  MORNING:{from:'08:00',to:'11:59'},
  AFTERNOON:{from:'12:00',to:'16:59'},
  EVENING:{from:'17:00',to:'20:59'},
  NIGHT:{from:'21:00',to:'23:59'},
});

const factMap=state=>new Map(arr(state?.facts).filter(f=>f?.status==='VERIFIED'&&f.field).map(f=>[f.field,f]));
const factValue=(state,field)=>factMap(state).get(field)?.value??null;
const currentAt=(context,now)=>{const raw=context?.batch?.last_message_at||arr(context?.batch_messages).at(-1)?.created_at;const d=raw?new Date(raw):now instanceof Date?now:new Date(now||Date.now());return Number.isNaN(d.getTime())?new Date():d;};
const inferLanguage=context=>/[\u0600-\u06FF]/.test(arr(context?.batch_messages).map(m=>String(m?.body||'')).join(' '))?'ar':'en';
const intentForGoal=goal=>goal==='BOOK_SERVICE'?'BOOKING':goal==='DISCOVER_SERVICE'?'SERVICE_DISCOVERY':goal==='PRICE_SERVICE'?'PRICING':goal==='CANCEL_BOOKING'?'CANCEL_BOOKING':goal==='RESCHEDULE_BOOKING'?'RESCHEDULE_BOOKING':'SUPPORT';
function selectedContract(state,context){const id=factValue(state,'service');return arr(context?.activity_profile?.services).find(c=>c.service_id===id)||null;}
function sourceFor(f){return ALLOWED_SOURCES.has(f?.source)?f.source:'AI_INFERENCE';}
function entityFor(f,at){const out={value:f.value,source:sourceFor(f),confidence:Math.max(0,Math.min(1,Number(f.confidence)||0)),status:'active',updated_at:at.toISOString(),grounded_by:clean(f.resolution,120)||'V3_RUNTIME'};for(const key of ['starts_at','receipt_id','service_id','worker_id'])if(f?.[key]!=null)out[key]=f[key];return out;}
function compactRuntimeState(state){return {version:state.version,goal:state.goal,intent_confirmed:state.intent_confirmed,episode_id:state.episode_id,episode_started_at:state.episode_started_at,last_turn_at:state.last_turn_at,last_operational_turn_at:state.last_operational_turn_at,episode_boundary:state.episode_boundary,facts:arr(state.facts).slice(0,20).map(f=>({...f,surface:f.surface?clean(f.surface,160):null})),tentatives:arr(state.tentatives).slice(0,12).map(t=>({...t,surface:t.surface?clean(t.surface,160):null})),invalidations:arr(state.invalidations).slice(0,12),pending_question:state.pending_question||null};}
function authorityProjection({load,state,plan,context,action,at,interpretation}){
  const previous=load?.semantic_state&&typeof load.semantic_state==='object'?load.semantic_state:{},entities={};
  for(const f of arr(state.facts))if(f?.status==='VERIFIED'&&ALLOWED_ENTITY_FIELDS.has(f.field)&&f.value!=null)entities[f.field]=entityFor(f,at);
  const contract=selectedContract(state,context),missing=arr(plan?.missing_fields).slice(0,24),ready=missing.length===0;
  const scope={business_id:context.business.id,conversation_id:context.conversation.id,customer_id:context.customer.id,branch_id:context.conversation.branch_id};
  const runtime=compactRuntimeState(state),language=previous.language||inferLanguage(context),created=previous.created_at||at.toISOString();
  const projection={version:2,revision:Number(previous.revision||0)+1,scope,goal:state.goal,intent:intentForGoal(state.goal),sub_intent:'V3_RUNTIME',entities,pending_action:action,missing_fields:missing,unresolved_references:[],user_corrections:arr(previous.user_corrections).slice(-12),business_constraints:arr(previous.business_constraints).slice(-12),owner_policies:arr(previous.owner_policies).slice(-12),last_confirmed_facts:previous.last_confirmed_facts||{},last_verified_action:previous.last_verified_action||null,last_verified_outcome:previous.last_verified_outcome||null,language,dialect:previous.dialect||'unknown',overall_confidence:Math.max(.5,Number(interpretation?.proposal?.confidence)||0),semantic_confidence:Math.max(.5,Number(interpretation?.proposal?.confidence)||0),operational_confidence:ready?1:.6,created_at:created,updated_at:at.toISOString(),expires_at:new Date(at.getTime()+86400000).toISOString(),intent_confirmed:state.intent_confirmed===true,delivery_mode:factValue(state,'delivery_mode')||null,service_type:context.business?.business_type||null,required_entities:arr(plan?.required_fields).slice(0,24),supported_actions:arr(contract?.supported_actions||contract?.actions).slice(0,24),activity_contract_version:contract?.contract_version||contract?.schema_version||null,clarification_entity:missing[0]||null,policy_dependencies:arr(previous.policy_dependencies).slice(0,20),v3_runtime:runtime,v3_engine:{version:3,engine:'V3',interpreter:'V3_INDEPENDENT',response_source:V3_RESPONSE_SOURCE,legacy_dialogue_called:false,mode:load?.cognitive_policy?.mode||null,provider:clean(interpretation?.provider,100)||null,model:clean(interpretation?.model,120)||null}};
  if(Buffer.byteLength(JSON.stringify(projection),'utf8')>32000)throw Object.assign(new Error('V3_AUTHORITY_STATE_TOO_LARGE'),{code:'V3_AUTHORITY_STATE_TOO_LARGE'});return projection;
}
function sideQuestionFields(interpretation){return arr(interpretation?.proposal?.serviceQuestions).map(x=>String(x?.field||'').toLowerCase()).filter(Boolean);}
function deriveCurrentTurnAuthority({interpretation}={}){
  const proposal=interpretation?.proposal||{},role=String(proposal?.dialogue?.message_role||'').toUpperCase(),questions=sideQuestionFields(interpretation),fast=arr(interpretation?.fastFacts);
  let read=null;
  if(questions.includes('business_hours'))read='BUSINESS_HOURS';
  else if(questions.includes('availability'))read='AVAILABILITY_DISCOVERY';
  else if(questions.includes('price'))read='SERVICE_PRICE';
  else if(questions.includes('duration_minutes'))read='SERVICE_DURATION';
  else if(role==='SIDE_QUESTION'&&proposal?.intent==='SERVICE_DISCOVERY')read='SERVICE_MENU';
  else if(role==='SIDE_QUESTION')read='UNKNOWN_READ';
  const structuredLocation=fast.some(x=>x?.field==='location'&&x?.source==='PROVIDER_VERIFIED');
  const structuredSlot=fast.some(x=>x?.field==='slot'&&x?.source==='CUSTOMER_CONFIRMED');
  const entityProgress=arr(proposal?.entities).some(x=>typeof x?.evidence==='string'&&x.evidence.trim().length>0);
  const serviceProgress=!!(proposal?.serviceName&&proposal?.serviceSurface);
  const confirmation=role==='CONFIRMATION'&&typeof proposal?.dialogue?.evidence==='string'&&proposal.dialogue.evidence.trim().length>0;
  const explicitMutation=proposal?.intent==='CANCEL_BOOKING'&&proposal?.action==='CANCEL_BOOKING'?'CANCEL_BOOKING':proposal?.intent==='RESCHEDULE_BOOKING'&&proposal?.action==='RESCHEDULE_BOOKING'?'RESCHEDULE_BOOKING':null;
  return {read:READ_TYPES.has(read)?read:null,goal_progress:structuredLocation||structuredSlot||entityProgress||serviceProgress||confirmation,slot_selected:structuredSlot,explicit_mutation:explicitMutation,evidence_source:structuredSlot?'STRUCTURED_SLOT_SELECTION':structuredLocation?'STRUCTURED_LOCATION_RECEIPT':entityProgress||serviceProgress||confirmation?'CURRENT_MESSAGE':'NONE'};
}
function inheritedOperationalAction({state,plan}){
  if(state.goal==='BOOK_SERVICE'&&plan.proposed_action==='READY_FOR_AUTHORITY')return factValue(state,'slot')!=null?'CREATE_BOOKING':'CHECK_AVAILABILITY';
  if(['RESCHEDULE_BOOKING','CANCEL_BOOKING'].includes(state.goal))return 'HANDOFF';
  return null;
}
function authorityAction({state,plan,authority}){
  if(authority?.read&&!authority?.explicit_mutation)return 'REPLY';
  if(plan.proposed_action==='REPLY')return 'REPLY';
  if(state.goal==='BOOK_SERVICE'&&plan.proposed_action==='READY_FOR_AUTHORITY'){
    if(factValue(state,'slot')!=null)return authority?.slot_selected?'CREATE_BOOKING':'REPLY';
    return authority?.goal_progress?'CHECK_AVAILABILITY':'REPLY';
  }
  if(['RESCHEDULE_BOOKING','CANCEL_BOOKING'].includes(state.goal))return authority?.explicit_mutation===state.goal?'HANDOFF':'REPLY';
  if(plan.proposed_action==='CLARIFY')return 'CLARIFY';return 'REPLY';
}
function executableReadIntent(authority){return authority?.explicit_mutation?null:(authority?.read||null);}
function approvedKnowledge(context,key){return arr(context?.knowledge).find(x=>x?.key===key&&x?.source==='owner_approved'&&Number(x?.confidence)>=.95)||null;}
function knowledgeText(row,language){const value=row?.value;if(typeof value==='string')return clean(value,1200);if(!value||typeof value!=='object')return null;const ar=value.answer_ar||value.text_ar,en=value.answer_en||value.text_en,base=value.text||value.answer;return clean(language==='ar'?(ar||base||en):(en||base||ar),1200)||null;}
function businessHoursReply(context,language){
  const row=approvedKnowledge(context,'business_hours'),text=knowledgeText(row,language);if(!text)return null;
  const ranges=[...text.matchAll(/\b([01]\d|2[0-3]):[0-5]\d\s*[-–—]\s*([01]\d|2[0-3]):[0-5]\d\b/g)].map(m=>m[0].replace(/\s+/g,''));const unique=[...new Set(ranges)];
  if(unique.length===1){const [open,close]=unique[0].split(/[-–—]/);return language==='ar'?`ساعات العمل: من ${open} إلى ${close} يوميًا.`:`Business hours: ${open} to ${close} daily.`;}
  return language==='ar'?`ساعات العمل المعتمدة: ${text}`:`Approved business hours: ${text}`;
}
function businessLocalDate(at,timezone){try{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}catch{return at.toISOString().slice(0,10)}}
function addCalendarDays(date,days){const d=new Date(`${date}T12:00:00Z`);if(Number.isNaN(d.getTime()))return date;d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function timeWindowRange(state){
  const name=String(factValue(state,'time_window')||'').toUpperCase(),range=TIME_WINDOW_RANGES[name];
  return range?{name,from:range.from,to:range.to}:null;
}
function slotMinute(slot){const match=String(slot?.local_start||'').match(/T(\d{2}):(\d{2})/);if(!match)return null;return Number(match[1])*60+Number(match[2]);}
function rangeMinute(value){const match=String(value||'').match(/^(\d{2}):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):null;}
function slotMatchesTimeWindow(slot,range){if(!range)return true;const minute=slotMinute(slot),from=rangeMinute(range.from),to=rangeMinute(range.to);return minute!=null&&from!=null&&to!=null&&minute>=from&&minute<=to;}
async function discoverAvailability({rpc,state,context,at}){
  const serviceId=factValue(state,'service');if(!serviceId)return {slots:[],state:'NEED_GROUNDED_SERVICE'};
  const workerId=factValue(state,'worker')||null,start=/^20\d{2}-\d{2}-\d{2}$/.test(String(factValue(state,'date')||''))?String(factValue(state,'date')):businessLocalDate(at,context?.business?.timezone),range=timeWindowRange(state);
  for(let day=0;day<4;day++){
    const date=addCalendarDays(start,day),raw=await rpc('dabbir_whatsapp_ai_find_available_options_v1',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_service_id:serviceId,p_worker_id:workerId,p_requested_date:date,p_from:range?.from||null,p_to:range?.to||null,p_max_candidates:12});
    const future=arr(raw?.slots).filter(s=>Number.isFinite(Date.parse(s?.starts_at))&&Date.parse(s.starts_at)>at.getTime()&&slotMatchesTimeWindow(s,range));if(future.length)return {slots:future,date,state:'OPTIONS_FOUND',time_window:range?.name||null,from:range?.from||null,to:range?.to||null};
  }
  return {slots:[],date:start,state:'NO_OPTIONS',time_window:range?.name||null,from:range?.from||null,to:range?.to||null};
}
function serviceMenuReply(context,language){const rows=arr(context?.services).slice(0,10).filter(x=>x?.id);if(!rows.length)return language==='ar'?'ما عندي خدمات مفعّلة أقدر أعرضها لك الآن.':'No active services are available to show right now.';return language==='ar'?`الخدمات المتاحة: ${rows.map((x,i)=>`${i+1}) ${clean(x.name_ar||x.name||x.name_en,120)}${Number.isFinite(Number(x.price))?` — ${Number(x.price)} درهم`:''}`).join('، ')}.`:`Available services: ${rows.map((x,i)=>`${i+1}) ${clean(x.name_en||x.name||x.name_ar,120)}${Number.isFinite(Number(x.price))?` — ${Number(x.price)} ${clean(context?.business?.currency_code||'AED',8)}`:''}`).join(', ')}.`;}
function metricsFor({state,plan,action,interpretation,episode,authority,deniedAction}){return {engine:'V3',response_source:V3_RESPONSE_SOURCE,legacy_dialogue_called:false,goal:state.goal,action,message_role:interpretation?.proposal?.dialogue?.message_role||null,requested_action:interpretation?.proposal?.action||null,turn_disposition:plan.turn_disposition||'OPERATIONAL',read_intent:authority?.read||null,current_turn_authority:{goal_progress:authority?.goal_progress===true,slot_selected:authority?.slot_selected===true,explicit_mutation:authority?.explicit_mutation||null,evidence_source:authority?.evidence_source||'NONE'},proposed_but_denied:deniedAction||null,evidence_invalidations:arr(state.invalidations).map(x=>({field:x.field,reason:x.reason})),episode:episode?.kind||null,episode_reason:episode?.reason||null,missing_fields:arr(plan.missing_fields),intent_confirmed:state.intent_confirmed===true,interpreter:'V3_INDEPENDENT',provider:clean(interpretation?.provider,80)||null,model:clean(interpretation?.model,100)||null};}
function preserveUnmappedService(understanding,proposal){
  const surface=clean(proposal?.serviceSurface,180),hasVerified=arr(understanding?.facts).some(f=>f?.field==='service'&&f?.status==='VERIFIED'),hasTentative=arr(understanding?.tentatives).some(t=>t?.field==='service');
  if(!surface||proposal?.serviceName||hasVerified||hasTentative)return understanding;
  const candidate={field:'service',status:'TENTATIVE',value:null,candidate_value:null,source:'V3_SEMANTIC_PROPOSAL',confidence:Math.max(0,Math.min(1,Number(proposal?.confidence)||0)),resolution:'SCOPED_CATALOG_UNRESOLVED',surface};
  return {...understanding,tentatives:[...arr(understanding.tentatives),candidate],turn_tentative:[...arr(understanding.turn_tentative),candidate]};
}
function log(logger,record){try{logger.info?.(JSON.stringify(record));}catch{}}

export async function runConversationV3Runtime({claim,context,rpc,deliver,finish,handoff,bookingText,slotsText,interpreter=interpretConversationTurnV3,now=()=>new Date(),logger=console,preloadedLoad=null}){
  const load=preloadedLoad||await rpc('dabbir_semantic_load_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token});
  const mode=load?.cognitive_policy?.mode||'shadow';if(!LIVE_MODES.has(mode))throw Object.assign(new Error('V3_RUNTIME_NOT_SELECTED'),{code:'V3_RUNTIME_NOT_SELECTED'});
  const at=currentAt(context,now()),previousRuntime=load?.semantic_state?.v3_runtime||null,merged={...context,...load};
  const firstV3=!previousRuntime,seeded=seedConversationStateV3({previousShadow:previousRuntime,canonicalState:firstV3?{}:load.semantic_state||{}});
  const interpretation=await interpreter({context:merged,previousState:firstV3?null:seeded,now:at});const enriched={...merged,v3_fast_facts:arr(interpretation.fastFacts)};
  const episode=firstV3?{kind:'NEW_EPISODE',reason:'V3_ENGINE_CUTOVER',idle_ms:null,at:at.toISOString()}:classifyEpisodeBoundaryV3({previousState:seeded,canonicalState:load.semantic_state||{},proposal:interpretation.proposal,context:enriched,now:at});
  const base=episode.kind==='NEW_EPISODE'?freshConversationStateV3({context:enriched,at}):seeded;
  const understood=understandTurnV3({context:enriched,proposal:interpretation.proposal,previousState:base,now:at});
  const understanding=preserveUnmappedService(understood,interpretation.proposal);
  let {state,plan,response}=planConversationTurnV3({previousState:base,understanding,episode,context:enriched});
  const authority=deriveCurrentTurnAuthority({interpretation,state,plan,context:enriched}),candidate=inheritedOperationalAction({state,plan}),action=authorityAction({state,plan,authority}),deniedAction=candidate&&candidate!==action?candidate:null,readIntent=executableReadIntent(authority);
  const projection=authorityProjection({load,state,plan,context:enriched,action,at,interpretation});
  const committed=await rpc('dabbir_semantic_commit_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_expected_version:load.version,p_message_revision:load.message_revision,p_state:projection,p_metrics:metricsFor({state,plan,action,interpretation,episode,authority,deniedAction})});
  const version=committed.version,guarded={...claim,semantic_version:version};
  const sendV3=async(v3Response,purpose,receipt=null)=>{assertFinalResponseSourceV3(v3Response);assertResponseGrounding(v3Response.text,receipt);await rpc('dabbir_semantic_assert_current_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:version});const sent=await deliver(guarded,enriched,v3Response.text,purpose);log(logger,{event:'DABBIR_V3_OUTBOUND',engine:'V3',response_source:V3_RESPONSE_SOURCE,legacy_dialogue_called:false,batch_id:claim.batch_id,semantic_version:version,provider_message_id:sent?.providerMessageId||null,action,read_intent:readIntent,proposed_but_denied:deniedAction});return sent;};
  await rpc('dabbir_record_ai_operator_decision_v1',{p_business_id:enriched.business.id,p_conversation_id:enriched.conversation.id,p_batch_id:claim.batch_id,p_action:['CLARIFY','REPLY'].includes(action)?'REPLY':action,p_intent:intentForGoal(state.goal),p_confidence:Math.max(.5,Number(interpretation?.proposal?.confidence)||0),p_risk_level:action==='CREATE_BOOKING'?'MEDIUM':'LOW',p_missing_fields:arr(plan.missing_fields),p_reason_code:`V3_${clean(readIntent||plan.next_question?.purpose||action,80)}`}).catch(()=>null);

  if(readIntent==='BUSINESS_HOURS'){
    const grounded=businessHoursReply(enriched,projection.language),fallback=projection.language==='ar'?'ما عندي ساعات عمل معتمدة أقدر أعطيك إياها الآن.':'I do not have approved business hours I can give you right now.';const suffix=plan.next_question?response.text:'';
    response=brainResponseV3({text:`${grounded||fallback}${suffix?`\n${suffix}`:''}`,plan_id:`${state.episode_id}:business-hours`,metadata:{goal:state.goal,read_intent:readIntent}});await sendV3(response,'v3-business-hours');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'REPLY',read_intent:readIntent,engine:'V3',legacy_dialogue_called:false};
  }
  if(readIntent==='AVAILABILITY_DISCOVERY'){
    const found=await discoverAvailability({rpc,state,context:enriched,at});let slots=[];
    if(found.slots.length)slots=verifiedAvailability({slots:found.slots},enriched,projection);
    if(slots.length){const payload={activity_contract_version:projection.activity_contract_version,mode:'booking',slots,presented:false};await rpc('dabbir_semantic_set_pending_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:version,p_action:'choose_slot',p_payload:payload});response=brainResponseV3({text:slotsText(slots,projection.language,null),plan_id:`${state.episode_id}:availability-discovery`,metadata:{goal:state.goal,read_intent:readIntent}});const sent=await sendV3(response,'v3-availability-discovery');if(!sent?.providerMessageId)throw Object.assign(new Error('V3_PRESENTATION_UNVERIFIED'),{code:'V3_PRESENTATION_UNVERIFIED'});await rpc('dabbir_semantic_set_pending_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:version,p_action:'choose_slot',p_payload:{...payload,presented:true,provider_message_id:sent.providerMessageId}});}else{response=brainResponseV3({text:projection.language==='ar'?'ما حصلت مواعيد متاحة في الأيام القريبة.':'I could not find available appointments in the next few days.',plan_id:`${state.episode_id}:availability-discovery-empty`,metadata:{goal:state.goal,read_intent:readIntent,read_only:true}});await sendV3(response,'v3-availability-discovery-empty');}
    await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'REPLY',read_intent:readIntent,slots:slots.length,engine:'V3',legacy_dialogue_called:false};
  }
  if(readIntent==='SERVICE_MENU'){
    response=brainResponseV3({text:serviceMenuReply(enriched,projection.language),plan_id:`${state.episode_id}:service-menu-read`,metadata:{goal:state.goal,read_intent:readIntent}});await sendV3(response,'v3-service-menu-read');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'REPLY',read_intent:readIntent,engine:'V3',legacy_dialogue_called:false};
  }
  if(readIntent==='UNKNOWN_READ'){
    const unknown=projection.language==='ar'?'ما عندي معلومة معتمدة عن هذا حاليًا.':'I do not have approved information about that right now.',suffix=plan.next_question?response.text:'';response=brainResponseV3({text:`${unknown}${suffix?`\n${suffix}`:''}`,plan_id:`${state.episode_id}:unknown-read`,metadata:{goal:state.goal,read_intent:readIntent}});await sendV3(response,'v3-unknown-read');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'REPLY',read_intent:readIntent,engine:'V3',legacy_dialogue_called:false};
  }
  if(action==='HANDOFF'){await handoff(enriched,'V3_OPERATION_REQUIRES_SAFE_AUTHORITY','V3 does not silently fall back to legacy dialogue','SUPPORT');await finish(claim,'HUMAN_REQUIRED','V3_OPERATION_REQUIRES_SAFE_AUTHORITY');return {state:'HUMAN_REQUIRED',action:'HANDOFF',engine:'V3',legacy_dialogue_called:false};}
  if(action==='CREATE_BOOKING'){
    const executed=await rpc('dabbir_semantic_execute_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:version,p_action:action});if(executed?.verified!==true||!executed?.appointment_id)throw Object.assign(new Error('V3_AUTHORITY_OUTCOME_UNVERIFIED'),{code:'V3_AUTHORITY_OUTCOME_UNVERIFIED'});
    response=brainResponseV3({text:bookingText(executed,projection.language),plan_id:`${state.episode_id}:verified-action`,metadata:{goal:state.goal,verified_action:action}});await sendV3(response,action.toLowerCase(),{verified:true,action});
    await rpc('dabbir_semantic_set_pending_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:version,p_action:'none',p_payload:{}});await finish(claim,'PROCESSED');return {state:'PROCESSED',action,verified:true,engine:'V3',response_source:V3_RESPONSE_SOURCE,legacy_dialogue_called:false};
  }
  if(action==='CHECK_AVAILABILITY'){
    const availability=await rpc('dabbir_semantic_check_availability_v1',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:version});const slots=verifiedAvailability(availability,enriched,projection);
    if(!slots.length){response=brainResponseV3({text:projection.language==='ar'?'ما حصلت وقتًا متاحًا قريبًا. عطِني وقتًا ثاني يناسبك.':'I could not find a nearby available time. Send another time that works for you.',plan_id:`${state.episode_id}:no-slots`,metadata:{goal:state.goal}});await sendV3(response,'v3-no-slots');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'CHECK_AVAILABILITY',slots:0,engine:'V3',legacy_dialogue_called:false};}
    const payload={activity_contract_version:projection.activity_contract_version,mode:'booking',slots,presented:false};await rpc('dabbir_semantic_set_pending_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:version,p_action:'choose_slot',p_payload:payload});
    response=brainResponseV3({text:slotsText(slots,projection.language,{date:factValue(state,'date'),time:factValue(state,'time'),timezone:enriched.business?.timezone||null}),plan_id:`${state.episode_id}:availability`,metadata:{goal:state.goal}});const sent=await sendV3(response,'v3-availability');if(!sent?.providerMessageId)throw Object.assign(new Error('V3_PRESENTATION_UNVERIFIED'),{code:'V3_PRESENTATION_UNVERIFIED'});
    await rpc('dabbir_semantic_set_pending_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:version,p_action:'choose_slot',p_payload:{...payload,presented:true,provider_message_id:sent.providerMessageId}});await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'CHECK_AVAILABILITY',slots:slots.length,engine:'V3',response_source:V3_RESPONSE_SOURCE,legacy_dialogue_called:false};
  }
  await sendV3(response,action==='CLARIFY'?'v3-clarify':'v3-reply');await finish(claim,'PROCESSED');return {state:'PROCESSED',action,engine:'V3',response_source:V3_RESPONSE_SOURCE,legacy_dialogue_called:false};
}

export const _v3RuntimeTest={authorityProjection,authorityAction,deriveCurrentTurnAuthority,inheritedOperationalAction,executableReadIntent,approvedKnowledge,businessHoursReply,discoverAvailability,timeWindowRange,slotMatchesTimeWindow,metricsFor,preserveUnmappedService};
