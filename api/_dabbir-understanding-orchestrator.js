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
// This facade never identifies execution RPCs by name. It passively observes only
// the canonical commit/result shapes already crossing the existing RPC boundary,
// then gives the Conversation Brain final ownership of customer prose.
export function runUnderstandingTurn(options){
  const {deliver,slotsText,bookingText,rpc}=options;
  let committedState=null;
  let executionResult=null;

  const brainRpc=async(name,args)=>{
    const result=await rpc(name,args);
    // A semantic commit is the only existing call carrying both canonical state
    // and bounded metrics. Prefer replayed canonical state when the database
    // returns it; otherwise retain exactly the state submitted by the core.
    if(args?.p_state&&args?.p_metrics&&result?.version!=null){
      committedState=structuredClone(result?.state||args.p_state);
    }
    // Mutation receipts are observed only after the core has already obtained a
    // provider/database-verified appointment result. The facade cannot execute,
    // authorize, retry, or manufacture a receipt.
    if(result?.verified===true&&result?.appointment_id){
      executionResult=structuredClone(result);
    }
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
