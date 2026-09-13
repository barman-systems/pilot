import {classifyEpisodeBoundaryV3} from './_dabbir-conversation-v3-episode.js';
import {seedConversationStateV3,freshConversationStateV3,understandTurnV3} from './_dabbir-conversation-v3-understanding.js';
import {planConversationTurnV3} from './_dabbir-conversation-v3-brain.js';
import {safeV3ShadowError} from './_dabbir-conversation-v3-invariants.js';
const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=160)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,n);

export function runConversationV3Shadow({context,canonicalState,previousShadow,proposal,now=new Date()}){
  try{
    const seeded=seedConversationStateV3({previousShadow,canonicalState});
    const episode=classifyEpisodeBoundaryV3({previousState:previousShadow,canonicalState,proposal,context,now});
    const atRaw=context?.batch?.last_message_at||arr(context?.batch_messages).at(-1)?.created_at;
    const at=atRaw?new Date(atRaw):now instanceof Date?now:new Date(now);
    const base=episode.kind==='NEW_EPISODE'?freshConversationStateV3({context,at:Number.isNaN(at.getTime())?new Date():at}):seeded;
    const understanding=understandTurnV3({context,proposal,previousState:base,now});
    const result=planConversationTurnV3({previousState:base,understanding,episode,context});
    const serialized=JSON.stringify(result.state);
    if(Buffer.byteLength(serialized,'utf8')>8192)throw Object.assign(new Error('V3_SHADOW_STATE_TOO_LARGE'),{code:'V3_SHADOW_STATE_TOO_LARGE'});
    return {ok:true,episode,understanding,...result};
  }catch(error){return {ok:false,error:safeV3ShadowError(error)};}
}

export function v3DialogueShadowSummary(result,legacyState=null){
  if(!result?.ok)return {ok:false,error:result?.error||{code:'V3_DIALOGUE_SHADOW_ERROR'}};
  const state=result.state,plan=result.plan,response=result.response;
  return {ok:true,episode:{kind:result.episode.kind,reason:result.episode.reason,idle_ms:result.episode.idle_ms},goal:state.goal,intent_confirmed:state.intent_confirmed,
    facts:arr(state.facts).filter(f=>['service','delivery_mode','immediacy','vehicle','date','time','location'].includes(f.field)).map(f=>({field:f.field,status:f.status,value:typeof f.value==='string'||typeof f.value==='number'||typeof f.value==='boolean'?f.value:null,source:f.source,resolution:f.resolution})),
    tentatives:arr(state.tentatives).map(f=>({field:f.field,candidate_value:typeof f.candidate_value==='string'?f.candidate_value:null,resolution:f.resolution})),
    missing_fields:plan.missing_fields,next_question:plan.next_question?{fields:plan.next_question.fields,purpose:plan.next_question.purpose}:null,
    response:{source:response.source,text:clean(response.text,800)},legacy:{reply:clean(legacyState?.cognition?.decision?.reply,800)||null,reason_code:clean(legacyState?.cognition?.decision?.reasonCode,120)||null,pending_field:clean(legacyState?.cognition?.pending_field,80)||null}};
}
