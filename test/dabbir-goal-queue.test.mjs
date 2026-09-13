import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueHarness} from './fixtures/understanding/dialogue-harness.mjs';
import {resumeQueuedGoal,queuedGoalPrompt} from '../api/_dabbir-goal-queue.js';
import {understandLegacyConversation,understandConversation} from '../api/_dabbir-semantic-engine.js';
import {ids} from './fixtures/understanding/cases.mjs';
const proposal=(requestSpans=[])=>({intent:'BOOKING',confidence:.99,riskLevel:'LOW',entities:[],requestSpans});
const first='أبي أحجز خارجي اليوم الساعة 5 م',second='أبي أحجز VIP بكره الساعة 6 م';
const harness=()=>dialogueHarness({planner:(_body,_s,p)=>p||proposal()});
async function two(h,spans=[first,second]){return h.turn(spans.join(' وبعدين '),proposal(spans));}
function acceptedCompletion(h){h.state.last_verified_action={action:'CREATE_BOOKING',appointment_id:'80000000-0000-4000-8000-000000000001',source:'DATABASE_FACT',at:h.state.updated_at};h.state.last_verified_outcome={status:'confirmed',source:'DATABASE_FACT',at:h.state.updated_at};h.state.cognition.journey_stage='COMPLETED';}

test('two explicit jobs retain independent service and time facts through the real orchestrator',async()=>{
 const h=harness(),r=await two(h);
 assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.entities.service.value,ids.service);
 assert.equal(r.state.entities.date.value,'2026-09-09');assert.equal(r.state.entities.time.value,'17:00');
 assert.equal(r.state.goal_queue.length,1);const next=r.state.goal_queue[0].state;
 assert.equal(next.entities.service.value,h.c.services[1].id);assert.equal(next.entities.date.value,'2026-09-10');assert.equal(next.entities.time.value,'18:00');
 assert.equal(r.state.cognition.secondary_goals.length,1);assert.equal(r.result.action,'CLARIFY');
 assert.equal(h.calls.some(x=>x.name==='dabbir_semantic_execute_v2'),false);
});

test('booking and rescheduling remain distinct ordered goals instead of a single last intent',async()=>{
 const h=harness(),r=await two(h,[first,'أبي أغير موعدي القديم']);
 assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.entities.service.value,ids.service);
 assert.equal(r.state.goal_queue[0].state.goal,'RESCHEDULE_BOOKING');assert.equal(r.state.goal_queue[0].state.entities.appointment,undefined);
});

test('a side price question and a correction do not rewrite the queued job',async()=>{
 const h=harness();await two(h);const queued=structuredClone(h.state.goal_queue);
 const q=await h.turn('كم VIP',{...proposal(),intent:'PRICING',dialogue:{message_role:'SIDE_QUESTION',evidence:'كم VIP',invalidated_fields:[]}});
 assert.match(q.reply,/VIP.*100/);assert.deepEqual(q.state.goal_queue,queued);
 const corrected=await h.turn('لا قصدي الساعة 7 م');assert.equal(corrected.state.entities.time.value,'19:00');assert.deepEqual(corrected.state.goal_queue,queued);
});

test('overlapping or invented spans cannot authorize any of the proposed jobs',async()=>{
 for(const spans of [[first,first],[first,'أبي أحجز خدمة غير مذكورة']]){
  const h=harness();const r=await h.turn(first+' وبعدين '+second,proposal(spans));
  assert.equal(r.result.action,'CLARIFY');assert.equal(r.state.clarification_entity,'request');assert.equal(r.state.intent_confirmed,false);
  assert.equal(h.calls.some(x=>x.name==='dabbir_semantic_execute_v2'),false);
 }
});

test('the next goal needs both database truth and receipt-gated completion',async()=>{
 const h=harness();await two(h);const now=new Date(h.state.updated_at);
 assert.equal(resumeQueuedGoal(h.state,h.c,now).resumed,false);
 acceptedCompletion(h);const valid=structuredClone(h.state);
 for(const corrupt of [s=>delete s.last_verified_outcome,s=>s.last_verified_action.source='AI_INFERENCE',s=>s.cognition.journey_stage='AWAITING_RECEIPT',s=>s.last_verified_action.action='CANCEL_BOOKING']){
  const state=structuredClone(valid);corrupt(state);const r=resumeQueuedGoal(state,h.c,now);assert.equal(r.resumed,false);assert.equal(r.blocked,true);
 }
 const r=resumeQueuedGoal(valid,h.c,now);assert.equal(r.resumed,true);assert.equal(r.previous.goal_queue.length,0);assert.equal(r.previous.last_verified_action,undefined);assert.equal(r.previous.entities.slot,undefined);
});

