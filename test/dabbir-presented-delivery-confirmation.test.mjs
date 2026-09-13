import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueHarness} from './fixtures/understanding/dialogue-harness.mjs';

// A single database-authorized delivery mode is business truth. A stale model
// inference must never manufacture a customer question merely so a later "yes"
// can confirm it. Presentation authority remains relevant only when there is a
// real choice or an explicit customer conflict.
async function staleSingleMode(options={}) {
 const h=dialogueHarness(options);
 await h.turn('أبي خارجي');
 h.state.entities.delivery_mode={value:'AT_BUSINESS',source:'AI_INFERENCE',confidence:.5,status:'active',service_id:h.c.services[0].id};
 await h.turn('السلام عليكم');
 return h;
}

test('stale AI delivery inference cannot turn a single database mode into a customer question',async()=>{
 const h=await staleSingleMode();
 const r=await h.turn('ابا اغسل السياره');
 assert.equal(r.result.state,'PROCESSED');
 assert.equal(r.result.action,'CLARIFY');
 assert.equal(r.state.entities.delivery_mode.value,'MOBILE');
 assert.equal(r.state.entities.delivery_mode.source,'DATABASE_FACT');
 assert.equal(r.state.clarification_entity,'vehicle');
 assert.doesNotMatch(r.reply,/وين تبا الخدمة|delivery mode/i);
 assert.equal(h.calls.filter(x=>x.name==='dabbir_semantic_execute_v2').length,0);
});

test('single-mode authority remains stable after a greeting interruption',async()=>{
 const h=await staleSingleMode();
 await h.turn('مرحبا');
 const r=await h.turn('ابا اغسل السياره');
 assert.equal(r.state.entities.delivery_mode.value,'MOBILE');
 assert.equal(r.state.entities.delivery_mode.source,'DATABASE_FACT');
 assert.notEqual(r.state.clarification_entity,'delivery_mode');
});

test('yes cannot select between multiple delivery modes or reach mutation authority',async()=>{
 const h=dialogueHarness({options:{delivery_modes:['MOBILE','AT_BUSINESS']}});
 await h.turn('أبي خارجي');
 const asked=await h.turn('ابا اغسل السياره');
 assert.equal(asked.state.clarification_entity,'delivery_mode');
 const r=await h.turn('هي');
 assert.notEqual(r.state.entities.delivery_mode?.source,'CUSTOMER_CONFIRMED');
 assert.equal(h.calls.filter(x=>x.name==='dabbir_semantic_execute_v2').length,0);
 assert.ok(['CLARIFY','HANDOFF'].includes(r.result.action));
});

test('an explicit unsupported mode remains invalid and is never overwritten by the single-mode database fact',async()=>{
 const h=await staleSingleMode();
 const r=await h.turn('أبا الخدمة في الفرع');
 assert.equal(r.result.state,'PROCESSED');
 assert.equal(r.result.action,'CLARIFY');
 assert.ok(r.state.invalid_fields.includes('delivery_mode')||r.state.unresolved_references.includes('delivery_mode'));
 assert.equal(r.state.clarification_entity,'delivery_mode');
 assert.notEqual(r.state.entities.delivery_mode?.source,'DATABASE_FACT');
});
