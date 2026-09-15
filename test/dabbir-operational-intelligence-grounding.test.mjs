import test from 'node:test';
import assert from 'node:assert/strict';
import {understandConversation} from '../api/_dabbir-semantic-engine.js';
import {context,ids} from './fixtures/understanding/cases.mjs';
import {activityContext} from './fixtures/understanding/activity.mjs';

const ctx=(services=[{id:ids.service,name:'VIP',price:100}])=>activityContext(context({
  business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},
  services,
  workers:[],
}));
const turn=(c,body,now,previous=null)=>understandConversation({context:{...c,batch_messages:[{body}]},previous,now});

test('Arabic spoken-letter spelling grounds one unique Latin acronym service',()=>{
  const result=turn(ctx(),'أبا في اي بي باجر الساعة 5 مساء',new Date('2026-09-08T09:00:00Z'));
  assert.equal(result.state.entities.service?.value,ids.service);
  assert.equal(result.state.entities.service?.grounded_by,'DATABASE_FACT');
  assert.equal(result.state.intent,'BOOKING');
});

test('phonetic acronym grounding fails closed when the catalog match is ambiguous',()=>{
  const services=[
    {id:ids.service,name:'VIP',price:100},
    {id:'60000000-0000-4000-8000-000000000002',name:'VIB',price:80},
  ];
  const result=turn(ctx(services),'أبا في اي بي باجر الساعة 5 مساء',new Date('2026-09-08T09:00:00Z'));
  assert.equal(result.state.entities.service?.value??null,null);
  assert.ok(result.state.missing_fields.includes('service'));
});

test('same-day ambiguous clock resolves to PM only when AM is already impossible',()=>{
  const result=turn(ctx(),'أبا VIP اليوم الساعة 5',new Date('2026-09-08T09:52:00Z'));
  assert.equal(result.state.entities.date?.value,'2026-09-08');
  assert.equal(result.state.entities.time?.value,'17:00');
  assert.equal(result.state.entities.time?.period,'pm');
  assert.equal(result.state.entities.time?.confidence,.99);
  assert.ok(!result.state.missing_fields.includes('time'));
});

test('tomorrow at five remains ambiguous because AM and PM are both possible',()=>{
  const result=turn(ctx(),'أبا VIP باجر الساعة 5',new Date('2026-09-08T09:52:00Z'));
  assert.equal(result.state.entities.date?.value,'2026-09-09');
  assert.equal(result.state.entities.time?.value??null,null);
  assert.ok(result.state.missing_fields.includes('time'));
});

test('same-day clock remains ambiguous while both AM and PM are still possible',()=>{
  const result=turn(ctx(),'أبا VIP اليوم الساعة 5',new Date('2026-09-08T00:00:00Z'));
  assert.equal(result.state.entities.time?.value??null,null);
  assert.ok(result.state.missing_fields.includes('time'));
});
