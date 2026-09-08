import test from 'node:test';import assert from 'node:assert/strict';
import {understandConversation} from '../api/_dabbir-semantic-engine.js';
import {resolveOperationalRequirements,serviceAreaCheck} from '../api/_dabbir-activity-intelligence.js';
import {context,ids,now,offered} from './fixtures/understanding/cases.mjs';
import {activityContext} from './fixtures/understanding/activity.mjs';
const ctx=(type='car_wash',options={})=>activityContext(context({business:{id:ids.business,business_type:type,timezone:'Asia/Dubai',currency_code:'AED'},services:[{id:ids.service,name:'VIP',price:100}],workers:[]}),options);
const turn=(c,body,previous=null,extra={})=>understandConversation({context:{...c,batch_messages:[{body}],...extra},previous,now});
const pin={message_id:'pin-1',business_id:ids.business,conversation_id:ids.conversation,value:{lat:24.453884,lng:54.377343,label:'test'}};
function mobileState(c=ctx()){
 let r=turn(c,'أبا VIP باجر الساعة 5 مساء');
 r=turn(c,'صالون',r.state);
 return turn(c,'موقع الخدمة',r.state,{batch_messages:[{id:'pin-1',body:'موقع الخدمة'}],location_receipts:[pin]});
}
test('mobile car wash collects only vehicle and signed location, then verifies a presented slot',()=>{
 const c=ctx();let r=turn(c,'أبا VIP باجر الساعة 5 مساء');
 assert.deepEqual(r.state.missing_fields,['vehicle','location']);assert.equal(r.decision.action,'CLARIFY');
 r=turn(c,'صالون',r.state);assert.deepEqual(r.state.missing_fields,['location']);
 r=turn(c,'location',r.state,{batch_messages:[{id:'pin-1',body:'location'}],location_receipts:[pin]});
 assert.equal(r.decision.action,'CHECK_AVAILABILITY');
 r=turn(c,'الثاني',r.state,{pending_state:{...offered,payload:{...offered.payload,slots:offered.payload.slots.map(s=>({...s,worker_id:null}))}}});assert.equal(r.decision.action,'CREATE_BOOKING');
 assert.deepEqual(r.state.entities.location.value,pin.value);
});
for(const [type,mode,expected] of [['car_wash','AT_BUSINESS',[]],['salon','AT_BUSINESS',[]],['home_cleaning','AT_CUSTOMER',['location','property_details']],['consulting','REMOTE',[]],['clinic','AT_BUSINESS',[]],['laundry','PICKUP',['location']],['maintenance','AT_CUSTOMER',['location']]]) {
 test(type+' '+mode+' resolves service-specific missing fields',()=>{
  const r=turn(ctx(type,{delivery_modes:[mode]}),'أبا VIP باجر الساعة 5 مساء');
  assert.deepEqual(r.state.missing_fields,expected);assert.equal(r.state.delivery_mode,mode);
  assert.equal(r.decision.action,expected.length?'CLARIFY':'CHECK_AVAILABILITY');
 });
}
test('multiple delivery modes require explicit disambiguation before availability',()=>{
 const c=ctx('car_wash',{delivery_modes:['MOBILE','AT_BUSINESS']});let r=turn(c,'أبا VIP باجر الساعة 5 مساء');
 assert.deepEqual(r.state.missing_fields,['delivery_mode']);
 r=turn(c,'في الفرع',r.state);assert.equal(r.state.delivery_mode,'AT_BUSINESS');assert.equal(r.decision.action,'CHECK_AVAILABILITY');assert.ok(!r.state.required_entities.includes('location'));
});
test('same-message correction keeps the final vehicle fact',()=>{
 const r=turn(ctx(),'أبا VIP باجر الساعة 5 مساء صالون، لا قصدي ستيشن');
 assert.equal(r.state.entities.vehicle.value,'station');assert.equal(r.state.entities.vehicle.source,'CUSTOMER_CORRECTION');assert.deepEqual(r.state.missing_fields,['location']);
});
test('typed WhatsApp marker, AI inference and invalid coordinates never supply location',()=>{
 const c=ctx();let r=turn(c,'أبا VIP باجر الساعة 5 مساء صالون');
 r=turn(c,'📍 موقع واتساب: 24.453884, 54.377343',r.state);assert.equal(r.state.entities.location,undefined);assert.notEqual(r.decision.action,'CHECK_AVAILABILITY');
 for(const f of [{value:pin.value,source:'AI_INFERENCE',confidence:1,status:'active'}, {value:{lat:91,lng:54},source:'PROVIDER_VERIFIED',confidence:1,status:'active',receipt_id:'pin-1'}]) {
  const s=mobileState(c).state;s.entities.location=f;
  const result=resolveOperationalRequirements({business:c.business,service:c.services[0],delivery_mode:'MOBILE',current_state:s,profile:c.activity_profile,now});
  assert.ok(result.missing.includes('location'));
 }
});
test('foreign receipt and foreign activity profile cannot become operational authority',()=>{
 const c=ctx();let r=turn(c,'أبا VIP باجر الساعة 5 مساء صالون');
 r=turn(c,'location',r.state,{batch_messages:[{id:pin.message_id,body:'location'}],location_receipts:[{...pin,business_id:ids.other}]});assert.equal(r.state.entities.location,undefined);
 c.activity_profile.business_id=ids.other;r=turn(c,'أبا VIP باجر الساعة 5 مساء');assert.equal(r.decision.action,'HANDOFF');assert.equal(r.decision.reasonCode,'ACTIVITY_PROFILE_UNVERIFIED');
});
test('missing database activity profile fails closed',()=>{
 const c=ctx();delete c.activity_profile;const r=turn(c,'أبا VIP باجر الساعة 5 مساء');assert.equal(r.decision.action,'HANDOFF');
});
test('safe memory needs a current version, branch, customer, service and complete value',()=>{
 const c=ctx(),s=mobileState(c).state;
 const memory={id:'memory-1',version:2,status:'verified',business_id:ids.business,customer_id:ids.customer,branch_id:ids.branch,service_id:ids.service,expires_at:'2026-10-01T00:00:00Z'};
 s.entities.location={value:pin.value,source:'CUSTOMER_MEMORY',confidence:1,status:'active',memory_id:memory.id,memory_version:memory.version};
 for(const change of [{},{version:1},{status:'revoked'},{business_id:ids.other},{customer_id:'other'},{branch_id:'other'},{expires_at:'2025-01-01'}]){
  const profile={...c.activity_profile,verified_memory:[{...memory,...change}]};
  const result=resolveOperationalRequirements({business:c.business,service:c.services[0],delivery_mode:'MOBILE',current_state:s,profile,now});
  assert.equal(result.missing.includes('location'),Object.keys(change).length>0);
 }
});
test('service area checks reject out-of-area locations before availability',()=>{
 const area={type:'CIRCLE',center:{lat:24.453884,lng:54.377343},radius_km:5};
 assert.equal(serviceAreaCheck(pin.value,area).status,'AVAILABLE');assert.equal(serviceAreaCheck({lat:25.2,lng:55.3},area).status,'OUTSIDE_AREA');
 const c=ctx('car_wash',{service_area:{...area,center:{lat:25.2,lng:55.3}}});const r=mobileState(c);assert.equal(r.decision.action,'HANDOFF');assert.equal(r.decision.reasonCode,'SERVICE_AREA_OUTSIDE_AREA');
});
test('owner approval routes to staff before any booking mutation',()=>{
 const r=turn(ctx('salon',{owner_approval:true}),'أبا VIP باجر الساعة 5 مساء');assert.equal(r.decision.action,'HANDOFF');assert.equal(r.decision.reasonCode,'OWNER_APPROVAL_REQUIRED');
});
test('repeated unanswered requirement ends in handoff after a targeted clarification',()=>{
 const c=ctx();let r=turn(c,'أبا VIP باجر الساعة 5 مساء');r=turn(c,'ما فهمت',r.state);r=turn(c,'ما فهمت',r.state);
 assert.equal(r.decision.action,'HANDOFF');assert.equal(r.decision.reasonCode,'REPEATED_REQUIREMENT_EXTRACTION_FAILURE');
});
test('LLM cannot alter required fields or invent a GPS location',()=>{
 const c=ctx();const r=understandConversation({context:{...c,batch_messages:[{body:'أبا VIP باجر الساعة 5 مساء'}]},now,proposal:{intent:'BOOKING',confidence:1,required:[],missingFields:[],entities:[{entity:'location',value:pin.value,evidence:'VIP',confidence:1}]}});
 assert.deepEqual(r.state.missing_fields,['vehicle','location']);assert.notEqual(r.decision.action,'CREATE_BOOKING');
});
