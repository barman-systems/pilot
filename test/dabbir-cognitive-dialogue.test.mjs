import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueHarness} from './fixtures/understanding/dialogue-harness.mjs';
import {ids} from './fixtures/understanding/cases.mjs';
import {probeCognitiveDialogue,cognitiveEvaluationEnvironment} from '../api/_dabbir-cognitive-probe.js';
const proposal=intent=>({intent,action:intent==='SERVICE_DISCOVERY'?'SERVICE_MENU':'REPLY',confidence:.99,riskLevel:'LOW',entities:[]});

for(const intent of ['SUPPORT','SERVICE_DISCOVERY','PRICING'])for(const role of ['NEW_REQUEST','CONTINUATION','ANSWER_TO_PENDING_QUESTION','SIDE_QUESTION'])test(`new explicit service goal survives drifting metadata: ${intent}/${role}`,async()=>{
 const r=await probeCognitiveDialogue({interpret:async({message})=>({provider:'test-provider',model:'test-model',proposal:{...proposal(message==='شو خدماتكم'?'SERVICE_DISCOVERY':intent),dialogue:{message_role:role,evidence:message,invalidated_fields:[]}}})});
 assert.equal(r.ok,true,JSON.stringify(r.turns));
 assert.equal(r.turns[1].goal,'BOOK_SERVICE');assert.equal(r.turns[1].pending_field,'vehicle');
 assert.equal(r.turns[2].pending_field,'location');assert.equal(r.checks.no_execution,true);
});

test('a grounded first service goal cannot bypass the high-risk handoff gate',async()=>{
 const r=await probeCognitiveDialogue({interpret:async({message})=>({provider:'test-provider',model:'test-model',proposal:{...proposal(message==='شو خدماتكم'?'SERVICE_DISCOVERY':'SUPPORT'),riskLevel:message==='شو خدماتكم'?'LOW':'HIGH'}})});
 assert.equal(r.ok,false);assert.equal(r.turns.at(-1).action,'HANDOFF');assert.equal(r.checks.no_execution,true);
});

test('history-derived goal outranks a drifting intent label on the first turn',async()=>{
 const r=await probeCognitiveDialogue({scenario:'context_references',interpret:async()=>({provider:'test-provider',model:'test-model',proposal:proposal('SUPPORT')})});
 assert.equal(r.ok,true,JSON.stringify(r.checks));
 assert.equal(r.turns[0].goal,'BOOK_SERVICE');
 assert.equal(r.turns[0].service_preserved,true);
});

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

test('a recoverable live provider failure retains bounded diagnostics and stops the synthetic conversation',async()=>{
 let calls=0;const telemetry={request_count:1,actual_cost_usd:null,final_request_usage:null,latency_ms:20,attempts:[{provider:'groq',status:429,latency_ms:20,model:'existing'}]};
 const r=await probeCognitiveDialogue({provider:'groq',env:{GROQ_API_KEY:'test-only'},interpret:async()=>{calls++;throw Object.assign(new Error('AI_PLANNER_UNAVAILABLE'),{code:'AI_PLANNER_UNAVAILABLE',telemetry});}});
 assert.equal(r.ok,false);assert.equal(r.checks.no_execution,true);assert.equal(calls,1);assert.equal(r.turns.length,1);assert.equal(r.turns[0].action,'RETRY');
 assert.deepEqual(r.providers[0].telemetry,telemetry);assert.equal(r.providers[0].error,'AI_PLANNER_UNAVAILABLE');
});

test('a provider failure during a side question cannot checkpoint an unvalidated replacement service',async()=>{
 let calls=0;
 const r=await probeCognitiveDialogue({scenario:'correction_side_question',interpret:async({message})=>{
  if(++calls===3)throw Object.assign(new Error('AI_PLANNER_UNAVAILABLE'),{code:'AI_PLANNER_UNAVAILABLE'});
  return {provider:'test-provider',model:'test-model',proposal:proposal(message==='شو خدماتكم'?'SERVICE_DISCOVERY':'BOOKING')};
 }});
 assert.equal(r.ok,false);assert.equal(r.turns.at(-1).action,'RETRY');
 assert.equal(r.turns.at(-1).service_preserved,true);assert.equal(r.turns.at(-1).goal,'BOOK_SERVICE');
 assert.equal(r.turns.at(-1).vehicle,'station');assert.equal(r.turns.at(-1).pending_field,'location');
 assert.equal(r.checks.no_execution,true);
});

