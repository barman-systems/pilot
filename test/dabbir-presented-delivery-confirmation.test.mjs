import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueHarness} from './fixtures/understanding/dialogue-harness.mjs';

// Replay the phone exchange, with the incompatible old inference that was
// actually retained in Production. Delivery is acknowledged as the real RPC
// does; the harness otherwise leaves presentation pending.
async function pendingMode(options={}) {
 const h=dialogueHarness(options);
 await h.turn('أبي خارجي');
 h.state.entities.delivery_mode={value:'AT_BUSINESS',source:'AI_INFERENCE',confidence:.5,status:'active',service_id:h.c.services[0].id};
 await h.turn('السلام عليكم');
 const asked=await h.turn('ابا اغسل السياره');
 assert.equal(asked.state.clarification_entity,'delivery_mode');
 h.state.cognition.pending_question.presentation='PROVIDER_ACCEPTED';
 h.state.cognition.pending_question.provider_message_id='verified-test-receipt';
 return h;
}

for(const answer of ['هي','هيه','نعم','yes'])test(`phone confirmation ${answer} selects the presented customer-site option, not the stale branch inference`,async()=>{
 let calls=0;
 const h=await pendingMode({planner:body=>{calls++;return {intent:'BOOKING',action:'REPLY',confidence:.99,riskLevel:'LOW',entities:[],dialogue:{message_role:'NEW_REQUEST',evidence:body,invalidated_fields:[]}};}});
 assert.equal(h.state.cognition.pending_question.text,'وين تبا الخدمة: عندك؟');
 const before=calls;
 const r=await h.turn(answer);
 assert.equal(r.result.state,'PROCESSED');assert.equal(r.result.action,'CLARIFY');
 assert.equal(r.state.entities.delivery_mode.value,'MOBILE');
 assert.equal(r.state.entities.delivery_mode.source,'CUSTOMER_CONFIRMED');
 assert.equal(r.state.clarification_entity,'vehicle');assert.match(r.reply,/السيارة|vehicle/i);
 assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.entities.service.value,h.c.services[0].id);
 assert.equal(calls,before);assert.deepEqual(r.state.cognitive_quality_violations,[]);
 assert.equal(h.calls.filter(x=>x.name==='dabbir_semantic_execute_v2').length,0);
});

for(const change of ['undelivered','different_question','new_contract','greeting_interruption'])test(`bare confirmation has no delivery authority after ${change}`,async()=>{
 const h=await pendingMode();
 if(change==='undelivered')h.state.cognition.pending_question.presentation='PENDING_DELIVERY';
 if(change==='different_question')h.state.cognition.pending_question.text='السيارة صالون؟';
 if(change==='new_contract')h.c.activity_profile.services[0].contract_version='test-v2';
 if(change==='greeting_interruption')await h.turn('مرحبا');
 const r=await h.turn('هي');
 assert.equal(r.result.state,'PROCESSED');assert.equal(r.result.action,'CLARIFY');
 assert.equal(r.state.clarification_entity,'delivery_mode');
 assert.notEqual(r.state.entities.delivery_mode.source,'CUSTOMER_CONFIRMED');
 assert.equal(h.calls.filter(x=>x.name==='dabbir_semantic_execute_v2').length,0);
});

test('yes cannot select between multiple presented delivery modes',async()=>{
 const h=await pendingMode({options:{delivery_modes:['MOBILE','AT_BUSINESS']}});
 const r=await h.turn('هي');
 assert.equal(r.result.action,'CLARIFY');assert.equal(r.state.clarification_entity,'delivery_mode');
 assert.notEqual(r.state.entities.delivery_mode.source,'CUSTOMER_CONFIRMED');
});

test('an explicit unsupported mode remains invalid and can be clarified without disabling the quality gate',async()=>{
 const h=await pendingMode();
 h.state.entities.delivery_mode.source='CUSTOMER_CONFIRMED';h.state.entities.delivery_mode.confidence=.99;
 const r=await h.turn('ما فهمت');
 assert.equal(r.result.state,'PROCESSED');assert.equal(r.result.action,'CLARIFY');
 assert.ok(r.state.invalid_fields.includes('delivery_mode'));assert.match(r.reply,/عندك/);
});
