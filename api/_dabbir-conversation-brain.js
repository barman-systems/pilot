import {cognitiveReduce} from './_dabbir-cognitive-dialogue.js';
import {applyGoalDrivenConversationPlan} from './_dabbir-goal-driven-planner.js';

export const CONVERSATION_BRAIN_OWNER='DABBIR_CONVERSATION_BRAIN';

// Canonical dialogue-decision ownership boundary for the legacy-compatible path.
//
// Understanding/reducers may extract facts, continuity and candidate state.
// Authority/execution may allow, block or return verified outcomes.
// Only this boundary composes the legacy cognitive reducer with the temporary
// goal-planner compatibility adapter that can shape customer-facing dialogue.
// Keeping both compatibility stages behind one function lets us remove them
// incrementally without another caller becoming a second dialogue owner.
export function runConversationBrain(args,legacyReducer){
  if(typeof legacyReducer!=='function'){
    throw Object.assign(new Error('CONVERSATION_BRAIN_REDUCER_REQUIRED'),{code:'CONVERSATION_BRAIN_REDUCER_REQUIRED'});
  }
  const reduced=cognitiveReduce(args,legacyReducer);
  return applyGoalDrivenConversationPlan({args,result:reduced});
}
