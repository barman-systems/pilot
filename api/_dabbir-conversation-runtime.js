import {interpretSemanticMessage} from './_dabbir-semantic-interpreter.js';
import {retrieveDabbirKnowledge} from './_dabbir-knowledge-rag.js';
import {runUnderstandingTurn} from './_dabbir-understanding-orchestrator.js';
import {createV3ShadowObserver} from './_dabbir-v3-shadow-observer.js';
import {runConversationV3Runtime} from './_dabbir-conversation-v3-runtime.js';

const clean=(v,max=4000)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const arr=v=>Array.isArray(v)?v:[];
const latestText=context=>arr(context?.batch_messages).map(x=>clean(x?.body,1500)).filter(Boolean).join('\n').slice(0,2500);

export const conversationEngineForMode=mode=>mode==='canary'||mode==='active'?'V3':'LEGACY';

// Canonical conversation composition boundary.
// Channels own transport only. This module owns engine selection and composition.
// shadow/off are legacy-visible with V3 observation; canary/active are real V3.
export async function runConversationRuntimeTurn({claim,context,rpc,deliver,finish,handoff,bookingText,slotsText,resolveProduct,deliverMenu,logger=console}){
  const routingLoad=await rpc('dabbir_semantic_load_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token});
  const mode=routingLoad?.cognitive_policy?.mode||'shadow';
  if(conversationEngineForMode(mode)==='V3'){
    return runConversationV3Runtime({claim,context,rpc,deliver,finish,handoff,bookingText,slotsText,preloadedLoad:routingLoad,logger});
  }

  const shadow=createV3ShadowObserver({context,rpc});
  return runUnderstandingTurn({
    claim,context,rpc:shadow.rpc,deliver,finish,handoff,bookingText,slotsText,resolveProduct,cognitiveMode:'policy',deliverMenu,
    planner:async(c,safeContext)=>{
      const message=latestText(c);
      const retrieved=await retrieveDabbirKnowledge({businessId:c.business.id,query:message,rpc,env:process.env,fetchImpl:fetch,limit:5});
      const result=await interpretSemanticMessage({message,context:{...safeContext,retrieved_business_knowledge:retrieved},referenceTime:c.batch?.last_message_at||c.batch_messages?.at(-1)?.created_at,meteringContext:{business:{id:c.business.id},conversation:{id:c.conversation.id},batch_message_created_at:c.batch?.last_message_at}});
      return shadow.captureProposal({...result.proposal,executionMetadata:{provider:result.provider,model:result.model,...result.telemetry}});
    },
  });
}
