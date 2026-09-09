import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueHarness} from './fixtures/understanding/dialogue-harness.mjs';
import {interpretSemanticMessage} from '../api/_dabbir-semantic-interpreter.js';
import {ids} from './fixtures/understanding/cases.mjs';
import {probeCognitiveDialogue} from '../api/_dabbir-cognitive-probe.js';

const services=[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name_ar:'عادي',name_en:'Regular',price:60,duration_minutes:45},
 {id:'60000000-0000-4000-8000-000000000002',business_id:ids.business,branch_id:ids.branch,name_ar:'VIP',name_en:'VIP',price:100,duration_minutes:90}];
const question=(field,evidence,serviceName=null)=>({action:'SERVICE_MENU',intent:field==='price'?'PRICING':'SERVICE_DISCOVERY',confidence:.98,riskLevel:'LOW',entities:[],serviceName,
 serviceQuestion:{field,evidence,explicit_service:serviceName!=null},dialogue:{message_role:'SIDE_QUESTION',evidence,invalidated_fields:[]}});
const harness=(options={})=>dialogueHarness({services,planner:async(_m,_s,p)=>p,...options});

test('literal live inquiry answers current service duration instead of repeating the menu',async()=>{
 const h=harness();await h.turn('شو خدماتكم',{action:'SERVICE_MENU',intent:'SERVICE_DISCOVERY',confidence:.98,riskLevel:'LOW',entities:[]});
 const r=await h.turn('غسيل عادي كم الوقت؟',question('duration_minutes','كم الوقت','عادي'));
 assert.equal(r.result.action,'REPLY');assert.equal(r.state.goal,'UNKNOWN');
 assert.match(r.reply,/عادي.*45 دقيقة/);assert.doesNotMatch(r.reply,/1\)|AED|كيف أقدر/);
 assert.equal(h.decisions.at(-1).service_question.verified,true);
 const selected=await h.turn('3',null);
 assert.notEqual(selected.result.action,'CREATE_BOOKING','out-of-range ordinal must not create anything');
});

test('duration side question preserves original service, goal and pending requirement',async()=>{
 const h=harness();await h.turn('أبا غسيل عادي',{action:'CREATE_BOOKING',intent:'BOOKING',confidence:.98,riskLevel:'MEDIUM',entities:[]});
 await h.turn('ستيشن');const r=await h.turn('كم مدة VIP؟',question('duration_minutes','كم مدة VIP','VIP'));
 assert.match(r.reply,/VIP.*90 دقيقة/);assert.match(r.reply,/موقع/);
 assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.entities.service.value,ids.service);
 assert.equal(r.state.cognition.pending_field,'location');
 assert.equal(h.calls.some(x=>x.name==='dabbir_semantic_execute_v2'),false);
});

test('a full booking request consumes the old menu before later numeric answers',async()=>{
 const h=harness();await h.turn('شو خدماتكم',{action:'SERVICE_MENU',intent:'SERVICE_DISCOVERY',confidence:.98,riskLevel:'LOW',entities:[]});
 await h.turn('أبا غسيل عادي',{action:'CREATE_BOOKING',intent:'BOOKING',confidence:.98,riskLevel:'MEDIUM',entities:[]});
 await h.turn('ستيشن');await h.turn('بكره');
 const r=await h.turn('2');
 assert.equal(r.state.entities.service.value,ids.service,'the old menu cannot reinterpret a numeric continuation as VIP');
 assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.state.entities.vehicle.value,'station');
});

test('unknown target asks one question and an exact short answer continues the inquiry, not a booking',async()=>{
 const h=harness();const r=await h.turn('كم مدته؟',question('duration_minutes','كم مدته'));
 assert.equal(r.reply,'أي خدمة تقصد؟');assert.equal(r.state.service_inquiry.pending_field,'service');
 const answered=await h.turn('VIP');
 assert.equal(answered.result.action,'REPLY');assert.match(answered.reply,/VIP.*90 دقيقة/);
 assert.equal(answered.state.goal,'UNKNOWN');assert.equal(answered.state.service_inquiry,undefined);
});

