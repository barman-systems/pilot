import {
  runUnderstandingTurn as runUnderstandingTurnCore,
  SEMANTIC_SESSION_IDLE_MS,
  safeProviderTrace,
} from './_dabbir-understanding-orchestrator-core.js';
import {
  finalizeCustomerResponse,
  availabilitySlotsReply,
} from './_dabbir-conversation-brain-response.js';

export {SEMANTIC_SESSION_IDLE_MS,safeProviderTrace};

// Public legacy-visible orchestration boundary. Execution remains in the
// compatibility core, while every customer-facing delivery is finalized by the
// canonical Conversation Brain response owner before transport.
export function runUnderstandingTurn(options){
  const {deliver,slotsText}=options;
  const brainDeliver=async(claim,context,text,purpose)=>deliver(
    claim,
    context,
    finalizeCustomerResponse({text,purpose}),
    purpose,
  );
  const brainSlotsText=typeof slotsText==='function'
    ?(slots,language)=>availabilitySlotsReply({slots,language,slotsText})
    :slotsText;
  return runUnderstandingTurnCore({...options,deliver:brainDeliver,slotsText:brainSlotsText});
}