test('comparison isolates only the selected configured provider and cannot report fallback as success',async()=>{
 const env={GEMINI_API_KEY:'gemini-test',GROQ_API_KEY:'groq-test',DABBIR_AI_MODEL:'existing-model',VERCEL_ENV:'production',SUPABASE_SERVICE_ROLE_KEY:'private-test'};
 const selected=cognitiveEvaluationEnvironment('groq',env);
 assert.deepEqual(selected,{GROQ_API_KEY:'groq-test',DABBIR_AI_MODEL:'existing-model'});
 assert.equal(env.GEMINI_API_KEY,'gemini-test');assert.notEqual(selected,env);
 assert.throws(()=>cognitiveEvaluationEnvironment('untrusted',env),/NOT_ALLOWED/);
 assert.throws(()=>cognitiveEvaluationEnvironment('cloudflare-workers-ai',env),/NOT_CONFIGURED/);
 const r=await probeCognitiveDialogue({provider:'groq',env,interpret:async({message,env:actual})=>{
  assert.deepEqual(actual,selected);return {proposal:proposal(message==='شو خدماتكم'?'SERVICE_DISCOVERY':'BOOKING'),provider:'different-provider',model:'model'};
 }});
 assert.equal(r.checks.real_provider,false);assert.equal(r.ok,false);
});

test('fixed comparative conversation checks side-price truth and preserves the original service after correction',async()=>{
 const r=await probeCognitiveDialogue({scenario:'correction_side_question',interpret:async({message})=>({
  proposal:{...proposal(message==='شو خدماتكم'?'SERVICE_DISCOVERY':message==='كم VIP'?'PRICING':'BOOKING'),...(message==='كم VIP'?{dialogue:{message_role:'SIDE_QUESTION',evidence:message,invalidated_fields:[]}}:{})},provider:'test-provider',model:'test-model'
 })});
 assert.equal(r.turns.length,5);assert.deepEqual(r.checks,Object.fromEntries(Object.keys(r.checks).map(k=>[k,true])));assert.equal(r.ok,true);
});

test('side questions do not consume failed-answer attempts but repeated unresolved answers still escalate',async()=>{
 const h=dialogueHarness({planner:(_body,_s,p)=>p||proposal('BOOKING')});await h.turn('أبا خارجي');
 for(let i=0;i<3;i++){
  const r=await h.turn('كم VIP',{...proposal('PRICING'),dialogue:{message_role:'SIDE_QUESTION',evidence:'كم VIP',invalidated_fields:[]}});
  assert.equal(r.result.action,'PRICING');assert.equal(r.state.requirement_loop.count,1);assert.equal(r.state.goal,'BOOK_SERVICE');
 }
 await h.turn('ما فهمت',proposal('SUPPORT'));
 const failed=await h.turn('ما فهمت',proposal('SUPPORT'));assert.equal(failed.result.action,'HANDOFF');
});

test('fixed multiple-request probe measures independent goals, side questions and scoped correction',async()=>{
 const r=await probeCognitiveDialogue({scenario:'multiple_requests',interpret:async({message})=>({provider:'test-provider',model:'test-model',proposal:{...proposal(message==='كم VIP'?'PRICING':'BOOKING'),
  requestSpans:message.includes('وبعدين')?['أبي أحجز خارجي اليوم الساعة 5 م','أبي أحجز VIP بكره الساعة 6 م']:[],
  dialogue:{message_role:message==='كم VIP'?'SIDE_QUESTION':message.startsWith('لا ')?'CORRECTION':'NEW_REQUEST',evidence:message,invalidated_fields:[]}
 }})});
 assert.equal(r.turns.length,4);assert.equal(r.checks.independent_jobs,true);assert.equal(r.checks.correction_scoped,true);assert.equal(r.ok,true);
 assert.equal(r.external_side_effects,false);assert.equal(r.checks.no_execution,true);
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
