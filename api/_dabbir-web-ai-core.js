import {runConversationRuntimeTurn} from './_dabbir-conversation-runtime.js';
import {serviceRpc} from './_whatsapp-live-core.js';
import {bookingText,_aiFailureTest} from './_dabbir-whatsapp-ai-core.js';

const slotsText=_aiFailureTest.slotsText;
const clean=(v,max=4000)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const one=v=>Array.isArray(v)?v[0]??null:v??null;

async function finish(claim,outcome,error=null){
  return serviceRpc('dabbir_whatsapp_ai_finish_batch',{
    p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_outcome:outcome,p_error:error,
  });
}

async function deliver(claim,context,body,purpose='reply'){
  if(context?.conversation?.channel_type!=='web')throw Object.assign(new Error('WEB_AI_DELIVERY_CHANNEL_INVALID'),{code:'WEB_AI_DELIVERY_CHANNEL_INVALID'});
  if(!claim?.semantic_version)throw Object.assign(new Error('WEB_AI_SEMANTIC_VERSION_REQUIRED'),{code:'WEB_AI_SEMANTIC_VERSION_REQUIRED'});
  const row=one(await serviceRpc('dabbir_semantic_deliver_web_v1',{
    p_batch_id:claim.batch_id,
    p_lock_token:claim.lock_token,
    p_version:claim.semantic_version,
    p_purpose:clean(purpose,80)||'reply',
    p_body:String(body??'').trim().slice(0,4000),
  }));
  if(!row?.provider_message_id||!row?.message?.id)throw Object.assign(new Error('WEB_AI_DELIVERY_UNVERIFIED'),{code:'WEB_AI_DELIVERY_UNVERIFIED'});
  return {providerMessageId:String(row.provider_message_id),message:row.message,state:row.state||'PERSISTED'};
}

async function handoff(context,reason,summary,route='SUPPORT'){
  return serviceRpc('dabbir_ai_handoff',{
    p_business_id:context.business.id,p_conversation_id:context.conversation.id,
    p_route_class:route,p_reason:clean(reason,500),p_summary:clean(summary,1200),
  });
}

export async function processClaimedWebAiBatch(claim,{rpc=serviceRpc,logger=console}={}){
  const delivered=[];
  try{
    const context=await rpc('dabbir_ai_context',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token});
    if(!context?.business?.id||!context?.conversation?.id||context.conversation.channel_type!=='web'){
      throw Object.assign(new Error('AI_CONTEXT_UNVERIFIED'),{code:'AI_CONTEXT_UNVERIFIED'});
    }
    const result=await runConversationRuntimeTurn({
      claim,context,rpc,
      deliver:async(...args)=>{const sent=await deliver(...args);delivered.push(sent.message);return sent;},
      finish,handoff,bookingText,slotsText,
      resolveProduct:()=>null,
      // Web has no Meta catalog/flow transport. Conversation Brain renders the grounded text fallback.
      deliverMenu:async()=>null,
      logger,
    });
    return {...result,ai_message:delivered.at(-1)||null,delivered_messages:delivered};
  }catch(error){
    const code=clean(error?.code||error?.message||'WEB_AI_BATCH_FAILED',240);
    await finish(claim,'CANCELLED',code).catch(()=>null);
    error.code=code;
    throw error;
  }
}

export const _webAiCoreTest={deliver};
