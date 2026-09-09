import assert from 'node:assert/strict';
import test from 'node:test';
import {activityContext} from './fixtures/understanding/activity.mjs';
import {understandConversation} from '../api/_dabbir-semantic-engine.js';

const ids={
  business:'20000000-0000-4000-8000-000000000001',
  conversation:'30000000-0000-4000-8000-000000000001',
  customer:'40000000-0000-4000-8000-000000000001',
  branch:'50000000-0000-4000-8000-000000000001',
  service:'60000000-0000-4000-8000-000000000001',
  worker:'70000000-0000-4000-8000-000000000001',
};
const now=new Date('2026-09-09T01:10:00Z');
const services=[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name:'غسيل عادي',name_ar:'غسيل عادي',name_en:'Regular wash',price:50,duration_minutes:60}];
const memory=[
  {id:'81000000-0000-4000-8000-000000000001',business_id:ids.business,customer_id:ids.customer,branch_id:ids.branch,service_id:ids.service,memory_key:'last_verified_vehicle',value:{value:'saloon',branch_id:ids.branch,service_id:ids.service},source:'DATABASE_FACT',confidence:1,status:'verified',version:1,last_confirmed_at:'2026-09-09T01:05:31Z',expires_at:'2026-10-09T01:05:31Z'},
  {id:'81000000-0000-4000-8000-000000000002',business_id:ids.business,customer_id:ids.customer,branch_id:ids.branch,service_id:ids.service,memory_key:'last_verified_location',value:{value:{lat:24.186653,lng:52.626152,label:''},branch_id:ids.branch,service_id:ids.service},source:'DATABASE_FACT',confidence:1,status:'verified',version:1,last_confirmed_at:'2026-09-09T01:05:31Z',expires_at:'2026-10-09T01:05:31Z'},
  // A repeat confirmation must not silently reuse an unrelated optional worker.
  {id:'81000000-0000-4000-8000-000000000003',business_id:ids.business,customer_id:ids.customer,branch_id:ids.branch,service_id:ids.service,memory_key:'last_verified_worker',value:{id:ids.worker,branch_id:ids.branch,service_id:ids.service},source:'DATABASE_FACT',confidence:1,status:'verified',version:1,last_confirmed_at:'2026-09-09T01:05:31Z',expires_at:'2026-10-09T01:05:31Z'},
];
function context(extra={}){
  return activityContext({
    business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},
    conversation:{id:ids.conversation,branch_id:ids.branch,state:'ai_active'},
    customer:{id:ids.customer},services,
    workers:[{id:ids.worker,business_id:ids.business,branch_id:ids.branch,display_name:'سالم'}],
    branches:[],approved_aliases:[],verified_memory:memory,knowledge:[],batch_messages:[],pending_state:null,
    ...extra,
  });
}
function run(body,previous=null,extra={}){
  return understandConversation({context:context({...extra,batch_messages:[{body}]}),previous,now});
}
function reachRepeatPrompt(){
  const first=run('ابا احجز اليوم بعد');
  assert.equal(first.decision.action,'CLARIFY');
  assert.equal(first.state.missing_fields[0],'service');
  const second=run('غسيل عادي',first.state);
  return second;
}

test('repeat car-wash booking asks once whether to reuse the verified vehicle and location',()=>{
  const result=reachRepeatPrompt();
  assert.equal(result.decision.action,'CLARIFY');
  assert.equal(result.decision.reasonCode,'VERIFIED_REPEAT_BOOKING_MEMORY_CONFIRMATION');
  assert.equal(result.decision.reply,'نفس السيارة والموقع ولا بتغير؟');
  assert.equal(result.state.repeat_vehicle_location_prompt,'pending');
  assert.ok(result.state.missing_fields.includes('vehicle'));
  assert.ok(result.state.missing_fields.includes('location'));
});

test('answering same reuses only verified vehicle and location, then asks for time',()=>{
  const prompt=reachRepeatPrompt();
  const result=run('نفس',prompt.state);
  assert.equal(result.state.entities.vehicle.value,'saloon');
  assert.equal(result.state.entities.vehicle.source,'CUSTOMER_MEMORY');
  assert.deepEqual(result.state.entities.location.value,{lat:24.186653,lng:52.626152});
  assert.equal(result.state.entities.location.source,'CUSTOMER_MEMORY');
  assert.equal(result.state.entities.worker,undefined);
  assert.equal(result.state.repeat_vehicle_location_prompt,'accepted');
  assert.equal(result.decision.action,'CLARIFY');
  assert.equal(result.decision.reply,'أي وقت يناسبك؟');
});

test('yes in GCC Arabic confirms the same verified vehicle and location',()=>{
  const prompt=reachRepeatPrompt();
  const result=run('هيه',prompt.state);
  assert.equal(result.state.entities.vehicle.value,'saloon');
  assert.equal(result.state.entities.location.value.lat,24.186653);
  assert.equal(result.decision.reply,'أي وقت يناسبك؟');
});

test('change answer stays a new booking and cannot be misclassified as reschedule',()=>{
  const prompt=reachRepeatPrompt();
  const result=run('بغير',prompt.state);
  assert.equal(result.state.intent,'BOOKING');
  assert.notEqual(result.decision.action,'RESCHEDULE_BOOKING');
  assert.equal(result.state.repeat_vehicle_location_prompt,'declined');
  assert.match(result.decision.reply,/السيارة صالون ولا ستيشن\/SUV؟$/);
});

test('expired or wrong-service memory never offers the repeat shortcut',()=>{
  const bad=memory.map((m,index)=>index===0?{...m,expires_at:'2026-09-09T00:00:00Z'}:m);
  const first=understandConversation({context:context({verified_memory:bad,batch_messages:[{body:'ابا احجز غسيل عادي اليوم'}]}),now});
  assert.equal(first.state.repeat_vehicle_location_prompt,undefined);
  assert.match(first.decision.reply,/السيارة صالون ولا ستيشن\/SUV؟$/);
});
