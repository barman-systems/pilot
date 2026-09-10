import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueHarness} from './fixtures/understanding/dialogue-harness.mjs';

function stale(h,count=4){
 h.state.intent_confirmed=false;h.state.pending_action='CLARIFY';h.state.clarification_entity='intent_confirmation';
 h.state.requirement_loop={key:'intent_confirmation',count};
}
const proposal=(body,role='ANSWER_TO_PENDING_QUESTION')=>({intent:'SUPPORT',action:'REPLY',confidence:.99,riskLevel:'LOW',entities:[],dialogue:{message_role:role,evidence:body,invalidated_fields:[]}});

test('real WhatsApp شو عندكم reads the catalog without failing stale booking confirmation',async()=>{
 const h=dialogueHarness();await h.turn('أبي خارجي');stale(h);
 const r=await h.turn('شو عندكم');
 assert.equal(r.result.state,'PROCESSED');assert.equal(r.result.action,'SERVICE_MENU');
 assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.intent_confirmed,false);assert.equal(r.state.requirement_loop,null);
 assert.equal(r.state.cognition.message_role,'SIDE_QUESTION');
 assert.match(r.reply,/خارجي.*40/);assert.match(r.reply,/VIP.*100/);assert.doesNotMatch(r.reply,/تقصد تبا تحجز|Do you want to book/i);
 assert.equal(h.calls.filter(x=>x.name==='dabbir_semantic_execute_v2').length,0);
});

test('catalog read survives NEW_REQUEST model metadata without authorizing the draft booking',async()=>{
 const h=dialogueHarness({planner:body=>({...proposal(body,'NEW_REQUEST'),intent:'SERVICE_DISCOVERY',action:'SERVICE_MENU'})});
 await h.turn('أبي خارجي');stale(h);const r=await h.turn('شو عندكم');
 assert.equal(r.result.action,'SERVICE_MENU');assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.intent_confirmed,false);assert.equal(r.state.requirement_loop,null);
});

test('three catalog interruptions are not failed answers; three subsequent actual failures still hand off',async()=>{
 const h=dialogueHarness({planner:body=>proposal(body)});await h.turn('أبي خارجي');
 for(let n=0;n<3;n++){const r=await h.turn('شو عندكم');assert.equal(r.result.action,'SERVICE_MENU');assert.equal(r.state.requirement_loop,null);}
 const one=await h.turn('ما فهمت');assert.equal(one.result.action,'CLARIFY');assert.equal(one.state.requirement_loop.count,1);
 const two=await h.turn('ما فهمت');assert.equal(two.result.action,'CLARIFY');assert.equal(two.state.requirement_loop.count,2);
 const three=await h.turn('ما فهمت');assert.equal(three.result.action,'HANDOFF');assert.equal(h.decisions.at(-1).tool_selection,'REPEATED_REQUIREMENT_EXTRACTION_FAILURE');
});

test('a grounded price side question has no failed extraction attempt and keeps the booked service',async()=>{
 const h=dialogueHarness({planner:body=>({...proposal(body,'SIDE_QUESTION'),intent:'PRICING'})});
 await h.turn('أبي خارجي');const service=h.state.entities.service.value;stale(h);
 const r=await h.turn('كم VIP');assert.equal(r.result.action,'PRICING');assert.equal(r.state.entities.service.value,service);
 assert.equal(r.state.intent_confirmed,false);assert.equal(r.state.requirement_loop,null);assert.match(r.reply,/100/);assert.doesNotMatch(r.reply,/تقصد تبا تحجز/);
});

test('catalog questions cannot bypass an explicit branch mismatch or human takeover',async()=>{
 const h=dialogueHarness();await h.turn('أبي خارجي');stale(h);
 const branch=await h.turn('شو عندكم في فرع ثاني');assert.equal(branch.result.action,'CLARIFY');assert.equal(branch.state.clarification_entity,'branch');assert.doesNotMatch(branch.reply,/VIP.*100/);
 const human=await h.turn('شو عندكم',null,{conversation:{...h.c.conversation,state:'human_active'}});
 assert.equal(human.result.action,'HANDOFF');assert.equal(h.decisions.at(-1).tool_selection,'HUMAN_TAKEOVER_ACTIVE');
});
