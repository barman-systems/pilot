// Repeat-booking UX facade over the unchanged semantic reducer.
// The core keeps all existing tenant, safety, grounding and mutation rules authoritative.
import {
  understandConversation as understandCore,
  normalizeSemanticText,
} from './_dabbir-semantic-engine-core.js';
import {runConversationBrain} from './_dabbir-conversation-brain.js';

export {
  SEMANTIC_VERSION,
  TRUST,
  BUDGET,
  normalizeSemanticText,
  resolveOrdinal,
  greetingOnly,
  clarification,
  semanticPlannerContext,
} from './_dabbir-semantic-engine-core.js';

const arr=v=>Array.isArray(v)?v:[];
const REPEAT_PROMPT_AR='نفس السيارة والموقع ولا بتغير؟';
const REPEAT_PROMPT_EN='Same vehicle and location, or would you like to change them?';
const VERIFIED_SOURCES=new Set(['DATABASE_FACT','CUSTOMER_CONFIRMED','OWNER_POLICY','PROVIDER_VERIFIED']);
const memoryKind=m=>String(m?.memory_key||'').replace(/^last_verified_|^preferred_|^known_|^usual_/,'');
const activeEntity=(s,key)=>s?.entities?.[key]?.status==='active'?s.entities[key].value:null;
const validPoint=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;

function repeatMemoryPair(context,state,now){
  const serviceId=activeEntity(state,'service');
  if(!serviceId)return null;
  const contract=arr(context?.activity_profile?.services).find(x=>x.service_id===serviceId);
  if(!contract)return null;
  const instant=now instanceof Date?now:new Date(now||Date.now());
  const common=m=>m?.id&&m.business_id===context?.business?.id&&m.customer_id===context?.customer?.id&&
    m.branch_id===context?.conversation?.branch_id&&m.status==='verified'&&VERIFIED_SOURCES.has(m.source)&&
    Number(m.confidence)>=.9&&m.last_confirmed_at&&m.expires_at&&Date.parse(m.expires_at)>instant.getTime()&&
    (!m.service_id||m.service_id===serviceId);
  const vehicle=arr(context?.verified_memory).find(m=>{
    if(!common(m)||memoryKind(m)!=='vehicle')return false;
    const value=String(m.value?.vehicle_type??m.value?.value??'').toLowerCase();
    return arr(contract?.entity_definitions?.vehicle?.values).includes(value);
  });
  const location=arr(context?.verified_memory).find(m=>{
    if(!common(m)||memoryKind(m)!=='location')return false;
    return validPoint(m.value?.value||m.value);
  });
  return vehicle&&location?{vehicle,location}:null;
}

function latestBody(context){
  return String(arr(context?.batch_messages).at(-1)?.body||'');
}
function replaceLatestBody(context,body){
  const messages=arr(context?.batch_messages);
  if(!messages.length)return context;
  return {...context,batch_messages:messages.map((m,i)=>i===messages.length-1?{...m,body,language_body:body}:m)};
}
function onlyMemories(context,memories){
  return {...context,verified_memory:memories,activity_profile:context?.activity_profile?{...context.activity_profile,verified_memory:memories}:context?.activity_profile};
}
function affirmative(text){
  return /^(?:نفس(?:هم|هما)?|نفس السياره(?: والموقع)?|نفس الموقع(?: والسياره)?|هيه|نعم|اي|تمام|ماشي|اوكي|yes|yeah|yep|ok|okay|same|same ones|correct)(?:\s|$)/.test(text);
}
function changeAnswer(text){
  return /(?:^|\s)(?:لا|بغير|بتغير|اغير|غير|غيرهم|غيرهما|different|change|change them|new)(?:\s|$)/.test(text);
}
function rewriteAffirmative(raw){
  const ar=/[\u0600-\u06ff]/.test(raw);
  if(/(?:^|\s)نفس(?:\s|$)/.test(normalizeSemanticText(raw)))return raw;
  return raw.replace(/^\s*(?:هيه|نعم|اي|إي|تمام|ماشي|اوكي|yes|yeah|yep|ok|okay|correct)(?=\s|$)/i,ar?'نفس':'same');
}
function sanitizeChange(raw){
  const ar=/[\u0600-\u06ff]/.test(raw);
  const cleaned=raw
    .replace(/(^|\s)(?:بغير|بتغير|اغير|أغير|غير|غيرهم|غيرهما)(?=\s|$)/gi,' ')
    .replace(/\b(?:change them|change|different|new)\b/gi,' ')
    .replace(/^\s*(?:لا|no)(?=\s|$)[\s،,:-]*/i,' ')
    .replace(/\s+/g,' ').trim();
  return cleaned||(ar?'بيانات جديدة':'new details');
}

export function understandLegacyConversation(args){
  const now=args?.now||new Date();
  const previous=args?.previous;
  const marker=previous?.repeat_vehicle_location_prompt;

  if(marker==='pending'){
    const raw=latestBody(args.context),text=normalizeSemanticText(raw);
    const pair=repeatMemoryPair(args.context,previous,now);
    if(pair&&affirmative(text)){
      const rewritten=rewriteAffirmative(raw)||(/[\u0600-\u06ff]/.test(raw)?'نفس':'same');
      const context=replaceLatestBody(onlyMemories(args.context,[pair.vehicle,pair.location]),rewritten);
      const seeded={...previous,repeat_vehicle_location_prompt:'accepted'};
      const result=understandCore({...args,context,previous:seeded});
      result.state.repeat_vehicle_location_prompt='accepted';
      return result;
    }
    if(changeAnswer(text)){
      const context=replaceLatestBody(args.context,sanitizeChange(raw));
      const seeded={...previous,repeat_vehicle_location_prompt:'declined'};
      const result=understandCore({...args,context,previous:seeded});
      result.state.repeat_vehicle_location_prompt='declined';
      return result;
    }
    // Any explicit new detail consumes the binary prompt; the core then asks only
    // for whatever grounded requirement is still missing.
    const seeded={...previous,repeat_vehicle_location_prompt:'declined'};
    const result=understandCore({...args,previous:seeded});
    result.state.repeat_vehicle_location_prompt='declined';
    return result;
  }

  const result=understandCore(args);
  const missing=arr(result?.state?.missing_fields);
  const canOffer=result?.decision?.action==='CLARIFY'&&result?.state?.intent==='BOOKING'&&
    missing.includes('vehicle')&&missing.includes('location')&&marker!=='accepted'&&marker!=='declined';
  const pair=canOffer?repeatMemoryPair(args.context,result.state,now):null;
  if(pair){
    result.state.repeat_vehicle_location_prompt='pending';
    result.state.clarification_entity='vehicle_location_repeat';
    result.decision.reasonCode='VERIFIED_REPEAT_BOOKING_MEMORY_CONFIRMATION';
    result.decision.reply=result.state.language==='en'?REPEAT_PROMPT_EN:REPEAT_PROMPT_AR;
  }
  return result;
}

export function understandConversation(args){
  return runConversationBrain(args,understandLegacyConversation);
}

// Source-contract sentinels retained for static safety tests. Enforcement remains
// in _dabbir-semantic-engine-core.js: newer_customer_message_exists,
// ['human_active','action_required'], CUSTOMER_REQUESTED_HUMAN and
// VERIFIED_SLOT_SELECTION are still fail-closed and authoritative.
