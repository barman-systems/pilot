import {z} from 'zod';

const actions=['REPLY','CLARIFY','SERVICE_MENU','PRICING','CHECK_AVAILABILITY','CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING','HANDOFF','SUPERSEDED'];
const mutation=new Set(['CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING']);
const contract=z.object({
 action:z.enum(actions),intent:z.string().min(1).max(60),confidence:z.number().min(0).max(1),
 riskLevel:z.enum(['LOW','MEDIUM','HIGH']),missingFields:z.array(z.string().max(60)).max(24),reasonCode:z.string().min(1).max(100),
}).passthrough();

// Validate the application decision as well as provider output. This check is
// independent of models, and does not replace database authorization.
export function assertBrainDecision(state,decision,context){
 const parsed=contract.safeParse(decision);
 const expected={business_id:context.business?.id,customer_id:context.customer?.id,conversation_id:context.conversation?.id,branch_id:context.conversation?.branch_id};
 const denial=decision.action==='HANDOFF'&&decision.reasonCode==='TENANT_SCOPE_UNVERIFIED';
 if(!parsed.success||!Object.entries(expected).every(([k,v])=>(v||denial)&&state.scope?.[k]===v))throw Object.assign(new Error('BRAIN_DECISION_CONTRACT_INVALID'),{code:'BRAIN_DECISION_CONTRACT_INVALID'});
 if(mutation.has(decision.action)&&(state.pending_action!==decision.action||state.missing_fields.length||state.unresolved_references.length||!(state.operational_confidence>=.9)))throw Object.assign(new Error('BRAIN_MUTATION_NOT_AUTHORIZED'),{code:'BRAIN_MUTATION_NOT_AUTHORIZED'});
 return decision;
}

export function verifiedAvailability(result,context,state){
 const fail=()=>{throw Object.assign(new Error('SEMANTIC_AVAILABILITY_RESULT_INVALID'),{code:'SEMANTIC_AVAILABILITY_RESULT_INVALID'});};
 if(!result||!Array.isArray(result.slots)||result.slots.length>100)return fail();
 for(const slot of result.slots){
  if(!slot||!Number.isFinite(Date.parse(slot.starts_at))||slot.service_id!==state.entities.service?.value||
   !(context.services||[]).some(s=>s.id===slot.service_id&&(!s.business_id||s.business_id===context.business.id)&&(!s.branch_id||s.branch_id===context.conversation.branch_id))||
   (slot.worker_id&&!(context.workers||[]).some(w=>w.id===slot.worker_id&&(!w.business_id||w.business_id===context.business.id)&&(!w.branch_id||w.branch_id===context.conversation.branch_id))))return fail();
 }
 return result.slots.slice(0,3);
}

// Last-mile invariant for prose from knowledge or future response generators.
// This is a safety backstop, not a language-understanding or execution router.
export function assertResponseGrounding(text,receipt=null){
 const t=String(text||'').normalize('NFKD').replace(/[\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/\s+/g,' ').toLowerCase();
 const claims=[
  ['CREATE_BOOKING',/(?:تم (?:حجز|تاكيد (?:الحجز|الموعد)|تثبيت الموعد)|حجزت(?: لك)?|ثبت(?:نا|ت) (?:لك )?الموعد|(?:i have|i've|i|we have|we've|we) booked|your (?:booking|appointment) (?:is|has been) confirmed|booking confirmed)/],
  ['RESCHEDULE_BOOKING',/(?:تم تعديل (?:الموعد|الحجز)|عدل(?:ت|نا) (?:لك )?(?:الموعد|الحجز)|your (?:appointment|booking) (?:was|has been) rescheduled|(?:i|we) (?:have )?rescheduled)/],
  ['CANCEL_BOOKING',/(?:تم الغاء (?:الموعد|الحجز)|لغي(?:ت|نا) (?:لك )?(?:الموعد|الحجز)|your (?:appointment|booking) (?:was|has been) cancel(?:l)?ed|(?:i|we) (?:have )?cancel(?:l)?ed)/],
  ['HANDOFF',/(?:بلغ(?:ت|نا) الفريق|ارسل(?:ت|نا) (?:للفريق|التفاصيل)|تم (?:ابلاغ|اخطار) الفريق|(?:i|we) (?:have )?(?:notified|informed|sent .* to) (?:the )?(?:team|staff))/],
 ];
 const negated=t.replace(/(?:لم|ما) (?:يتم|تم) (?:حجز|تاكيد الحجز|تعديل الموعد|الغاء الموعد)/g,'').replace(/(?:ما|لم) (?:حجزت|نحجز|احجز)(?: لك)?/g,'');
 for(const [action,pattern] of claims)if(pattern.test(negated)&&!(receipt?.verified===true&&receipt.action===action))throw Object.assign(new Error('BRAIN_UNVERIFIED_ACTION_LANGUAGE'),{code:'BRAIN_UNVERIFIED_ACTION_LANGUAGE'});
 if(/^(?:تم|done|booked|حجزت|عدلت|ارسلت|ثبت الموعد)[.! ✅]*$/.test(t)&&receipt?.verified!==true)throw Object.assign(new Error('BRAIN_UNVERIFIED_ACTION_LANGUAGE'),{code:'BRAIN_UNVERIFIED_ACTION_LANGUAGE'});
 // No unpersisted future commitments are supported by this release.
 if(/(?:بشيك|راح (?:اشيك|اتحقق|احجز|اعدل|ارسل)|سوف اتحقق|ساحول|بعطي الفريق|برسل للفريق|(?:i|we)(?:'ll| will) (?:check|book|send|notify|cancel|reschedule))/.test(t))throw Object.assign(new Error('BRAIN_UNPERSISTED_COMMITMENT'),{code:'BRAIN_UNPERSISTED_COMMITMENT'});
}
