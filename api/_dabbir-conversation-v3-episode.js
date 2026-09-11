const arr=v=>Array.isArray(v)?v:[];
export const V3_EPISODE_IDLE_MS=30*60*1000;
const OPERATIONAL_INTENTS=new Set(['BOOKING','SERVICE_DISCOVERY','PRICING','RESCHEDULE_BOOKING','CANCEL_BOOKING']);
const CONTINUATION_ROLES=new Set(['ANSWER_TO_PENDING_QUESTION','CONTINUATION','CORRECTION']);

const turnAt=(context,now)=>{
  const raw=context?.batch?.last_message_at||arr(context?.batch_messages).at(-1)?.created_at;
  const d=raw?new Date(raw):now instanceof Date?now:new Date(now||Date.now());
  return Number.isNaN(d.getTime())?new Date():d;
};

export function classifyEpisodeBoundaryV3({previousState=null,canonicalState=null,proposal=null,context=null,now=new Date()}){
  const at=turnAt(context,now),role=String(proposal?.dialogue?.message_role||'').toUpperCase(),intent=String(proposal?.intent||'').toUpperCase();
  const previousAtRaw=previousState?.last_turn_at||canonicalState?.updated_at||canonicalState?.created_at||null;
  const previousAt=previousAtRaw?Date.parse(previousAtRaw):NaN;
  const idleMs=Number.isFinite(previousAt)?Math.max(0,at.getTime()-previousAt):null;
  const hasPrevious=!!(previousState||canonicalState?.goal||canonicalState?.intent||Object.keys(canonicalState?.entities||{}).length);
  if(!hasPrevious)return {kind:'NEW_EPISODE',reason:'FIRST_TURN',idle_ms:idleMs,at:at.toISOString()};
  if(CONTINUATION_ROLES.has(role))return {kind:'CONTINUE',reason:`SEMANTIC_${role}`,idle_ms:idleMs,at:at.toISOString()};
  const longIdle=idleMs==null||idleMs>V3_EPISODE_IDLE_MS;
  const completeNewRequest=role==='NEW_REQUEST'&&OPERATIONAL_INTENTS.has(intent);
  if(longIdle&&completeNewRequest)return {kind:'NEW_EPISODE',reason:'LONG_IDLE_COMPLETE_NEW_REQUEST',idle_ms:idleMs,at:at.toISOString()};
  if(role==='NEW_REQUEST'&&previousState?.goal&&intent&&intent!==String(previousState.goal).replace(/^BOOK_SERVICE$/,'BOOKING')){
    return {kind:'NEW_EPISODE',reason:'EXPLICIT_NEW_GOAL',idle_ms:idleMs,at:at.toISOString()};
  }
  return {kind:'CONTINUE',reason:longIdle?'LONG_IDLE_BUT_NOT_NEW_REQUEST':'ACTIVE_EPISODE',idle_ms:idleMs,at:at.toISOString()};
}
