import assert from 'node:assert/strict';
import test from 'node:test';
import {activityContext} from './fixtures/understanding/activity.mjs';
import {understandConversation} from '../api/_dabbir-semantic-engine.js';
import {runUnderstandingTurn} from '../api/_dabbir-understanding-orchestrator.js';

const ids={
  business:'20000000-0000-4000-8000-000000000001',
  conversation:'30000000-0000-4000-8000-000000000001',
  customer:'40000000-0000-4000-8000-000000000001',
  branch:'50000000-0000-4000-8000-000000000001',
  service:'60000000-0000-4000-8000-000000000001',
};
const now=new Date('2026-09-09T01:10:00Z');
const services=[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name:'غسيل عادي',name_ar:'غسيل عادي',name_en:'Regular wash',price:60,duration_minutes:30}];
const memory=[
  {id:'81000000-0000-4000-8000-000000000001',business_id:ids.business,customer_id:ids.customer,branch_id:ids.branch,service_id:ids.service,memory_key:'last_verified_vehicle',value:{value:'saloon',branch_id:ids.branch,service_id:ids.service},source:'DATABASE_FACT',confidence:1,status:'verified',version:1,last_confirmed_at:'2026-09-09T01:05:31Z',expires_at:'2026-10-09T01:05:31Z'},
  {id:'81000000-0000-4000-8000-000000000002',business_id:ids.business,customer_id:ids.customer,branch_id:ids.branch,service_id:ids.service,memory_key:'last_verified_location',value:{value:{lat:24.186653,lng:52.626152},branch_id:ids.branch,service_id:ids.service},source:'DATABASE_FACT',confidence:1,status:'verified',version:1,last_confirmed_at:'2026-09-09T01:05:31Z',expires_at:'2026-10-09T01:05:31Z'},
];
function context({body='',verified_memory=memory,pending_state=null,history=[]}={}){
  return activityContext({
    business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},
    conversation:{id:ids.conversation,branch_id:ids.branch,state:'ai_active'},
    customer:{id:ids.customer},services,workers:[],branches:[],approved_aliases:[],knowledge:[],upcoming_appointments:[],
    verified_memory,pending_state,history,location_receipts:[],batch_messages:[{id:'90000000-0000-4000-8000-000000000001',body,language_body:body}],
  },{activity_type:'car_wash',delivery_modes:['MOBILE']});
}
function understand(body,previous=null,extra={}){
  return understandConversation({context:context({body,...extra}),previous,now});
}

test('production regression: Arabic morning greeting is a deterministic dialogue act, never a booking guess',async()=>{
  const replies=[];let plannerCalls=0,persisted=null,version=0;
  const rpc=async(name,args)=>{
    if(name==='dabbir_semantic_load_v2')return {semantic_state:persisted||{},version,message_revision:1};
    if(name==='dabbir_semantic_commit_v2'){persisted=args.p_state;version++;return {version,state:persisted,replay:false};}
    if(name==='dabbir_semantic_assert_current_v2')return true;
    return true;
  };
  const result=await runUnderstandingTurn({
    claim:{batch_id:'batch',lock_token:'lock',attempt_count:1},context:context({body:'صباح الخير'}),rpc,
    deliver:async(_claim,_ctx,body)=>{replies.push(body);return {providerMessageId:'wamid.greeting'};},
    finish:async()=>true,handoff:async()=>{throw new Error('greeting must not hand off');},
    bookingText:()=>{throw new Error('greeting must not book');},slotsText:()=>'',
    planner:async()=>{plannerCalls++;throw new Error('greeting must not call semantic provider');},now:()=>now,
  });
  assert.equal(result.action,'REPLY');
  assert.equal(plannerCalls,0);
  assert.deepEqual(replies,['صباح النور، حياك. كيف أقدر أخدمك؟']);
});

