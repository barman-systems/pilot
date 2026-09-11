import {assertFactRetentionV3,V3_FACT_STATUSES,safeV3ShadowError} from './_dabbir-conversation-v3-invariants.js';

const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=500)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,n);
const allowedStatus=new Set(V3_FACT_STATUSES);
const STRONG_SOURCES=new Set(['DATABASE_FACT','CUSTOMER_STATED','CUSTOMER_CONFIRMED','CUSTOMER_CORRECTION','CUSTOMER_MEMORY','OWNER_POLICY','VERIFIED_BUSINESS_KNOWLEDGE','PROVIDER_VERIFIED']);
const SUMMARY_FIELDS=new Set(['service','delivery_mode','immediacy','vehicle','date','time']);

const currentText=context=>arr(context?.batch_messages).map(m=>String(m?.language_body??m?.body??'')).filter(Boolean).join(' ').trim();
const currentMessage=context=>arr(context?.batch_messages).at(-1)||null;
const activeCanonical=(state,key)=>state?.entities?.[key]?.status==='active'?state.entities[key]:null;
const scopedContract=(context,state)=>arr(context?.activity_profile?.services).find(x=>x.service_id===state?.entities?.service?.value&&x.business_id===context?.business?.id&&x.branch_id===context?.conversation?.branch_id)||null;
const fieldDefinition=(context,state,field)=>scopedContract(context,state)?.entity_definitions?.[field]||null;
const factId=(field,surface,value)=>`${field}:${clean(surface,120)}:${JSON.stringify(value)}`;

function canonicalFact(field,fact){
  if(!fact||fact.status!=='active'||fact.value==null||fact.value==='')return null;
  const status=STRONG_SOURCES.has(fact.source)&&Number(fact.confidence)>=.9?'VERIFIED':'TENTATIVE';
  return {field,status,value:fact.value,surface:null,source:fact.source||null,confidence:Number(fact.confidence)||0,resolution:'CANONICAL_STATE',invalidation_reason:null};
}

export function snapshotFromCanonicalV3(state){
  const facts=Object.entries(state?.entities||{}).map(([field,f])=>canonicalFact(field,f)).filter(Boolean);
  return {version:1,facts,invalidations:[],turn:{text:null,message_id:null,created_at:null},signals:{},errors:[]};
}

function proposalCandidates({proposal,context,state}){
  const raw=currentText(context),definitionCache=new Map();
  const getDef=field=>{if(!definitionCache.has(field))definitionCache.set(field,fieldDefinition(context,state,field));return definitionCache.get(field);};
  return arr(proposal?.entities).slice(0,12).flatMap(item=>{
    const field=clean(item?.entity,80),surface=clean(item?.evidence,300),value=item?.value;
    if(!field||!surface||!raw.includes(surface))return [];
    const def=getDef(field);
    let mappingAllowed=false;
    if(def?.type==='ENUM'&&Array.isArray(def.values))mappingAllowed=def.values.includes(value);
    else if(['DATE','TIME','TEXT'].includes(def?.type))mappingAllowed=true;
    return [{field,status:mappingAllowed?'TENTATIVE':'CONFLICT',value:mappingAllowed?value:null,candidate_value:value,surface,source:'SEMANTIC_PROPOSAL',confidence:Number(item?.confidence)||0,resolution:mappingAllowed?'ALLOWED_VALUE_NEEDS_GROUNDING':'OUTSIDE_ENTITY_DEFINITION',invalidation_reason:null}];
  });
}

function pendingSurfaceCandidate({context,previous,state,proposal,proposalFacts}){
  const field=previous?.cognition?.pending_field||previous?.clarification_entity||null;
  const surface=clean(currentText(context),300);
  if(!field||!surface||proposalFacts.some(f=>f.field===field))return null;
  const def=fieldDefinition(context,state,field);
  if(!def)return null;
  const sideRole=proposal?.dialogue?.message_role;
  if(['SIDE_QUESTION','SOCIAL','TOPIC_SWITCH','CANCELLATION'].includes(sideRole))return null;
  return {field,status:'TENTATIVE',value:null,candidate_value:null,surface,source:'CURRENT_TURN_SURFACE',confidence:Number(proposal?.confidence)||0,resolution:'SEMANTIC_SURFACE_UNMAPPED',invalidation_reason:null};
}

