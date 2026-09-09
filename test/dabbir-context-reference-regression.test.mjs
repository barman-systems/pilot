import test from 'node:test';
import assert from 'node:assert/strict';
import {understandConversation,resolveOrdinal} from '../api/_dabbir-semantic-engine.js';
import {context,ids,memory,now,offered,appointments,offeredAppointments} from './fixtures/understanding/cases.mjs';

const run=(body,previous,extra={})=>understandConversation({context:context({...extra,batch_messages:[{body}]}),previous,now});
const selected=()=>run('أبي غسيل كامل باجر الساعة 18:00').state;
const other='60000000-0000-4000-8000-000000000002';
const catalog=[{id:ids.service,name_ar:'غسيل كامل',price:50},{id:other,name_ar:'تلميع',price:90}];

test('active service reference does not ask for a service already stated',()=>{
 const r=run('نفس اللي قلت لك',selected());
 assert.equal(r.state.entities.service.value,ids.service);
 assert.equal(r.decision.action,'CHECK_AVAILABILITY');
 assert.equal(r.state.unresolved_references.length,0);
});
test('explicit current service outranks historical repeat memory',()=>{
 const r=run('أبي تلميع باجر نفس السيارة',null,{services:catalog,verified_memory:[memory]});
 assert.equal(r.state.entities.service.value,other);
 assert.notEqual(r.state.clarification_entity,'service');
});
test('same yesterday must not silently mean last week',()=>{
 const r=run('نفس أمس',null,{verified_memory:[memory]});
 assert.notEqual(r.state.entities.service?.value,ids.service);
 assert.equal(r.decision.action,'CLARIFY');
});
test('same yesterday resolves the actual completed appointment in the business timezone',()=>{
 const r=run('نفس أمس بس باجر عقب المغرب',null,{operational_history:[{id:'80000000-0000-4000-8000-000000000001',business_id:ids.business,customer_id:ids.customer,branch_id:ids.branch,service_id:ids.service,status:'completed',simulated:false,starts_at:'2026-09-07T17:00:00Z'}]});
 assert.equal(r.state.entities.service?.value,ids.service);
 assert.equal(r.state.entities.date?.value,'2026-09-09');
 assert.equal(r.state.entities.time?.part,'after_maghrib');
 assert.ok(!r.state.unresolved_references.includes('verified_history'));
});
test('ambiguous historical services never select the last row by iteration order',()=>{
 const r=run('نفس أمس',null,{services:catalog,operational_history:[ids.service,other].map((service_id,i)=>({id:`80000000-0000-4000-8000-00000000000${i+1}`,business_id:ids.business,customer_id:ids.customer,branch_id:ids.branch,service_id,status:'completed',simulated:false,starts_at:`2026-09-07T${12+i}:00:00Z`}))});
 assert.equal(r.decision.action,'CLARIFY');
 assert.ok(!r.state.entities.service?.value);
});
test('Gulf feminine second option resolves inside the presented list',()=>{
 assert.deepEqual(resolveOrdinal('لا مب هذي، الثانية'),{index:1,ambiguous:false,mentioned:true});
});
test('real dialogue affirmative هي answers the pending confirmation without resetting the goal',()=>{
 const p=selected();p.intent_confirmed=false;p.clarification_entity='intent_confirmation';p.missing_fields=['intent_confirmation'];
 const r=run('هي',p);
 assert.equal(r.state.intent_confirmed,true);
 assert.equal(r.decision.action,'CHECK_AVAILABILITY');
});

for(const [body,field] of [['السيارة الثانية','vehicle'],['the second car','vehicle'],['الموظف الثاني','worker'],['الخدمة الثانية','service']])test('typed ordinal cannot authorize an offered slot: '+body,()=>{
 const r=run(body,null,{pending_state:offered});
 assert.equal(r.decision.action,'CLARIFY');
 assert.ok(r.state.unresolved_references.includes(field));
 assert.notEqual(r.state.entities.slot?.status,'active');
});
test('a typed vehicle ordinal cannot select an appointment for cancellation',()=>{
 const r=run('الغ السيارة الثانية',null,{pending_state:offeredAppointments,upcoming_appointments:appointments});
 assert.equal(r.decision.action,'CLARIFY');
 assert.notEqual(r.state.entities.appointment?.status,'active');
});
test('unqualified feminine ordinal still confirms the actually presented slot',()=>{
 const r=run('لا مب هذي، الثانية',null,{pending_state:offered});
 assert.equal(r.decision.action,'CREATE_BOOKING');
 assert.equal(r.state.entities.slot.value,1);
});
