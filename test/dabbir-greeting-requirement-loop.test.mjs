import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueHarness} from './fixtures/understanding/dialogue-harness.mjs';

const proposal=(body,role='ANSWER_TO_PENDING_QUESTION')=>({intent:'SUPPORT',action:'REPLY',confidence:.99,riskLevel:'LOW',entities:[],dialogue:{message_role:role,evidence:body,invalidated_fields:[]}});
function staleLoop(h,key,count=3){
 h.state.clarification_entity=key;h.state.pending_action='CLARIFY';
 h.state.requirement_loop={key,count};
 h.state.intent_confirmed=key!=='intent_confirmation';
}

for(const greeting of ['مرحبا','هلا','السلام عليكم','شلونكم','hey','hello'])test(`real greeting regression: ${greeting} cannot fail a pending vehicle question`,async()=>{
 let modelCalls=0;
 const h=dialogueHarness({planner:body=>{modelCalls++;return proposal(body);}});
 await h.turn('أبي خارجي');staleLoop(h,'vehicle');const before=modelCalls;
 const r=await h.turn(greeting);
 assert.equal(r.result.state,'PROCESSED');assert.equal(r.result.action,'REPLY');
 assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.entities.service.value,h.c.services[0].id);
 assert.ok((r.state.requirement_loop?.count||0)<=3);assert.equal(modelCalls,before);
 assert.match(r.reply,/هلا|حياك|وعليكم السلام|Hello/i);assert.doesNotMatch(r.reply,/السيارة|أي يوم|تحجز خدمة/);
 assert.equal(r.state.cognition.message_role,'SOCIAL');
});

test('greeting suspends a stale intent-confirmation loop retained by governed return to AI',async()=>{
 const h=dialogueHarness();await h.turn('أبي خارجي');staleLoop(h,'intent_confirmation',4);
 const r=await h.turn('مرحبا');assert.equal(r.result.state,'PROCESSED');assert.equal(r.result.action,'REPLY');
 assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.intent_confirmed,false);
 assert.equal(r.state.requirement_loop,null);assert.equal(r.state.entities.slot,undefined);
 assert.equal(h.calls.filter(x=>x.name==='dabbir_semantic_execute_v2').length,0);
});

test('date clarification survives greeting and resumes on tomorrow without asking the service again',async()=>{
 const h=dialogueHarness({type:'services'});await h.turn('أبي خارجي');assert.equal(h.state.clarification_entity,'date');
 staleLoop(h,'date',4);const greeting=await h.turn('هلا');assert.equal(greeting.result.action,'REPLY');
 const r=await h.turn('باجر');assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.entities.date.value,'2026-09-10');
 assert.equal(r.state.clarification_entity,'time');assert.doesNotMatch(r.reply,/أي خدمة|which service/i);
});

test('return after hours keeps valid booking facts but inherits no failed clarification attempt',async()=>{
 const h=dialogueHarness();await h.turn('أبي خارجي');staleLoop(h,'vehicle',4);
 h.state.updated_at='2026-09-09T01:00:00Z';
 const r=await h.turn('مرحبا');assert.equal(r.result.action,'REPLY');assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.requirement_loop,null);
});

test('a stale clarification episode expires after inactivity even without a greeting',async()=>{
 const h=dialogueHarness();await h.turn('أبي خارجي');staleLoop(h,'vehicle',2);
 h.state.updated_at='2026-09-09T01:00:00Z';
 const r=await h.turn('ما فهمت');assert.equal(r.result.action,'CLARIFY');assert.equal(r.state.requirement_loop.count,1);
});

test('semantic side question can be interpreted at the old loop threshold before handoff',async()=>{
 let calls=0;
 const h=dialogueHarness({planner:body=>{calls++;return proposal(body,body==='وش معنى اسم النشاط؟'?'SIDE_QUESTION':'ANSWER_TO_PENDING_QUESTION');}});
 await h.turn('أبي خارجي');staleLoop(h,'vehicle',2);const before=calls;
 const r=await h.turn('وش معنى اسم النشاط؟');assert.equal(calls,before+1);
 assert.notEqual(r.result.action,'HANDOFF');assert.ok(r.state.requirement_loop.count<=2);assert.equal(r.state.goal,'BOOK_SERVICE');
 assert.equal(r.state.clarification_entity,'vehicle');
});

test('a grounded side question cannot hand off just because an inherited count was already four',async()=>{
 const h=dialogueHarness({planner:body=>proposal(body,'SIDE_QUESTION')});await h.turn('أبي خارجي');staleLoop(h,'vehicle',4);
 const r=await h.turn('هل أقدر أقرأ سياسة الخصوصية؟');assert.notEqual(r.result.action,'HANDOFF');assert.ok(r.state.requirement_loop.count<=4);
 assert.equal(r.state.clarification_entity,'vehicle');
});

test('three actual unresolved answers still trigger the existing guard after a greeting',async()=>{
 const h=dialogueHarness({planner:body=>proposal(body)});await h.turn('أبي خارجي');await h.turn('مرحبا');
 const one=await h.turn('ما فهمت');assert.equal(one.result.action,'CLARIFY');
 const two=await h.turn('ما فهمت');assert.equal(two.result.action,'CLARIFY');
 const three=await h.turn('ما فهمت');assert.equal(three.result.action,'HANDOFF');
 assert.equal(h.decisions.at(-1).tool_selection,'REPEATED_REQUIREMENT_EXTRACTION_FAILURE');
});

test('explicit abandonment clears the goal and old question without cancelling a booking',async()=>{
 const h=dialogueHarness();await h.turn('أبي خارجي');staleLoop(h,'vehicle',4);
 const r=await h.turn('خلاص ما أبي أحجز');assert.equal(r.result.action,'REPLY');assert.equal(r.state.goal,'UNKNOWN');
 assert.equal(r.state.requirement_loop,null);assert.deepEqual(r.state.goal_queue,[]);
 assert.equal(h.calls.filter(x=>x.name==='dabbir_semantic_execute_v2').length,0);
});

test('a mixed greeting and booking answer still resolves the answer',async()=>{
 const h=dialogueHarness({type:'services'});await h.turn('أبي خارجي');
 const r=await h.turn('هلا، باجر');assert.equal(r.state.entities.date.value,'2026-09-10');assert.equal(r.state.clarification_entity,'time');
});

test('greeting never overrides human takeover or provider high-risk handoff',async()=>{
 const h=dialogueHarness();await h.turn('أبي خارجي');
 const r=await h.turn('مرحبا',null,{conversation:{...h.c.conversation,state:'human_active'}});
 assert.equal(r.result.action,'HANDOFF');assert.equal(h.decisions.at(-1).tool_selection,'HUMAN_TAKEOVER_ACTIVE');
});

test('provider high-risk judgment still wins when the provisional requirement loop would hand off',async()=>{
 const h=dialogueHarness({planner:body=>({...proposal(body,'SIDE_QUESTION'),riskLevel:body==='سؤال حساس'?'HIGH':'LOW'})});
 await h.turn('أبي خارجي');staleLoop(h,'vehicle',2);
 const r=await h.turn('سؤال حساس');assert.equal(r.result.action,'HANDOFF');assert.equal(h.decisions.at(-1).tool_selection,'HIGH_RISK_INTERPRETATION');
});
