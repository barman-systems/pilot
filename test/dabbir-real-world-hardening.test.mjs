import test from 'node:test';
import assert from 'node:assert/strict';
import {understandConversation} from '../api/_dabbir-semantic-engine.js';
import {assertResponseGrounding} from '../api/_dabbir-brain-contract.js';
import {ordinalReferenceField,referenceRequest} from '../api/_dabbir-context-resolver.js';
import {unseenSpec} from './fixtures/understanding/unseen-spec.mjs';
import {evaluateUnseen} from '../scripts/dabbir-unseen-evaluate.mjs';
import {dialogueHarness} from './fixtures/understanding/dialogue-harness.mjs';
import {safeProviderTrace} from '../api/_dabbir-understanding-orchestrator.js';
import {probeCognitiveDialogue} from '../api/_dabbir-cognitive-probe.js';

test('unseen corpus retains 104 individually authored cases across 8 actual business types',()=>{
 assert.equal(unseenSpec.length,104);assert.equal(new Set(unseenSpec.map(x=>x[0])).size,104);
 assert.equal(new Set(unseenSpec.map(x=>x[1])).size,8);
});
const regressions=['history/new-conversation','reference/bare-this','reference/bare-feminine','reference/pronoun-worker-unknown','reference/restore-unknown','correction/withdraw','correction/conditional','correction/reverse-conditional','correction/second-vehicle-same-service','authority/quoted-price-history','operations/other-customer','complex/one-cancel-one-new','complex/no-vehicle-carry-from-history'];
const evaluated=evaluateUnseen(understandConversation);
for(const id of regressions)test('real-world regression: '+id,()=>{
 const r=evaluated.results.find(x=>x.id===id);assert.ok(r.pass,JSON.stringify(r.checks.filter(c=>!c.pass)));
});
test('typed references bind to their clause and closest ordinal noun',()=>{
 assert.equal(ordinalReferenceField('نفس الخدمة بس للسيارة الثانية'),'vehicle');
 assert.equal(ordinalReferenceField('نفس الموظف لكن الخدمة الثانية'),'service');
 assert.equal(ordinalReferenceField('first second'),null);
 assert.deepEqual(referenceRequest('نفس أمس لكن السيارة مختلفة').fields,['service','worker','vehicle','location']);
 assert.deepEqual(referenceRequest('نفس الخدمة بس العامل الثاني').fields,['service']);
});
test('withdrawn draft clears the actual persisted offer before another customer confirmation',async()=>{
 const h=dialogueHarness({type:'salon'});
 await h.turn('أبي خارجي باجر الساعة 18:00');
 await h.turn('لا خلاص غيرت رأيي');
 assert.equal(h.state.goal,'UNKNOWN');assert.equal(h.state.pending_action,'REPLY');
 assert.ok(h.calls.some(c=>c.name==='dabbir_semantic_set_pending_v2'&&c.args.p_action==='none'));
 await h.turn('تمام');
 assert.equal(h.calls.filter(c=>c.name==='dabbir_semantic_execute_v2').length,0);
});
for(const [claim,action] of [['ثبت الموعد','CREATE_BOOKING'],['حجزت','CREATE_BOOKING'],['حجزنا؟',null],['تم تأكيد الموعد','CREATE_BOOKING'],['عدلت الموعد','RESCHEDULE_BOOKING'],['تم تعديل الحجز','RESCHEDULE_BOOKING'],['بلغت الفريق','HANDOFF'],['أرسلت التفاصيل','HANDOFF'],['We have rescheduled your appointment','RESCHEDULE_BOOKING'],['We notified the team','HANDOFF']].filter(([,a])=>a))test('no success claim without matching receipt: '+claim,()=>{
 assert.throws(()=>assertResponseGrounding(claim),/BRAIN_UNVERIFIED_ACTION_LANGUAGE/);
 assert.throws(()=>assertResponseGrounding(claim,{action,verified:false}),/BRAIN_UNVERIFIED_ACTION_LANGUAGE/);
 assert.doesNotThrow(()=>assertResponseGrounding(claim,{action,verified:true}));
});
test('bare success and future action commitments fail closed',()=>{
 for(const s of ['تم','عدلت','أرسلت','done'])assert.throws(()=>assertResponseGrounding(s),/BRAIN_UNVERIFIED_ACTION_LANGUAGE/);
 for(const s of ['راح أحجز','بشيك الحين','We will notify the team'])assert.throws(()=>assertResponseGrounding(s),/BRAIN_UNPERSISTED_COMMITMENT/);
 assert.doesNotThrow(()=>assertResponseGrounding('ما حجزت لك. أي وقت يناسبك؟'));
});
test('decision telemetry keeps provider facts and never copies arbitrary provider payload',()=>{
 const meta=safeProviderTrace({provider:'vercel-ai-gateway',model:'google/gemini-3.7-flash',actual_cost_usd:null,latency_ms:24,attempts:[{provider:'groq',status:429,latency_ms:4},{provider:'vercel-ai-gateway',status:200,latency_ms:20}],final_request_usage:{inputTokens:30,outputTokens:10,reasoningTokens:0},secret:'do-not-store',chain_of_thought:'do-not-store'});
 assert.equal(meta.fallback_used,true);assert.equal(meta.actual_cost_usd,null);assert.equal(meta.tokens.output,10);
 assert.doesNotMatch(JSON.stringify(meta),/do-not-store|secret|chain_of_thought/);
 assert.equal(safeProviderTrace({provider:'secret@example.com?token=x'}).provider,null);
});
test('fixed multi-activity probe checks semantic facets without exposing any mutation tool',async()=>{
 const r=await probeCognitiveDialogue({scenario:'unseen_multi_activity',interpret:async({message})=>{
  const q=message==='كم تاخذ وقت؟',medical=message.includes('تشخيص');
  return {provider:'fixture',model:'fixture',proposal:{action:q?'SERVICE_MENU':'REPLY',intent:q?'SERVICE_DISCOVERY':'SUPPORT',confidence:.99,riskLevel:medical?'HIGH':'LOW',entities:[],dialogue:{message_role:q?'SIDE_QUESTION':'CONTINUATION',evidence:message,invalidated_fields:[]},...(q?{serviceQuestion:{field:'duration_minutes',evidence:message,explicit_service:false}}:{})}};
 }});
 assert.equal(r.ok,true,JSON.stringify(r.results));assert.equal(r.results.length,4);assert.equal(r.external_side_effects,false);
 for(const c of r.results)assert.equal(c.checks.no_mutating_tool,true);
});
