import {createHash} from 'node:crypto';
import {clarification} from './_dabbir-semantic-engine-core.js';

const arr=v=>Array.isArray(v)?v:[];
const actions={BOOK_SERVICE:'CREATE_BOOKING',CANCEL_BOOKING:'CANCEL_BOOKING',RESCHEDULE_BOOKING:'RESCHEDULE_BOOKING'};
const scope=c=>({business_id:c.business?.id,conversation_id:c.conversation?.id,customer_id:c.customer?.id,branch_id:c.conversation?.branch_id});
const same=(s,c)=>Object.entries(scope(c)).every(([k,v])=>v&&s?.scope?.[k]===v);
const raw=c=>arr(c.batch_messages).map(m=>m.language_body??m.body??'').join(' ');
const live=(s,c,now)=>s?.version===2&&same(s,c)&&Date.parse(s.expires_at)>now.getTime();

function frameState(state){
 // Contracts and business truth are loaded again, rather than copied per job.
 const keys=['version','revision','scope','goal','intent','intent_confirmed','entities','missing_fields','clarification_entity','language','dialect','service_type','created_at','updated_at','expires_at','goal_queue_target_ids'];
 const copy=Object.fromEntries(keys.filter(k=>state[k]!==undefined).map(k=>[k,structuredClone(state[k])]));
 Object.assign(copy,{user_corrections:[],unresolved_references:[],business_constraints:[],owner_policies:[],last_confirmed_facts:{}});
 // An offered slot or appointment choice belongs to one presented operation.
 for(const key of ['slot','appointment','price'])delete copy.entities[key];
 return copy;
}

// A model identifies spans; only the existing reducer can establish a goal and
// its facts. There are no tools, DB writes or free-form model states here.
export function partitionGoalRequests(args,reduce){
 const spans=args.proposal?.requestSpans;
 if(!Array.isArray(spans)||spans.length<2)return null;
 const c=args.context,now=args.now||new Date(),source=raw(c),ranges=[];
 if(spans.length>3)return {invalid:true};
 for(const span of spans){
  if(typeof span!=='string'||span.trim().length<6||span.length>500)return {invalid:true};
  const start=source.indexOf(span);
  if(start<0||ranges.some(r=>start<r.end&&start+span.length>r.start))return {invalid:true};
  ranges.push({start,end:start+span.length,span});
 }
 ranges.sort((a,b)=>a.start-b.start);
 const prior=live(args.previous,c,now)?args.previous:null;
 const oldQueue=arr(prior?.goal_queue).filter(f=>live(f.state,c,now)).slice(0,3);
 const identity=arr(c.batch_messages).map(m=>m.id||m.created_at||'').join('|')||now.toISOString();
 const frames=[];
 for(const [i,r] of ranges.entries()){
  const context={...c,pending_state:null,batch_messages:[{body:r.span,language_body:r.span}],cognitive_active:true};
  const result=reduce({...args,context,previous:i===0?prior:null,proposal:null,proposalEvidence:null});
  if(!Object.hasOwn(actions,result.state.goal)||result.state.intent_confirmed!==true||['HANDOFF','SUPERSEDED'].includes(result.decision.action)||['UNTRUSTED_INSTRUCTION','BOOKING_NEGATED'].includes(result.decision.reasonCode))return {invalid:true};
  const id=createHash('sha256').update([JSON.stringify(scope(c)),identity,r.start,r.end].join('|')).digest('hex').slice(0,24);
  const saved=frameState(result.state);
  if(saved.goal!=='BOOK_SERVICE')saved.goal_queue_target_ids=arr(c.upcoming_appointments).filter(a=>a.id&&(!a.business_id||a.business_id===c.business.id)&&a.branch_id===c.conversation.branch_id).map(a=>a.id).slice(0,20);
  frames.push({id,state:saved,result});
 }
 const first=frames.shift();const seen=new Set(arr(prior?.goal_queue_seen));
 const additions=frames.filter(f=>!seen.has(f.id)&&!oldQueue.some(x=>x.id===f.id));
 if(oldQueue.length+additions.length>3)return {invalid:true};
 first.result.state.goal_queue=[...oldQueue,...additions.map(({id,state})=>({version:1,id,state}))];
 first.result.state.goal_queue_seen=[...new Set([...seen,first.id,...frames.map(f=>f.id)])].slice(-16);
 first.result.state.goal_queue_version=1;
 // Preserve the existing 32 KiB SQL ceiling, including space for receipt and
 // cognition metadata. Never raise that safety gate for more queued work.
 if(Buffer.byteLength(JSON.stringify(first.result.state),'utf8')>24000)return {invalid:true};
 return first.result;
}

// Called before context interpretation on a later customer turn. Completion
// needs both DB truth and the receipt-gated delivery transition, not model text.
export function resumeQueuedGoal(previous,c,now){
 if(!live(previous,c,now)||!arr(previous.goal_queue).length)return {previous,resumed:false};
 const a=previous.last_verified_action,o=previous.last_verified_outcome;
 const completed=a?.at&&Date.parse(a.at)>=Date.parse(previous.updated_at);
 if(!completed)return {previous,resumed:false};
 const verified=a.source==='DATABASE_FACT'&&o?.source==='DATABASE_FACT'&&a.action===actions[previous.goal]&&
  typeof a.appointment_id==='string'&&a.appointment_id.length>0&&typeof o.status==='string'&&o.status.length>0&&previous.cognition?.journey_stage==='COMPLETED';
 if(!verified)return {previous,resumed:false,blocked:true};
 const [frame,...rest]=previous.goal_queue;
 if(frame?.version!==1||!frame.id||!live(frame.state,c,now)||!Object.hasOwn(actions,frame.state.goal))return {previous,resumed:false,blocked:true};
 const seed=frameState(frame.state);
 seed.revision=previous.revision;seed.goal_queue=rest;seed.goal_queue_version=1;seed.goal_queue_seen=arr(previous.goal_queue_seen);
 seed.goal_queue_resumed=frame.id;seed.updated_at=now.toISOString();
 return {previous:seed,resumed:true};
}

export function queuedGoalPrompt(state,c,now,reduce){
 const frame=arr(state.goal_queue)[0];
 if(!frame||!live(frame.state,c,now))return '';
 const context={...c,pending_state:null,batch_messages:[],cognitive_active:true};
 if(Array.isArray(frame.state.goal_queue_target_ids))context.upcoming_appointments=arr(c.upcoming_appointments).filter(a=>frame.state.goal_queue_target_ids.includes(a.id));
 const r=reduce({previous:frameState(frame.state),context,now});
 const label=r.state.goal==='CANCEL_BOOKING'?(state.language==='en'?'cancellation':'إلغاء الموعد'):r.state.goal==='RESCHEDULE_BOOKING'?(state.language==='en'?'rescheduling':'تعديل الموعد'):(state.language==='en'?'next booking':'الحجز التالي');
 const question=clarification(r.state,context,{acknowledge:false});
 if(r.decision.action==='CLARIFY'&&r.decision.reply)return state.language==='en'?`\nFor your ${label}: ${question}`:`\nوبخصوص ${label}: ${question}`;
 return state.language==='en'?`\nShall we continue with your ${label}?`:`\nنكمل طلب ${label}؟`;
}
