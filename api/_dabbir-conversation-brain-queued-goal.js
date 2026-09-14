import {queuedGoalPrompt as legacyQueuedGoalPrompt} from './_dabbir-goal-queue-core.js';

export const CONVERSATION_BRAIN_QUEUED_GOAL_OWNER='DABBIR_CONVERSATION_BRAIN';

// Customer-facing prose for the next queued goal belongs to the Conversation
// Brain. Queue storage/resume semantics remain separate and unchanged.
export function renderQueuedGoalPrompt(state,context,now,reduce){
  return legacyQueuedGoalPrompt(state,context,now,reduce);
}
