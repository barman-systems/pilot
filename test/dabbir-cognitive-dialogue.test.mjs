import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueHarness} from './fixtures/understanding/dialogue-harness.mjs';
import {ids} from './fixtures/understanding/cases.mjs';
import {probeCognitiveDialogue} from '../api/_dabbir-cognitive-probe.js';
const proposal=intent=>({intent,action:intent==='SERVICE_DISCOVERY'?'SERVICE_MENU':'REPLY',confidence:.99,riskLevel:'LOW',entities:[]});

test('critical live regression: شو خدماتكم → أبا غسيل خارجي → ستيشن never resets the booking',async()=>{
 const h=dialogueHarness({planner:(body)=>proposal(body==='شو خدماتكم'?'SERVICE_DISCOVERY':body==='ستيشن'?'SUPPORT':'BOOKING')});
 await h.turn('شو خدماتكم');await h.turn('أبا غسيل خارجي');
 assert.equal(h.state.clarification_entity,'vehicle');
 const t=await h.turn('ستيشن');
 assert.equal(t.state.goal,'BOOK_SERVICE');assert.equal(t.state.intent,'BOOKING');
 assert.equal(t.state.entities.service.value,ids.service);assert.equal(t.state.entities.vehicle.value,'station');
 assert.equal(t.state.clarification_entity,'location');assert.doesNotMatch(t.reply,/شو تحتاج|كيف.*أساعد|What do you need|services, prices/i);
});

test('pricing a different service answers from catalog and resumes the existing booking',async()=>{
 const h=dialogueHarness();await h.turn('أبا غسيل خارجي');
 const q=await h.turn('كم سعر VIP');assert.equal(q.state.entities.service.value,ids.service);assert.equal(q.state.goal,'BOOK_SERVICE');
 assert.match(q.reply,/VIP.*100/);assert.match(q.reply,/السيارة/);assert.equal(q.state.cognition.pending_field,'vehicle');
 assert.equal(q.state.cognition.message_role,'SIDE_QUESTION');
 const next=await h.turn('ستيشن');assert.equal(next.state.entities.service.value,ids.service);assert.equal(next.state.clarification_entity,'location');
});

test('service correction in a draft does not reschedule an unrelated existing appointment',async()=>{
 const h=dialogueHarness();await h.turn('أبا غسيل خارجي');await h.turn('ستيشن');
 const q=await h.turn('غيرها VIP');assert.equal(q.state.goal,'BOOK_SERVICE');assert.equal(q.state.intent,'BOOKING');assert.equal(q.state.entities.service.value,h.c.services[1].id);assert.equal(q.state.entities.vehicle.value,'station');
 const r=await h.turn('لا قصدي خارجي');assert.equal(r.state.entities.service.value,ids.service);assert.equal(r.state.entities.vehicle.value,'station');assert.equal(r.state.clarification_entity,'location');
});

test('confirmed pending fact is not reasked when a provider labels its answer SUPPORT',async()=>{
 const h=dialogueHarness({type:'services',planner:(_text,_snapshot,p)=>p||proposal('BOOKING')});
 await h.turn('أبي خارجي');await h.turn('بكره');
 const t=await h.turn('18:00',proposal('SUPPORT'));assert.equal(t.state.entities.date.value,'2026-09-10');assert.equal(t.state.entities.time.value,'18:00');assert.equal(t.result.action,'CHECK_AVAILABILITY');
});

test('unknown answer preserves goal and asks a targeted clarification without a menu',async()=>{
 const h=dialogueHarness({planner:(_text,_snapshot,p)=>p||proposal('BOOKING')});await h.turn('أبا خارجي');
 const r=await h.turn('اللي قلت لك عنه',proposal('SUPPORT'));assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.clarification_entity,'vehicle');assert.doesNotMatch(r.reply,/شو تحتاج|أقدر أساعدك/);
});

test('the authenticated fixed probe uses the same bounded planner and never reaches a business tool',async()=>{
 const result=await probeCognitiveDialogue({interpret:async({message})=>({proposal:proposal(message==='شو خدماتكم'?'SERVICE_DISCOVERY':message==='ستيشن'?'SUPPORT':'BOOKING'),provider:'test-provider',model:'test-model'})});
 assert.equal(result.ok,true);assert.equal(result.providers.length,2);assert.equal(result.turns[2].pending_field,'location');assert.equal(result.external_side_effects,false);
});

test('shadow computes a comparison only, with no second provider call, execution or replacement state',async()=>{
 let calls=0;const h=dialogueHarness({cognitiveMode:'shadow',planner:(body)=>{calls++;return proposal(body==='شو خدماتكم'?'SERVICE_DISCOVERY':body==='ستيشن'?'SUPPORT':'BOOKING');}});
 await h.turn('شو خدماتكم');await h.turn('أبا غسيل خارجي');const r=await h.turn('ستيشن');
 assert.equal(r.state.goal,'UNKNOWN');assert.equal(r.state.cognition,undefined);assert.equal(r.state.cognitive_shadow.goal,'BOOK_SERVICE');assert.equal(r.state.cognitive_shadow.action_changed,true);assert.equal(calls,3);
 assert.equal(h.calls.filter(c=>c.name==='dabbir_cognitive_record_delivery_v1').length,0);assert.equal(h.replies.length,3);
});

test('an evidenced side-question role resolves a price inquiry without replacing the booking service',async()=>{
 const h=dialogueHarness({planner:(_body,_s,p)=>p||proposal('BOOKING')});await h.turn('أبا خارجي');
 const p={...proposal('PRICING'),dialogue:{message_role:'SIDE_QUESTION',evidence:'كم VIP',invalidated_fields:[]}};
 const r=await h.turn('كم VIP',p);assert.match(r.reply,/VIP.*100/);assert.equal(r.state.entities.service.value,ids.service);assert.equal(r.state.goal,'BOOK_SERVICE');
});

test('a withdrawn location is invalidated without discarding service, vehicle or goal',async()=>{
 const h=dialogueHarness({planner:(_body,_s,p)=>p||proposal('BOOKING')});await h.turn('أبا خارجي');await h.turn('ستيشن');
 // An old valid receipt is deliberately in session state, but withdrawal must
 // remove execution authority regardless of whether a replacement is known.
 h.state.entities.location={value:{lat:24,lng:54},status:'active',source:'PROVIDER_VERIFIED',confidence:1,receipt_id:'old'};
 const r=await h.turn('لا غير الموقع',{...proposal('BOOKING'),dialogue:{message_role:'CORRECTION',evidence:'غير الموقع',invalidated_fields:['location']}});
 assert.equal(r.state.entities.location.value,null);assert.equal(r.state.entities.service.value,ids.service);assert.equal(r.state.entities.vehicle.value,'station');assert.equal(r.state.goal,'BOOK_SERVICE');
});
