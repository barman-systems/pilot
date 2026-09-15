import {generateDABBIRAiReply} from './_dabbir-whatsapp-ai-meter.js';
import {V3_SEMANTIC_JSON_SCHEMA} from './_dabbir-conversation-v3-semantic-contract.js';

const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=500)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,n);
const norm=v=>clean(v,300).normalize('NFKD').replace(/[\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const INTENTS=new Set(['SUPPORT','SERVICE_DISCOVERY','PRICING','BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING','HUMAN_ASSISTANCE','UNKNOWN']);
const ROLES=new Set(['GREETING','NEW_REQUEST','ANSWER_TO_PENDING_QUESTION','CORRECTION','CONFIRMATION','DENIAL','SIDE_QUESTION','TOPIC_SWITCH','CONTINUATION','CANCELLATION','REFERENCE','SOCIAL']);
const ACTIONS=new Set(['NONE','SERVICE_MENU','CHECK_AVAILABILITY','CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING','HANDOFF']);
const TIME_WINDOWS=new Set(['EARLY_MORNING','MORNING','AFTERNOON','EVENING','NIGHT']);
const ENTITIES=new Set(['vehicle','date','time','time_window','immediacy','delivery_mode','property_details']);
const SIDE_QUESTIONS=new Set(['price','duration_minutes','availability','business_hours']);
const CONFIRM_RE=/^(?:هي|هيه|ايوه|ايوا|نعم|تمام|صح|yes|yeah|yep|ok|okay|correct)$/i;
const DENY_RE=/^(?:لا|مب|مو|لا لا|no|nope)$/i;
const ORDINAL_RE=/^(?:الخيار\s*)?(\d{1,2})$/u;
const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';
const V3_PROVIDER_MAX_REQUESTS=4;
const V3_PROVIDER_TOTAL_TIMEOUT_MS=18_000;
const V3_GATEWAY_MODEL='openai/gpt-5.6-luna';

function scopedServices(context){return arr(context?.services).filter(s=>(!s?.business_id||s.business_id===context?.business?.id)&&(!s?.branch_id||s.branch_id===context?.conversation?.branch_id));}
function currentMessage(context){return arr(context?.batch_messages).at(-1)||null;}
function currentText(context){return arr(context?.batch_messages).map(m=>String(m?.language_body??m?.body??'')).filter(Boolean).join(' ').trim();}
function serviceLabel(s){return clean(s?.name_ar||s?.name||s?.name_en,120);}
function serviceByLabel(context,label){const wanted=norm(label);if(!wanted)return null;const hits=scopedServices(context).filter(s=>[s?.name_ar,s?.name,s?.name_en].some(x=>norm(x)===wanted));return hits.length===1?hits[0]:null;}
function serviceExactFromMessage(context,raw){const wanted=norm(raw);if(!wanted)return null;const hits=scopedServices(context).filter(s=>[s?.name_ar,s?.name,s?.name_en].some(x=>norm(x)===wanted));return hits.length===1?hits[0]:null;}
function exactSurface(raw,surface){const s=clean(surface,240);return !!s&&raw.includes(s);}
function finite01(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;}
function parseJsonOnly(raw){const text=String(raw??'').trim();if(!text.startsWith('{')||!text.endsWith('}')||text.length>12000)return null;try{return JSON.parse(text)}catch{return null}}
function normalizeModelContract(x){
  if(!x||Array.isArray(x)||typeof x!=='object')return x;
  return {...x,service_candidate:x.service_candidate??null,entities:x.entities??[],side_questions:x.side_questions??[],invalidated_fields:x.invalidated_fields??[],requested_action:x.requested_action??'NONE',confirmation:x.confirmation??null};
}
function validModelContract(x,raw){
  if(!x||Array.isArray(x)||!INTENTS.has(x.intent)||!ROLES.has(x.role)||!ACTIONS.has(x.requested_action)||!finite01(x.confidence))return false;
  if(!Array.isArray(x.entities)||x.entities.length>12||!Array.isArray(x.side_questions)||x.side_questions.length>4||!Array.isArray(x.invalidated_fields)||x.invalidated_fields.length>10)return false;
  if(x.service_candidate!=null){const s=x.service_candidate;if(typeof s!=='object'||Array.isArray(s)||!(s.label===null||typeof s.label==='string')||!(s.surface===null||typeof s.surface==='string')||!finite01(s.confidence))return false;if(s.surface!=null&&!exactSurface(raw,s.surface))return false;}
  if(!x.entities.every(e=>e&&ENTITIES.has(e.entity)&&typeof e.value==='string'&&typeof e.surface==='string'&&exactSurface(raw,e.surface)&&finite01(e.confidence)&&typeof e.correction==='boolean'&&(e.entity!=='time_window'||TIME_WINDOWS.has(e.value))&&(e.entity!=='immediacy'||e.value==='NOW')))return false;
  if(!x.side_questions.every(q=>q&&SIDE_QUESTIONS.has(q.type)&&typeof q.surface==='string'&&exactSurface(raw,q.surface)))return false;
  if(!x.invalidated_fields.every(f=>['service','vehicle','date','time','time_window','immediacy','delivery_mode','property_details','location','slot'].includes(f)))return false;
  return x.confirmation===null||typeof x.confirmation==='boolean';
}
function previousSummary(previousState){
  const facts=arr(previousState?.facts).filter(f=>f?.status==='VERIFIED').slice(0,12).map(f=>({field:f.field,value:typeof f.value==='string'||typeof f.value==='number'?f.value:null}));
  return {goal:previousState?.goal||'UNKNOWN',intent_confirmed:previousState?.intent_confirmed===true,last_operational_turn_at:previousState?.last_operational_turn_at||previousState?.last_turn_at||null,evidence_invalidations:arr(previousState?.evidence_invalidations).map(x=>({field:x.field,reason:x.reason})),pending:previousState?.pending_question?{fields:arr(previousState.pending_question.fields),purpose:previousState.pending_question.purpose||null,options:arr(previousState.pending_question.options).map(o=>({type:o.type,label:o.label||null}))}:null,facts,tentatives:arr(previousState?.tentatives).slice(0,6).map(t=>({field:t.field,candidate_value:t.candidate_value??null,surface:t.surface||null}))};
}
function activitySummary(context){return arr(context?.activity_profile?.services).slice(0,10).map(c=>({service_label:serviceLabel(scopedServices(context).find(s=>s.id===c.service_id)),delivery_modes:arr(c.delivery_modes),booking_model:c.booking_model||c.operating_model||null,entity_definitions:c.entity_definitions||{}}));}
function providerContext(context,previousState,referenceTime){return {reference_time:referenceTime,business_timezone:context?.business?.timezone||'Asia/Dubai',activity_type:context?.business?.business_type||null,catalog:scopedServices(context).slice(0,10).map(s=>({label:serviceLabel(s),price:Number.isFinite(Number(s.price))?Number(s.price):null,duration_minutes:Number.isFinite(Number(s.duration_minutes??s.duration))?Number(s.duration_minutes??s.duration):null})),activity_contracts:activitySummary(context),previous:previousSummary(previousState)};}
function roleHistory(context){return arr(context?.history||context?.recent_conversation).slice(-4).flatMap(item=>{const sender=String(item?.sender_type??item?.role??'').toLowerCase(),content=clean(item?.body??item?.content,500);if(!content)return[];return [{role:sender==='ai'||sender==='assistant'||sender==='human'?'assistant':'user',content}]});}
function localDateTime(referenceTime,timezone){
  const at=new Date(referenceTime);if(Number.isNaN(at.getTime()))return null;
  try{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};}catch{return null}
}
function groundImmediateEntities(entities,context,referenceTime){
  const rows=arr(entities),immediate=rows.find(e=>e?.entity==='immediacy'&&e?.value==='NOW');if(!immediate)return rows;
  const conflicting=rows.some(e=>['date','time','time_window'].includes(e?.entity));if(conflicting)return rows.filter(e=>e?.entity!=='immediacy');
  const parts=localDateTime(referenceTime,context?.business?.timezone);if(!parts)return rows.filter(e=>e?.entity!=='immediacy');
  const base={surface:immediate.surface,confidence:immediate.confidence,correction:immediate.correction};
  return [...rows.filter(e=>e?.entity!=='immediacy'),{entity:'date',value:parts.date,...base},{entity:'time',value:parts.time,...base}];
}
function proposalBase({intent='BOOKING',role='ANSWER_TO_PENDING_QUESTION',confidence=1,serviceName=null,serviceSurface=null,serviceVerified=false,action='REPLY',invalidated_fields=[]}={}){return {intent,action,confidence,serviceName,serviceSurface,serviceVerified,entities:[],serviceQuestion:null,serviceQuestions:[],dialogue:{message_role:role,evidence:serviceSurface,invalidated_fields}};}
function fastPath({context,previousState,raw}){
  const msg=currentMessage(context),trimmed=clean(raw,200),fastFacts=[];
  const receipt=arr(context?.location_receipts).find(r=>r?.message_id===msg?.id&&(!r?.business_id||r.business_id===context?.business?.id)&&(!r?.conversation_id||r.conversation_id===context?.conversation?.id));
  if(receipt&&Number.isFinite(Number(receipt?.value?.lat??receipt?.latitude))&&Number.isFinite(Number(receipt?.value?.lng??receipt?.longitude))){const value=receipt.value&&typeof receipt.value==='object'?receipt.value:{lat:Number(receipt.latitude),lng:Number(receipt.longitude),label:receipt.label||null};fastFacts.push({field:'location',value,source:'PROVIDER_VERIFIED',resolution:'SIGNED_WHATSAPP_LOCATION',confidence:1,receipt_id:receipt.message_id});}
  const pending=previousState?.pending_question||null;
  if(['CONFIRM_TENTATIVE_VEHICLE','CONFIRM_TENTATIVE_SERVICE'].includes(pending?.purpose)&&CONFIRM_RE.test(trimmed))return {proposal:proposalBase({role:'CONFIRMATION',serviceSurface:trimmed}),fastFacts};
  if(pending&&DENY_RE.test(trimmed))return {proposal:proposalBase({intent:previousState?.goal==='BOOK_SERVICE'?'BOOKING':'SUPPORT',role:'DENIAL',serviceSurface:trimmed}),fastFacts};
  const ordinal=trimmed.match(ORDINAL_RE);
  if(ordinal&&arr(pending?.options).length){const option=pending.options[Number(ordinal[1])-1];if(option?.type==='service'&&option.label)return {proposal:proposalBase({serviceName:option.label,serviceSurface:trimmed,serviceVerified:true}),fastFacts};}
  const exact=serviceExactFromMessage(context,trimmed);if(exact&&pending?.fields?.includes('service'))return {proposal:proposalBase({serviceName:serviceLabel(exact),serviceSurface:trimmed,serviceVerified:true}),fastFacts};
  const p=context?.pending_state,payload=p?.payload||{};
  if(ordinal&&p?.pending_action==='choose_slot'&&payload.presented===true&&arr(payload.slots).length>=Number(ordinal[1])){const index=Number(ordinal[1])-1,slot=payload.slots[index];fastFacts.push({field:'slot',value:index,source:'CUSTOMER_CONFIRMED',resolution:'PRESENTED_SLOT_SELECTION',confidence:1,starts_at:slot?.starts_at||null,service_id:slot?.service_id||null,worker_id:slot?.worker_id||null});return {proposal:proposalBase({intent:previousState?.goal==='RESCHEDULE_BOOKING'?'RESCHEDULE_BOOKING':'BOOKING',action:previousState?.goal==='RESCHEDULE_BOOKING'?'RESCHEDULE_BOOKING':'CREATE_BOOKING',serviceSurface:trimmed}),fastFacts};}
  if(fastFacts.some(f=>f.field==='location')&&previousState?.goal==='BOOK_SERVICE')return {proposal:proposalBase({role:'CONTINUATION',serviceSurface:null}),fastFacts};
  return {proposal:null,fastFacts};
}

function v3SemanticEnv(env){
  const source=env&&typeof env==='object'?env:process.env;
  if(!source.VERCEL_ENV&&!source.AI_GATEWAY_API_KEY&&!source.VERCEL_OIDC_TOKEN)return source;
  return {...source,DABBIR_AI_GATEWAY_MODEL:String(source.DABBIR_V3_AI_GATEWAY_MODEL||V3_GATEWAY_MODEL)};
}
function v3GatewayStructuredOptions(url,options={}){
  if(String(url)!==GATEWAY_ENDPOINT||!options.body)return options;
  try{
    const body=JSON.parse(String(options.body));
    if(body?.response_format?.type==='json_object'){
      body.response_format={type:'json_schema',json_schema:{name:'dabbir_v3_interpretation',strict:true,schema:V3_SEMANTIC_JSON_SCHEMA}};
      return {...options,body:JSON.stringify(body)};
    }
  }catch{}
  return options;
}
function createV3ProviderFetch({fetchImpl=fetch,env=process.env,now=Date.now}={}){
  const deadline=now()+V3_PROVIDER_TOTAL_TIMEOUT_MS;let attempts=0;
  return async(url,options={})=>{
    const remaining=deadline-now();
    if(attempts>=V3_PROVIDER_MAX_REQUESTS||remaining<=0)throw Object.assign(new Error('SEMANTIC_PROVIDER_BUDGET'),{code:'SEMANTIC_PROVIDER_BUDGET'});
    attempts++;
    const nextOptions=v3GatewayStructuredOptions(url,options);
    const timeoutSignal=AbortSignal.timeout(Math.max(1,remaining));
    return fetchImpl(url,{...nextOptions,signal:nextOptions.signal?AbortSignal.any([timeoutSignal,nextOptions.signal]):timeoutSignal});
  };
}

export async function interpretConversationTurnV3({context,previousState=null,generate=generateDABBIRAiReply,now=new Date(),env=process.env,fetchImpl=fetch}){
  const raw=currentText(context),msg=currentMessage(context),referenceTime=msg?.created_at||context?.batch?.last_message_at||(now instanceof Date?now.toISOString():String(now));
  const fast=fastPath({context,previousState,raw});if(fast.proposal)return {...fast,provider:'deterministic-v3-fast-path',model:null,telemetry:null};
  const providerEnv=v3SemanticEnv(env),providerFetch=createV3ProviderFetch({fetchImpl,env:providerEnv});
  const result=await generate({project:'dabbir_businesses',semantic:'v3',language:'auto',message:clean(raw,2000),businessContext:JSON.stringify(providerContext(context,previousState,referenceTime)),history:roleHistory(context),meteringContext:{business:{id:context?.business?.id},conversation:{id:context?.conversation?.id},batch_message_created_at:referenceTime},env:providerEnv,fetchImpl:providerFetch});
  if(!result?.ok)throw Object.assign(new Error('V3_INTERPRETER_UNAVAILABLE'),{code:'V3_INTERPRETER_UNAVAILABLE',telemetry:result?.telemetry||null});
  const x=normalizeModelContract(parseJsonOnly(result.reply));if(!validModelContract(x,raw))throw Object.assign(new Error('V3_INTERPRETER_CONTRACT_INVALID'),{code:'V3_INTERPRETER_CONTRACT_INVALID',telemetry:result.telemetry||null});
  let serviceName=null;if(x.service_candidate?.label&&x.service_candidate?.surface&&x.service_candidate.confidence>=.65){const s=serviceByLabel(context,x.service_candidate.label);if(s)serviceName=serviceLabel(s);}
  const entities=groundImmediateEntities(x.entities,context,referenceTime).map(e=>({entity:e.entity,value:e.value,evidence:e.surface,confidence:e.confidence,correction:e.correction}));
  const serviceQuestion=x.side_questions.find(q=>q.type==='price'||q.type==='duration_minutes')||null;
  const semanticServiceSurface=x.service_candidate?.label?x.service_candidate?.surface:null;
  const serviceQuestions=x.side_questions.map(q=>({field:q.type,evidence:q.surface}));
  const proposal={intent:x.intent==='UNKNOWN'?'SUPPORT':x.intent,action:x.requested_action==='NONE'?'REPLY':x.requested_action,confidence:x.confidence,serviceName,serviceSurface:semanticServiceSurface,serviceCandidateLabel:x.service_candidate?.label||null,serviceVerified:false,entities,
    serviceQuestion:serviceQuestion?{field:serviceQuestion.type,evidence:serviceQuestion.surface}:null,serviceQuestions,dialogue:{message_role:x.role,evidence:clean(raw,300),invalidated_fields:x.invalidated_fields},requestSpans:[],contextReference:null};
  return {proposal,fastFacts:fast.fastFacts,provider:result.provider,model:result.model,telemetry:result.telemetry||null,raw_interpretation:{intent:x.intent,role:x.role,service_candidate_label:x.service_candidate?.label||null,requested_action:x.requested_action,side_questions:x.side_questions.map(q=>q.type)}};
}

export const _v3InterpreterTest={norm,serviceByLabel,serviceExactFromMessage,normalizeModelContract,validModelContract,fastPath,providerContext,localDateTime,groundImmediateEntities,v3SemanticEnv,v3GatewayStructuredOptions,createV3ProviderFetch,V3_PROVIDER_MAX_REQUESTS,V3_GATEWAY_MODEL};
