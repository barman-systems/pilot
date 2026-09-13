const arr=v=>Array.isArray(v)?v:[];
export const V3_EPISODE_IDLE_MS=30*60*1000;
const OPERATIONAL_INTENTS=new Set(['BOOKING','SERVICE_DISCOVERY','PRICING','RESCHEDULE_BOOKING','CANCEL_BOOKING']);
const CONTINUATION_ROLES=new Set(['ANSWER_TO_PENDING_QUESTION','CONTINUATION','CORRECTION','CONFIRMATION','DENIAL','REFERENCE']);
const REQUEST_ACTIONS=new Set(['CHECK_AVAILABILITY','CREATE_BOOKING','RESCHEDULE_BOOKING','CANCEL_BOOKING']);

// Classify the speech act from the semantic proposal, never from greeting words.
// A greeting combined with a request/correction must still process that request.
export function isSocialOnlyTurnV3(proposal){
  return ['GREETING','SOCIAL'].includes(proposal?.dialogue?.message_role)
    && !proposal?.serviceName && !proposal?.serviceSurface
    && !arr(proposal?.entities).length && !arr(proposal?.dialogue?.invalidated_fields).length
    && !arr(proposal?.serviceQuestions).length && !proposal?.serviceQuestion
    && ['NONE','REPLY',''].includes(String(proposal?.action||'').toUpperCase());
}

const turnAt=(context,now)=>{
  const raw=context?.batch?.last_message_at||arr(context?.batch_messages).at(-1)?.created_at;
  const d=raw?new Date(raw):now instanceof Date?now:new Date(now||Date.now());
  return Number.isNaN(d.getTime())?new Date():d;
};
const pendingField=(previousState,canonicalState)=>previousState?.pending_question?.fields?.[0]||previousState?.pending_question?.field||canonicalState?.cognition?.pending_field||canonicalState?.clarification_entity||null;
const proposalFields=proposal=>{
  const fields=new Set(arr(proposal?.entities).map(x=>String(x?.entity||'').trim()).filter(Boolean));
  if(proposal?.serviceName)fields.add('service');
  return fields;
};
function carriesIndependentRequestEvidence({proposal,previousState,canonicalState}){
  const pending=pendingField(previousState,canonicalState),fields=proposalFields(proposal);
  const independentFields=[...fields].filter(field=>field!==pending);
  if(independentFields.some(field=>['service','date','time','delivery_mode','property_details','location'].includes(field)))return true;
  if(arr(proposal?.requestSpans).length>0)return true;
  return REQUEST_ACTIONS.has(String(proposal?.action||'').toUpperCase());
}

export function classifyEpisodeBoundaryV3({previousState=null,canonicalState=null,proposal=null,context=null,now=new Date()}){
  const at=turnAt(context,now),role=String(proposal?.dialogue?.message_role||'').toUpperCase(),intent=String(proposal?.intent||'').toUpperCase();
  const previousAtRaw=previousState?.last_operational_turn_at||previousState?.last_turn_at||canonicalState?.updated_at||canonicalState?.created_at||null;
  const previousAt=previousAtRaw?Date.parse(previousAtRaw):NaN;
  const idleMs=Number.isFinite(previousAt)?Math.max(0,at.getTime()-previousAt):null;
  const hasPrevious=!!(previousState||canonicalState?.goal||canonicalState?.intent||Object.keys(canonicalState?.entities||{}).length);
  if(!hasPrevious)return {kind:'NEW_EPISODE',reason:'FIRST_TURN',idle_ms:idleMs,at:at.toISOString()};
  const longIdle=idleMs==null||idleMs>V3_EPISODE_IDLE_MS;
  const operational=OPERATIONAL_INTENTS.has(intent);
  const independentEvidence=carriesIndependentRequestEvidence({proposal,previousState,canonicalState});
  // A clean provider-labelled NEW_REQUEST keeps the existing reason code so
  // observability remains stable.
  if(longIdle&&operational&&role==='NEW_REQUEST'){
    return {kind:'NEW_EPISODE',reason:'LONG_IDLE_COMPLETE_NEW_REQUEST',idle_ms:idleMs,at:at.toISOString()};
  }
  // Episode ownership must not be dictated by a stale pending question. After
  // a long idle gap, an operational turn that carries fresh request evidence
  // starts a new episode even if the semantic provider labels it as an answer
  // to the old pending field. This is exactly the production failure class
  // observed when a new "wash now" request inherited intent_confirmation.
  if(longIdle&&operational&&(role==='TOPIC_SWITCH'||independentEvidence)){
    return {kind:'NEW_EPISODE',reason:'LONG_IDLE_INDEPENDENT_REQUEST',idle_ms:idleMs,at:at.toISOString()};
  }
  if(CONTINUATION_ROLES.has(role))return {kind:'CONTINUE',reason:`SEMANTIC_${role}`,idle_ms:idleMs,at:at.toISOString()};
  // NEW_REQUEST denotes a new request even when both requests are bookings.
  // Only explicit continuation roles may silently reuse the active selection.
  if(role==='NEW_REQUEST'&&operational)return {kind:'NEW_EPISODE',reason:'EXPLICIT_NEW_REQUEST',idle_ms:idleMs,at:at.toISOString()};
  if(role==='NEW_REQUEST'&&previousState?.goal&&intent&&intent!==String(previousState.goal).replace(/^BOOK_SERVICE$/,'BOOKING')){
    return {kind:'NEW_EPISODE',reason:'EXPLICIT_NEW_GOAL',idle_ms:idleMs,at:at.toISOString()};
  }
  return {kind:'CONTINUE',reason:longIdle?'LONG_IDLE_BUT_NOT_NEW_REQUEST':'ACTIVE_EPISODE',idle_ms:idleMs,at:at.toISOString()};
}
