import {semanticClarificationReply} from './_dabbir-conversation-brain-clarification.js';

export const CONVERSATION_BRAIN_QUEUED_GOAL_OWNER='DABBIR_CONVERSATION_BRAIN';

const arr=value=>Array.isArray(value)?value:[];
const scope=context=>({business_id:context?.business?.id,conversation_id:context?.conversation?.id,customer_id:context?.customer?.id,branch_id:context?.conversation?.branch_id});
const live=(state,context,now)=>state?.version===2&&Object.entries(scope(context)).every(([key,value])=>value&&state?.scope?.[key]===value)&&Date.parse(state.expires_at)>now.getTime();

function presentationSeed(state){
  const seed=structuredClone(state);
  seed.entities={...(seed.entities||{})};
  for(const key of ['slot','appointment','price'])delete seed.entities[key];
  seed.user_corrections=[];
  seed.unresolved_references=[];
  seed.business_constraints=[];
  seed.owner_policies=[];
  seed.last_confirmed_facts={};
  return seed;
}

// Customer-facing queued-goal prose belongs to the Conversation Brain. Queue
// storage/resume authority remains in _dabbir-goal-queue-core.js; this renderer
// only re-runs the existing reducer on the saved scoped frame to learn the next
// question and then renders that question at the Brain boundary.
export function renderQueuedGoalPrompt(state,context,now,reduce){
  const instant=now instanceof Date?now:new Date(now||Date.now());
  const frame=arr(state?.goal_queue)[0];
  if(!frame||!live(frame.state,context,instant)||typeof reduce!=='function')return '';
  const queuedContext={...context,pending_state:null,batch_messages:[],cognitive_active:true};
  if(Array.isArray(frame.state.goal_queue_target_ids)){
    queuedContext.upcoming_appointments=arr(context?.upcoming_appointments).filter(appointment=>frame.state.goal_queue_target_ids.includes(appointment.id));
  }
  const result=reduce({previous:presentationSeed(frame.state),context:queuedContext,now:instant});
  const language=state?.language||result?.state?.language||'ar';
  const label=result?.state?.goal==='CANCEL_BOOKING'?(language==='en'?'cancellation':'إلغاء الموعد'):result?.state?.goal==='RESCHEDULE_BOOKING'?(language==='en'?'rescheduling':'تعديل الموعد'):(language==='en'?'next booking':'الحجز التالي');
  if(result?.decision?.action==='CLARIFY'&&result.decision.reply){
    const question=semanticClarificationReply(result.state,queuedContext,{acknowledge:false});
    return language==='en'?`\nFor your ${label}: ${question}`:`\nوبخصوص ${label}: ${question}`;
  }
  return language==='en'?`\nShall we continue with your ${label}?`:`\nنكمل طلب ${label}؟`;
}
