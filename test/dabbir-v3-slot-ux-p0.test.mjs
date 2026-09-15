import test from 'node:test';
import assert from 'node:assert/strict';
import {planConversationTurnV3} from '../api/_dabbir-conversation-v3-brain.js';
import {_aiFailureTest} from '../api/_dabbir-whatsapp-ai-core.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001'};
const contract={business_id:ids.business,branch_id:ids.branch,service_id:ids.service,activity_type:'car_wash',delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',mode_requirements:{MOBILE:{required:['vehicle']}},entity_definitions:{location:{type:'VERIFIED_GPS'},date:{type:'DATE'},time:{type:'TIME'},vehicle:{type:'ENUM',values:['saloon','station']}},contract_version:'v1'};
const context={business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},conversation:{id:ids.conversation,branch_id:ids.branch,language:'ar'},customer:{id:ids.customer},services:[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name:'خارجي',name_ar:'خارجي',price:40}],activity_profile:{source:'DATABASE_FACT',services:[contract]}};
const fact=(field,value,source='CUSTOMER_STATED',extra={})=>({field,status:'VERIFIED',value,source,confidence:1,resolution:'TEST',...extra});

test('a verified presented slot satisfies appointment date/time requirements',()=>{
  const previous={version:2,goal:'BOOK_SERVICE',intent_confirmed:true,episode_id:'e',episode_started_at:'2026-09-15T18:00:00Z',last_turn_at:'2026-09-15T18:46:31Z',facts:[fact('branch',ids.branch,'DATABASE_FACT'),fact('delivery_mode','MOBILE','DATABASE_FACT'),fact('service',ids.service,'CUSTOMER_CONFIRMED'),fact('vehicle','saloon'),fact('location',{lat:23.8,lng:52.8},'PROVIDER_VERIFIED',{receipt_id:'r'}),fact('date','2026-09-16','CUSTOMER_CORRECTION'),fact('time_window','MORNING','CUSTOMER_CORRECTION')],tentatives:[],pending_question:null};
  const slot=fact('slot',1,'CUSTOMER_CONFIRMED',{starts_at:'2026-09-16T04:30:00Z',service_id:ids.service});
  const understanding={goal:'BOOK_SERVICE',role:'CONTINUATION',signals:{booking_intent_strong:false,social_only:false},turn:{created_at:'2026-09-15T18:46:46Z',message_id:'m'},facts:[...previous.facts,slot],tentatives:[],invalidations:[],side_questions:[]};
  const out=planConversationTurnV3({previousState:previous,understanding,episode:{kind:'CONTINUE',reason:'TEST',idle_ms:15000},context});
  assert.equal(out.plan.missing_fields.includes('time'),false);
  assert.equal(out.plan.missing_fields.includes('date'),false);
  assert.equal(out.plan.next_question,null);
  assert.equal(out.plan.proposed_action,'READY_FOR_AUTHORITY');
});

test('slot list is a readable numbered WhatsApp list with one time per line',()=>{
  const slots=[
    {starts_at:'2026-09-16T04:00:00Z',timezone:'Asia/Dubai'},
    {starts_at:'2026-09-16T04:30:00Z',timezone:'Asia/Dubai'},
    {starts_at:'2026-09-16T05:00:00Z',timezone:'Asia/Dubai'},
  ];
  const text=_aiFailureTest.slotsText(slots,'ar');
  assert.match(text,/1[.)].*\n2[.)].*\n3[.)]/s);
  assert.match(text,/اختر رقم الموعد/);
});
