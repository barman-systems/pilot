import test from 'node:test';import assert from 'node:assert/strict';
import {conversations} from './fixtures/understanding/cognitive-conversations.mjs';
import {dialogueHarness} from './fixtures/understanding/dialogue-harness.mjs';
import {ids} from './fixtures/understanding/cases.mjs';
export async function evaluateConversation(item,cognitiveMode='active'){
 const services=[{id:ids.service,name_ar:item.labels[0],name_en:item.labels[1],price:40},{id:'60000000-0000-4000-8000-000000000002',name_ar:item.labels[2],name_en:item.labels[2],price:100}];
 const h=dialogueHarness({type:item.type,services,cognitiveMode});const turns=[];
 for(const message of item.turns)turns.push(await h.turn(message));
 return {h,turns};
}
test('golden suite contains at least 100 complete 3–15 turn cases across the configured activities',()=>{
 assert.equal(conversations.length,108);assert.equal(new Set(conversations.map(c=>c.id)).size,108);assert.ok(conversations.every(c=>c.turns.length>=3&&c.turns.length<=15));
});
for(const item of conversations)test('golden conversation: '+item.id,async()=>{
 const {h,turns}=await evaluateConversation(item),s=h.state,e=item.expected;
 assert.equal(s.goal,e.goal);if(e.service!=null)assert.equal(s.entities.service?.value,h.c.services[e.service].id);
 if(e.field)assert.equal(s.clarification_entity,e.field);if(e.date)assert.equal(s.entities.date?.value,e.date);if(e.time)assert.equal(s.entities.time?.value,e.time);
 if(e.noLocation)assert.ok(!s.entities.location?.value);
 if(e.sidePrice){assert.match(turns.at(-1).reply,/100/);assert.equal(s.cognition.message_role,'SIDE_QUESTION');}
 assert.ok(!h.calls.some(x=>x.name==='dabbir_semantic_execute_v2'));
 for(const t of turns){assert.notEqual(t.result.action,'HANDOFF','ordinary configured dialogue must make progress');if(t.state.cognition?.active_journey){assert.doesNotMatch(t.reply||'',/أقدر أساعدك بالخدمات|شو تحتاج|What do you need\?/i);assert.notEqual(t.state.goal,'UNKNOWN');}}
});