test('production regression: “حجز ثاني اليوم بعد” is a new booking, not ordinal option two',()=>{
  const result=understand('ابا حجز ثاني اليوم بعد',null,{verified_memory:[]});
  assert.equal(result.state.intent,'BOOKING');
  assert.equal(result.state.entities.date.value,'2026-09-09');
  assert.ok(!result.state.unresolved_references.includes('offered_option'));
  assert.ok(!result.state.unresolved_references.includes('multiple_options'));
  assert.equal(result.decision.action,'CLARIFY');
  assert.equal(result.state.clarification_entity,'service');
  assert.equal(result.decision.reply,'أي خدمة تناسبك؟');
});

test('production regression: “نفس السيارة والموقع” reuses both verified facts in one turn',()=>{
  const result=understand('ابا احجز غسيل عادي اليوم نفس السيارة والموقع الساعة 5');
  assert.equal(result.state.entities.vehicle.value,'saloon');
  assert.equal(result.state.entities.vehicle.source,'CUSTOMER_MEMORY');
  assert.deepEqual(result.state.entities.location.value,{lat:24.186653,lng:52.626152});
  assert.equal(result.state.entities.location.source,'CUSTOMER_MEMORY');
  assert.equal(result.state.entities.time.value,null);
  assert.equal(result.state.entities.time.part,'am_pm');
  assert.equal(result.decision.action,'CLARIFY');
  assert.equal(result.state.clarification_entity,'time');
  assert.match(result.decision.reply,/5 صباحًا أو مساءً/);
});

test('production regression: a completed booking cannot leak its AM period into a new “الساعة 5” request',()=>{
  const first=understand('ابا احجز غسيل عادي باجر نفس السيارة والموقع الساعة 5 صباح');
  const previous={
    ...first.state,
    updated_at:'2026-09-09T01:09:00.000Z',
    last_verified_action:{action:'CREATE_BOOKING',at:'2026-09-09T01:05:31.926Z',appointment_id:'190386d1-c1f9-4d05-9c40-4d6c2f74f7dd',source:'DATABASE_FACT'},
    last_verified_outcome:{at:'2026-09-09T01:05:31.926Z',status:'confirmed',source:'DATABASE_FACT'},
  };
  const result=understand('ابا احجز غسيل عادي اليوم نفس السيارة والموقع الساعة 5',previous);
  assert.equal(result.state.entities.date.value,'2026-09-09');
  assert.equal(result.state.entities.time.value,null);
  assert.equal(result.state.entities.time.part,'am_pm');
  assert.equal(result.decision.action,'CLARIFY');
  assert.match(result.decision.reply,/5 صباحًا أو مساءً/);
});

test('production regression: affirmative intent confirmation continues the asked booking instead of falling back to generic help',()=>{
  const seeded=understand('ابا احجز غسيل عادي باجر نفس السيارة والموقع الساعة 5 صباح').state;
  const previous={
    ...seeded,
    intent:'BOOKING',goal:'BOOK_SERVICE',intent_confirmed:false,clarification_entity:'intent_confirmation',pending_action:'CLARIFY',
    updated_at:'2026-09-09T01:09:00.000Z',
    last_verified_action:{action:'CREATE_BOOKING',at:'2026-09-09T01:05:31.926Z',appointment_id:'190386d1-c1f9-4d05-9c40-4d6c2f74f7dd',source:'DATABASE_FACT'},
  };
  const result=understand('نعم',previous,{verified_memory:[]});
  assert.equal(result.state.intent,'BOOKING');
  assert.equal(result.state.intent_confirmed,true);
  assert.equal(result.state.entities.date,undefined);
  assert.equal(result.state.entities.time,undefined);
  assert.equal(result.state.clarification_entity,'service');
  assert.equal(result.decision.reply,'أي خدمة تناسبك؟');
});

test('production regression: requirement acknowledgement never exposes raw ISO date while asking for vehicle',()=>{
  const result=understand('ابا احجز غسيل عادي اليوم',null,{verified_memory:[]});
  assert.equal(result.state.clarification_entity,'vehicle');
  assert.equal(result.decision.reply,'تمام، اخترت غسيل عادي. السيارة صالون ولا ستيشن/SUV؟');
  assert.doesNotMatch(result.decision.reply,/2026-09-09/);
});
