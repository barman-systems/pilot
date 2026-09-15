import test from 'node:test';
import assert from 'node:assert/strict';
import {understandTurnV3} from '../api/_dabbir-conversation-v3-understanding.js';
import {planConversationTurnV3} from '../api/_dabbir-conversation-v3-brain.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001'};
const service={id:ids.service,business_id:ids.business,branch_id:ids.branch,name:'خارجي',name_ar:'خارجي',price:40};
const contract={business_id:ids.business,branch_id:ids.branch,service_id:ids.service,delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',mode_requirements:{MOBILE:{required:['vehicle']}},entity_definitions:{vehicle:{type:'ENUM',values:['saloon','station']},location:{type:'VERIFIED_GPS'},date:{type:'DATE'},time:{type:'TIME'}},contract_version:'v1'};
const fact=(field,value,source='CUSTOMER_CONFIRMED',extra={})=>({field,status:'VERIFIED',value,source,confidence:1,...extra});
function context(text,at='2026-09-15T06:00:00Z',language='ar'){return {business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},conversation:{id:ids.conversation,branch_id:ids.branch,language},customer:{id:ids.customer},batch:{last_message_at:at},batch_messages:[{id:'60000000-0000-4000-8000-000000000001',body:text,created_at:at}],services:[service],activity_profile:{services:[contract]}};}
function previous({pending=['vehicle'],facts=[]}={}){return {version:2,goal:'BOOK_SERVICE',intent_confirmed:true,episode_id:'episode-1',episode_started_at:'2026-09-15T05:55:00Z',last_turn_at:'2026-09-15T05:59:00Z',facts:[fact('branch',ids.branch,'DATABASE_FACT'),fact('service',ids.service),fact('delivery_mode','MOBILE','DATABASE_FACT'),...facts],tentatives:[],pending_question:{fields:pending,purpose:pending.includes('vehicle')?'COLLECT_VEHICLE':'COLLECT_WHEN'}};}
function proposal({role='ANSWER_TO_PENDING_QUESTION',entities=[]}={}){return {intent:'BOOKING',action:'REPLY',confidence:.99,entities,dialogue:{message_role:role,evidence:null,invalidated_fields:[]}};}
const entity=(entity,value,evidence,confidence=.99)=>({entity,value,evidence,confidence,correction:false});
const episode={kind:'CONTINUE',reason:'SEMANTIC_ANSWER_TO_PENDING_QUESTION',idle_ms:1000};

for(const [surface,value] of [['صالون','saloon'],['لستيشن','station']])test(`direct vehicle enum answer ${surface} is accepted without confirmation`,()=>{
  const c=context(surface),p=previous({facts:[fact('date','2026-09-15'),fact('time','10:00')]});
  const u=understandTurnV3({context:c,proposal:proposal({entities:[entity('vehicle',value,surface)]}),previousState:p});
  const r=planConversationTurnV3({previousState:p,understanding:u,episode,context:c});
  const vehicle=r.state.facts.find(x=>x.field==='vehicle');
  assert.equal(vehicle?.value,value);assert.equal(vehicle?.resolution,'DIRECT_PENDING_ENUM_ANSWER');assert.equal(vehicle?.source,'CUSTOMER_STATED');
  assert.equal(r.state.tentatives.some(x=>x.field==='vehicle'),false);assert.deepEqual(r.plan.next_question.fields,['location']);
  assert.doesNotMatch(r.response.text,/صح[؟?]?/);assert.match(r.response.text,/موقع/);
});

test('model cannot silently map a car model name to a vehicle enum',()=>{
  const c=context('كامري'),p=previous({facts:[fact('date','2026-09-15'),fact('time','10:00')]});
  const u=understandTurnV3({context:c,proposal:proposal({entities:[entity('vehicle','saloon','كامري')]}),previousState:p});
  const r=planConversationTurnV3({previousState:p,understanding:u,episode,context:c});
  assert.equal(r.state.facts.some(x=>x.field==='vehicle'),false);assert.equal(r.state.tentatives.find(x=>x.field==='vehicle')?.candidate_value,'saloon');
  assert.equal(r.plan.next_question.purpose,'CONFIRM_TENTATIVE_VEHICLE');assert.match(r.response.text,/صح[؟?]?/);
});

test('when the date is known and only time is missing, Arabic clarification asks for the hour',()=>{
  const c=context('اليوم'),p=previous({pending:['date','time'],facts:[fact('vehicle','saloon'),fact('location',{lat:24.1,lng:52.6},'PROVIDER_VERIFIED',{receipt_id:'location-1'})]});
  const u=understandTurnV3({context:c,proposal:proposal({entities:[entity('date','2026-09-15','اليوم')]}),previousState:p});
  const r=planConversationTurnV3({previousState:p,understanding:u,episode,context:c});
  assert.deepEqual(r.plan.missing_fields,['time']);assert.deepEqual(r.plan.next_question.fields,['time']);
  assert.match(r.response.text,/أي ساعة/);assert.doesNotMatch(r.response.text,/متى تبيه/);
});
