import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { understandConversation } from '../api/_dabbir-semantic-engine.js';

const ids={
  business:'20000000-0000-4000-8000-000000000001',
  conversation:'30000000-0000-4000-8000-000000000001',
  customer:'40000000-0000-4000-8000-000000000001',
  branch:'50000000-0000-4000-8000-000000000001',
  service:'60000000-0000-4000-8000-000000000001',
};
const now=new Date('2026-09-08T12:00:00Z');
const services=[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name:'Vip',name_ar:'Vip',name_en:'VIP',price:100,duration_minutes:60}];
function context(extra={}){
  return {
    business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},
    conversation:{id:ids.conversation,branch_id:ids.branch,state:'ai_active'},
    customer:{id:ids.customer},services,workers:[],branches:[],approved_aliases:[],verified_memory:[],knowledge:[],
    batch_messages:[],pending_state:null,
    ...extra,
  };
}
function turn(body,previous=null,extra={}){
  return understandConversation({context:context({...extra,batch_messages:[{body}]}),previous,now}).state;
}
function decision(body,previous=null,extra={}){
  return understandConversation({context:context({...extra,batch_messages:[{body}]}),previous,now}).decision;
}

test('car wash cannot reach availability until vehicle and location are grounded',()=>{
  const first=understandConversation({context:context({batch_messages:[{body:'ابا احجز Vip اليوم الساعة 5 مساء'}]}),now});
  assert.equal(first.state.ontology,'car_wash');
  assert.deepEqual(first.state.business_constraints,['vehicle','location']);
  assert.deepEqual(first.state.missing_fields,['vehicle','location']);
  assert.equal(first.decision.action,'CLARIFY');
  assert.equal(first.decision.reply,'السيارة صالون ولا ستيشن/SUV؟');

  const second=understandConversation({context:context({batch_messages:[{body:'صالون'}]}),previous:first.state,now});
  assert.equal(second.state.entities.vehicle.value,'saloon');
  assert.deepEqual(second.state.missing_fields,['location']);
  assert.equal(second.decision.reply,'أرسل موقع السيارة من خيار «الموقع» في واتساب.');

  const third=understandConversation({context:context({batch_messages:[{body:'📍 موقع واتساب: 24.453884, 54.377343 — أبوظبي'}]}),previous:second.state,now});
  assert.deepEqual(third.state.entities.location.value,{lat:24.453884,lng:54.377343,label:'أبوظبي'});
  assert.equal(third.state.entities.location.source,'CUSTOMER_STATED');
  assert.equal(third.decision.action,'CHECK_AVAILABILITY');
});

test('verified slot can create a car-wash booking only after domain facts are present',()=>{
  const one=turn('ابا احجز Vip اليوم الساعة 5 مساء');
  const two=turn('ستيشن',one);
  const three=turn('📍 موقع واتساب: 24.453884, 54.377343 — السيارة',two);
  const slot={starts_at:'2026-09-08T13:30:00.000Z',service_id:ids.service,worker_id:null};
  const pending={pending_action:'choose_slot',payload:{mode:'booking',presented:true,provider_message_id:'wamid.slot',slots:[slot]},expires_at:'2026-09-08T12:15:00.000Z'};
  const final=understandConversation({context:context({batch_messages:[{body:'1'}],pending_state:pending}),previous:three,now});
  assert.equal(final.state.entities.vehicle.value,'station');
  assert.equal(final.state.entities.location.value.lat,24.453884);
  assert.equal(final.decision.action,'CREATE_BOOKING');
  assert.equal(final.decision.reasonCode,'VERIFIED_SLOT_SELECTION');
});

test('non car-wash businesses do not inherit vehicle or location requirements',()=>{
  const c=context({business:{id:ids.business,business_type:'salon',timezone:'Asia/Dubai',currency_code:'AED'},batch_messages:[{body:'ابا احجز Vip اليوم الساعة 5 مساء'}]});
  const result=understandConversation({context:c,now});
  assert.deepEqual(result.state.business_constraints,[]);
  assert.equal(result.decision.action,'CHECK_AVAILABILITY');
});

test('legacy id-only car-wash memory cannot impersonate a verified location or vehicle',()=>{
  const memory=[
    {business_id:ids.business,customer_id:ids.customer,status:'verified',source:'DATABASE_FACT',confidence:.99,last_confirmed_at:'2026-09-01T10:00:00Z',memory_key:'last_verified_location',value:{id:'70000000-0000-4000-8000-000000000001'}},
    {business_id:ids.business,customer_id:ids.customer,status:'verified',source:'DATABASE_FACT',confidence:.99,last_confirmed_at:'2026-09-01T10:00:00Z',memory_key:'known_vehicle',value:{id:'80000000-0000-4000-8000-000000000001'}},
  ];
  const result=understandConversation({context:context({verified_memory:memory,batch_messages:[{body:'ابا احجز Vip اليوم الساعة 5 مساء نفس آخر مرة'}]}),now});
  assert.equal(result.state.entities.location,undefined);
  assert.equal(result.state.entities.vehicle,undefined);
  assert.notEqual(result.decision.action,'CREATE_BOOKING');
});

test('database invariant persists grounded car-wash location and rejects semantic guesses',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20260908133000_dabbir_car_wash_whatsapp_grounding_v1.sql',import.meta.url),'utf8');
  assert.match(sql,/business_type[\s\S]*car_wash/);
  assert.match(sql,/pending_action' = 'CREATE_BOOKING'/);
  assert.match(sql,/source}' <> 'AI_INFERENCE'/);
  assert.match(sql,/v_vehicle not in \('saloon','station'\)/);
  assert.match(sql,/new\.location_type := 'customer'/);
  assert.match(sql,/new\.service_latitude := v_lat/);
  assert.match(sql,/new\.service_longitude := v_lng/);
  assert.match(sql,/before insert on public\.dabbir_appointments/);
  assert.match(sql,/revoke all on function dabbir_private\.car_wash_whatsapp_booking_grounding_v1\(\) from public, anon, authenticated/);
});
