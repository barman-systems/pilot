import {
  runUnderstandingTurn as runUnderstandingTurnCore,
  SEMANTIC_SESSION_IDLE_MS,
  safeProviderTrace,
} from './_dabbir-understanding-orchestrator-core.js';
import {
  availabilitySlotsReply,
  bookingConfirmationReply,
  renderOperationalResponse,
} from './_dabbir-conversation-brain-response.js';

export {SEMANTIC_SESSION_IDLE_MS,safeProviderTrace};

// Public compatibility boundary. Authority/execution stays in the legacy core.
// The facade observes only data the core already committed or verified and gives
// the Conversation Brain final ownership of customer prose before transport.
export function runUnderstandingTurn(options){
  const {deliver,slotsText,bookingText,rpc}=options;
  let committedState=null;
  let executionResult=null;

  const brainRpc=async(name,args)=>{
    const result=await rpc(name,args);
    if(name==='dabbir_semantic_commit_v2'&&args?.p_state)committedState=structuredClone(args.p_state);
    if(name==='dabbir_semantic_execute_v2'&&result?.verified===true)executionResult=structuredClone(result);
    return result;
  };

  const brainBookingText=typeof bookingText==='function'
    ?(result,language)=>bookingConfirmationReply({result,language,bookingText})
    :bookingText;

  const brainDeliver=async(claim,context,text,purpose)=>deliver(
    claim,
    context,
    renderOperationalResponse({
      text,
      purpose,
      context,
      state:committedState,
      executionResult,
      bookingText:brainBookingText,
    }),
    purpose,
  );

  const brainSlotsText=typeof slotsText==='function'
    ?(slots,language)=>availabilitySlotsReply({slots,language,slotsText})
    :slotsText;

  return runUnderstandingTurnCore({
    ...options,
    rpc:brainRpc,
    deliver:brainDeliver,
    slotsText:brainSlotsText,
    bookingText:brainBookingText,
  });
}
