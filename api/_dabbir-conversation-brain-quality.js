import {qualityGate as legacyQualityGate} from './_dabbir-cognitive-dialogue-core.js';
import {semanticClarificationReply} from './_dabbir-conversation-brain-clarification.js';

export const CONVERSATION_BRAIN_QUALITY_OWNER='DABBIR_CONVERSATION_BRAIN';

// Compatibility finalizer for the current cognitive path.
// The orchestrator may invoke this adapter at the existing point in the turn,
// but all dialogue repair/rewriting remains owned by the Conversation Brain.
// Authority/execution code still decides allow/block and verified outcomes;
// this module has no transport, tenant, tool or mutation authority.
export function finalizeConversationBrainQuality({state,decision,previous,context}){
  const quality=legacyQualityGate({state,decision,previous,context});
  if(quality?.decision?.action==='CLARIFY'&&quality.decision.reasonCode==='COGNITIVE_REPLAN'){
    quality.decision.reply=semanticClarificationReply(quality.state,context);
  }
  quality.state.cognitive_quality_violations=[...quality.violations];
  return quality;
}
