import {
  runUnderstandingTurn as runUnderstandingTurnCore,
  SEMANTIC_SESSION_IDLE_MS,
  safeProviderTrace,
} from './_dabbir-understanding-orchestrator-core.js';
import {
  finalizeCustomerResponse,
  availabilitySlotsReply,
  bookingConfirmationReply,
} from './_dabbir-conversation-brain-response.js';

export {SEMANTIC_SESSION_IDLE_MS,safeProviderTrace};

// Public legacy-visible orchestration boundary. Execution remains in the
// compatibility core, while every customer-facing delivery is finalized by the
// canonical Conversation Brain response owner before transport.
export function runUnderstandingTurn(options){
  const {deliver,slotsText,bookingText}=options;
  const brainDeliver=async(claim,context,text,purpose)=>deliver(
    claim,
    context,
    finalizeCustomerResponse({text,purpose}),
    purpose,
  );
  const brainSlotsText=typeof slotsText==='function'
    ?(slots,language)=>availabilitySlotsReply({slots,language,slotsText})
    :slotsText;
  const brainBookingText=typeof bookingText==='function'
    ?(result,language)=>bookingConfirmationReply({result,language,bookingText})
    :bookingText;
  return runUnderstandingTurnCore({...options,deliver:brainDeliver,slotsText:brainSlotsText,bookingText:brainBookingText});
}