function authoritativeDelta({beforeState,afterState,context}){
  const result=[];
  for(const [field,after] of Object.entries(afterState?.entities||{})){
    if(!after||after.status!=='active'||!STRONG_SOURCES.has(after.source)||Number(after.confidence)<.9)continue;
    const before=beforeState?.entities?.[field];
    if(before?.status==='active'&&JSON.stringify(before.value)===JSON.stringify(after.value)&&before.source===after.source)continue;
    result.push({field,status:'VERIFIED',value:after.value,surface:null,source:after.source,confidence:Number(after.confidence)||1,resolution:after.grounded_by||'AUTHORITATIVE_STATE_DELTA',invalidation_reason:null});
  }
  const date=activeCanonical(afterState,'date'),time=activeCanonical(afterState,'time');
  if(date?.grounded_by==='MESSAGE_RECEIPT_TIME'&&time?.grounded_by==='MESSAGE_RECEIPT_TIME'){
    result.push({field:'immediacy',status:'VERIFIED',value:'NOW',surface:currentText(context),source:'CUSTOMER_STATED',confidence:1,resolution:'MESSAGE_RECEIPT_TIME',invalidation_reason:null});
  }
  return result;
}

function explicitInvalidations({beforeState,afterState}){
  const reasons=[];
  for(const [field,before] of Object.entries(beforeState?.entities||{})){
    if(!before||before.status!=='active'||!STRONG_SOURCES.has(before.source)||Number(before.confidence)<.9)continue;
    const after=afterState?.entities?.[field];
    if(after?.status==='active'&&JSON.stringify(after.value)===JSON.stringify(before.value))continue;
    const correction=arr(afterState?.user_corrections).find(x=>x?.entity===field);
    const reason=correction?'CUSTOMER_CORRECTION':after?.status==='unresolved'?'EXPLICIT_UNRESOLVED':null;
    if(reason)reasons.push({field,reason});
  }
  return reasons;
}

function mergeFacts(base,candidates,invalidations){
  const invalidated=new Set(arr(invalidations).map(x=>x?.field).filter(Boolean));
  const map=new Map(base.filter(f=>!invalidated.has(f.field)).map(f=>[f.field,{...f}]));
  const tentative=[];
  for(const f of candidates){
    if(!f||!f.field||!allowedStatus.has(f.status))continue;
    const existing=map.get(f.field);
    if(f.status==='VERIFIED')map.set(f.field,{...f});
    else if(!existing||existing.status!=='VERIFIED'){
      tentative.push({...f,id:factId(f.field,f.surface,f.value)});
      if(!existing)map.set(f.field,{...f});
    }
  }
  return {facts:[...map.values()],tentative};
}

export function buildTurnUnderstandingV3({context,previousState,legacyState,proposal,now=new Date()}){
  const before=snapshotFromCanonicalV3(previousState||{});
  const semantic=proposalCandidates({proposal,context,state:legacyState||previousState||{}});
  const pending=pendingSurfaceCandidate({context,previous:previousState,state:legacyState||previousState||{},proposal,proposalFacts:semantic});
  const authoritative=authoritativeDelta({beforeState:previousState||{},afterState:legacyState||{},context});
  const invalidations=explicitInvalidations({beforeState:previousState||{},afterState:legacyState||{}});
  const {facts,tentative}=mergeFacts(before.facts,[...semantic,...(pending?[pending]:[]),...authoritative],invalidations);
  const msg=currentMessage(context);
  const snapshot={version:1,turn:{text:clean(currentText(context),1000),message_id:msg?.id||null,created_at:msg?.created_at||now.toISOString()},facts,tentative,invalidations,
    signals:{goal:legacyState?.goal||previousState?.goal||'UNKNOWN',message_role:proposal?.dialogue?.message_role||null,service_id:legacyState?.entities?.service?.value||null,delivery_mode:legacyState?.entities?.delivery_mode?.value||null},errors:[]};
  assertFactRetentionV3({before,after:snapshot});
  return snapshot;
}

export function runTurnUnderstandingShadowV3(args){
  try{return {ok:true,snapshot:buildTurnUnderstandingV3(args),error:null};}
  catch(error){return {ok:false,snapshot:null,error:safeV3ShadowError(error)};}
}

const safeSummaryValue=value=>typeof value==='string'||typeof value==='number'||typeof value==='boolean'?value:null;
export function v3ShadowSummary(result){
  if(!result?.ok)return {ok:false,retention_ok:false,error:result?.error||{code:'V3_SHADOW_ERROR'}};
  const snapshot=result.snapshot;
  return {ok:true,retention_ok:true,version:snapshot.version,turn_message_id:snapshot.turn.message_id,
    facts:snapshot.facts.filter(f=>SUMMARY_FIELDS.has(f.field)).map(f=>({field:f.field,status:f.status,value:safeSummaryValue(f.value),source:f.source,resolution:f.resolution})),
    tentative:snapshot.tentative.map(f=>({field:f.field,candidate_value:safeSummaryValue(f.candidate_value),resolution:f.resolution})),
    invalidations:snapshot.invalidations.map(x=>({field:x.field,reason:x.reason}))};
}
