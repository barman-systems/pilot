import { interpretSemanticMessage } from './_dabbir-semantic-interpreter.js';
import { retrieveDabbirKnowledge } from './_dabbir-knowledge-rag.js';
import { runUnderstandingTurn } from './_dabbir-understanding-orchestrator.js';
import { createV3ShadowObserver } from './_dabbir-v3-shadow-observer.js';

const clean=(v,max=4000)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const arr=v=>Array.isArray(v)?v:[];
const latestText=context=>arr(context?.batch_messages).map(x=>clean(x?.body,1500)).filter(Boolean).join('\n').slice(0,2500);

// Canonical conversation composition boundary.
// Channels own transport; this module owns semantic planning/orchestration composition.
// V3 remains shadow-only until its independent real-WhatsApp acceptance gate passes.
export async function runConversationRuntimeTurn({
  claim,
  context,
  rpc,
  deliver,
  finish,
  handoff,
  bookingText,
  slotsText,
  resolveProduct,
  deliverMenu,
}){
  const shadow=createV3ShadowObserver({context,rpc});
  return runUnderstandingTurn({
    claim,
    context,
    rpc:shadow.rpc,
    deliver,
    finish,
    handoff,
    bookingText,
    slotsText,
    resolveProduct,
    cognitiveMode:'policy',
    deliverMenu,
    planner:async(c,safeContext)=>{
      const message=latestText(c);
      const retrieved=await retrieveDabbirKnowledge({
        businessId:c.business.id,
        query:message,
        rpc,
        env:process.env,
        fetchImpl:fetch,
        limit:5,
      });
      const result=await interpretSemanticMessage({
        message,
        context:{...safeContext,retrieved_business_knowledge:retrieved},
        referenceTime:c.batch?.last_message_at||c.batch_messages?.at(-1)?.created_at,
        meteringContext:{
          business:{id:c.business.id},
          conversation:{id:c.conversation.id},
          batch_message_created_at:c.batch?.last_message_at,
        },
      });
      return shadow.captureProposal({
        ...result.proposal,
        executionMetadata:{provider:result.provider,model:result.model,...result.telemetry},
      });
    },
  });
}