test('unknown side-inquiry target resumes the original booking after clarification',async()=>{
 const h=harness();await h.turn('أبا غسيل عادي',{action:'CREATE_BOOKING',intent:'BOOKING',confidence:.98,riskLevel:'MEDIUM',entities:[]});
 await h.turn('ستيشن');
 const unresolved=await h.turn('كم مدة الخدمة الثانية؟',question('duration_minutes','كم مدة الخدمة الثانية','Unlisted'));
 assert.equal(unresolved.reply,'أي خدمة تقصد؟');assert.equal(unresolved.state.goal,'BOOK_SERVICE');
 const resolved=await h.turn('VIP');
 assert.match(resolved.reply,/VIP.*90 دقيقة/);assert.match(resolved.reply,/موقع/);
 assert.equal(resolved.state.entities.service.value,ids.service);assert.equal(resolved.state.cognition.pending_field,'location');
});

for(const type of ['car_wash','salon','services'])test('service attributes come from the current catalog in '+type,async()=>{
 const h=harness({type,services:services.map(s=>({...s,duration_minutes:35,price:0}))});
 const duration=await h.turn('كم مدة VIP',question('duration_minutes','كم مدة VIP','VIP'));assert.match(duration.reply,/35 دقيقة/);
 const price=await h.turn('كم سعر VIP',question('price','كم سعر VIP','VIP'));assert.match(price.reply,/0 AED/);
 assert.equal(price.state.goal,'UNKNOWN');
});

test('missing duration and unsupported service names never borrow another service value',async()=>{
 const h=harness({services:services.map(s=>({...s,duration_minutes:null}))});
 const r=await h.turn('كم مدة VIP',question('duration_minutes','كم مدة VIP','VIP'));
 assert.match(r.reply,/غير محدد/);assert.doesNotMatch(r.reply,/0 دقيقة|90/);
 const unknown=await h.turn('كم مدة Unlisted',question('duration_minutes','كم مدة Unlisted','Unlisted'));
 assert.equal(unknown.reply,'أي خدمة تقصد؟');
});

test('interpreter accepts only a current-message service question and never its proposed value',async()=>{
 const output={action:'REPLY',intent:'SUPPORT',confidence:.98,risk_level:'LOW',service_name:'VIP',service_evidence:'VIP',knowledge_key:null,entities:[],
  service_question:{field:'duration_minutes',evidence:'كم الوقت'},dialogue:{message_role:'NEW_REQUEST',evidence:'كم الوقت',invalidated_fields:[]},request_spans:[]};
 const run=(message)=>interpretSemanticMessage({message,context:{services:[{name:'VIP'}]},env:{GROQ_API_KEY:'test'},fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)},finish_reason:'stop'}]}),{status:200})});
 assert.equal((await run('VIP كم الوقت')).proposal.serviceQuestion.field,'duration_minutes');
 assert.equal((await run('VIP')).proposal.serviceQuestion,null);
});

test('fixed production duration diagnostic exercises three complete turns and denies mutations',async()=>{
 const result=await probeCognitiveDialogue({scenario:'service_details',interpret:async({message})=>({provider:'test-provider',model:'test-model',proposal:message==='شو خدماتكم'
  ?{action:'SERVICE_MENU',intent:'SERVICE_DISCOVERY',confidence:.98,riskLevel:'LOW',entities:[]}
  :question('duration_minutes','كم الوقت','عادي')})});
 assert.equal(result.ok,true);assert.equal(Object.keys(result.checks).length,9);assert.equal(result.turns.length,3);
 assert.equal(result.external_side_effects,false);assert.equal(result.evidence_scope,'REAL_MODEL_SYNTHETIC_ORCHESTRATOR_NO_DATABASE_OR_WHATSAPP_DELIVERY');
});