test('a returning turn resumes the next scoped goal and never inherits the first job vehicle',async()=>{
 const h=harness();await two(h);await h.turn('ستيشن');acceptedCompletion(h);
 const r=await h.turn('صالون');assert.equal(r.state.entities.service.value,h.c.services[1].id);assert.equal(r.state.entities.vehicle.value,'saloon');
 assert.equal(r.state.entities.date.value,'2026-09-10');assert.equal(r.state.entities.time.value,'18:00');assert.equal(r.state.goal_queue.length,0);assert.equal(r.state.clarification_entity,'location');
 assert.ok(r.state.goal_queue_resumed);assert.equal(h.calls.some(x=>x.name==='dabbir_semantic_execute_v2'),false);
});

test('foreign or stale queued state fails closed and cannot become the current journey',async()=>{
 for(const change of [s=>s.goal_queue[0].state.scope.customer_id=ids.other,s=>s.goal_queue[0].state.expires_at='2000-01-01T00:00:00Z']){
  const h=harness();await two(h);acceptedCompletion(h);change(h.state);
  const r=await h.turn('صالون');assert.equal(r.result.action,'HANDOFF');assert.equal(h.calls.some(x=>x.name==='dabbir_semantic_execute_v2'),false);
 }
});

test('a removed queued service is revalidated and cannot reuse its old authority',async()=>{
 const h=harness();await two(h);acceptedCompletion(h);
 const r=await h.turn('صالون',null,{services:[h.c.services[0]],activity_profile:{...h.c.activity_profile,services:h.c.activity_profile.services.filter(x=>x.service_id===ids.service)}});
 assert.notEqual(r.state.entities.service?.status,'active');assert.notEqual(r.result.action,'CREATE_BOOKING');
});

test('a deferred old-appointment request cannot retarget the booking just created',async()=>{
 const h=harness();await two(h,[first,'أبي أغير موعدي القديم']);acceptedCompletion(h);
 const newAppointment={id:h.state.last_verified_action.appointment_id,business_id:ids.business,branch_id:ids.branch,service_id:ids.service,starts_at:'2026-09-10T09:00:00Z',status:'confirmed'};
 const r=await h.turn('بكره الساعة 6 م',null,{upcoming_appointments:[newAppointment]});
 assert.equal(r.state.goal,'RESCHEDULE_BOOKING');assert.equal(r.state.entities.appointment,undefined);assert.equal(r.state.clarification_entity,'appointment');
 assert.equal(h.calls.some(x=>x.name==='dabbir_semantic_execute_v2'),false);
});

test('the completion continuation question comes from the queued service requirements',async()=>{
 const h=harness();await two(h);
 const reply=queuedGoalPrompt(h.state,h.c,new Date(h.state.updated_at),understandLegacyConversation);
 assert.match(reply,/الحجز التالي/);assert.match(reply,/السيارة/);assert.doesNotMatch(reply,/الموعد.*تم|تم.*الحجز|تمام/);
});

test('replaying the same source spans does not append the same queued job twice',()=>{
 const h=harness(),args={context:{...h.c,batch_messages:[{id:'same-source',body:first+' وبعدين '+second}]},now:new Date('2026-09-09T08:00:00Z'),proposal:proposal([first,second])};
 const a=understandConversation(args),b=understandConversation({...args,previous:a.state});
 assert.equal(b.state.goal_queue.length,1);assert.equal(b.state.goal_queue[0].id,a.state.goal_queue[0].id);
});

for(const type of ['car_wash','salon','services'])test('scoped goal separation uses '+type+' service contracts',async()=>{
 const services=[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name_ar:'الخدمة الأولى',name_en:'Service One',price:40},{id:'60000000-0000-4000-8000-000000000002',business_id:ids.business,branch_id:ids.branch,name_ar:'الخدمة الثانية',name_en:'Service Two',price:60}];
 const h=dialogueHarness({type,services,planner:(_body,_s,p)=>p||proposal()});
 const spans=['book Service One tomorrow at 17:00','book Service Two tomorrow at 18:00'];const r=await h.turn(spans.join(' and then '),proposal(spans));
 assert.equal(r.state.entities.service.value,services[0].id);assert.equal(r.state.entities.time.value,'17:00');
 assert.equal(r.state.goal_queue[0].state.entities.service.value,services[1].id);assert.equal(r.state.goal_queue[0].state.entities.time.value,'18:00');
 assert.equal(r.state.service_type,type);assert.equal(r.state.goal_queue[0].state.service_type,type);
 assert.equal(h.calls.some(x=>x.name==='dabbir_semantic_execute_v2'),false);assert.ok(Buffer.byteLength(JSON.stringify(r.state))<24000);
});
