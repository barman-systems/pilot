import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretConversationTurnV3,_v3InterpreterTest} from '../api/_dabbir-conversation-v3-interpreter.js';
import {understandTurnV3} from '../api/_dabbir-conversation-v3-understanding.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001'};
const services=[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name:'خارجي',name_ar:'خارجي',price:40,duration_minutes:30}];
const contracts=[{business_id:ids.business,branch_id:ids.branch,service_id:ids.service,delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',mode_requirements:{MOBILE:{required:['vehicle']}},entity_definitions:{vehicle:{type:'ENUM',values:['saloon','station']},location:{type:'VERIFIED_GPS'},date:{type:'DATE'},time:{type:'TIME'}}}];
function context(body='مرحبا',id='70000000-0000-4000-8000-000000000001'){return {business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai'},conversation:{id:ids.conversation,branch_id:ids.branch,language:'ar'},customer:{id:ids.customer},batch:{id:'60000000-0000-4000-8000-000000000001',last_message_at:'2026-09-11T16:46:39.467Z'},batch_messages:[{id,body,created_at:'2026-09-11T16:46:39.467Z'}],services,activity_profile:{services:contracts}};}
function previous(over={}){return {goal:'BOOK_SERVICE',intent_confirmed:true,facts:[{field:'service',status:'VERIFIED',value:ids.service,source:'CUSTOMER_CONFIRMED',confidence:1},{field:'delivery_mode',status:'VERIFIED',value:'MOBILE',source:'DATABASE_FACT',confidence:1}],tentatives:[],pending_question:{fields:['vehicle'],purpose:'COLLECT_VEHICLE'},last_turn_at:'2026-09-11T16:46:22.050Z',episode_id:'e1',episode_started_at:'2026-09-11T16:45:37.878Z',...over};}

test('provider-verified WhatsApp location is not reinterpreted as pending vehicle text',async()=>{
  const c=context('📍 موقع واتساب: 23.826294, 52.810448');
  c.location_receipts=[{message_id:c.batch_messages[0].id,business_id:ids.business,conversation_id:ids.conversation,value:{lat:23.826294,lng:52.810448,label:''}}];
  const interpreted=await interpretConversationTurnV3({context:c,previousState:previous(),generate:async()=>{throw new Error('location receipt must not call model')}});
  assert.equal(interpreted.proposal.dialogue.message_role,'CONTINUATION');
  assert.equal(interpreted.proposal.serviceSurface,null);
  const understood=understandTurnV3({context:{...c,v3_fast_facts:interpreted.fastFacts},proposal:interpreted.proposal,previousState:previous()});
  assert.equal(understood.facts.find(x=>x.field==='location')?.source,'PROVIDER_VERIFIED');
  assert.equal(understood.tentatives.some(x=>x.field==='vehicle'&&String(x.surface||'').includes('موقع واتساب')),false);
  assert.equal(understood.signals.pending_compatible,true);
});

test('surface-only generic noun cannot become an unresolved service candidate without semantic label',async()=>{
  const c=context('اباكم تغسلون السياره الحين');
  const output={intent:'BOOKING',role:'NEW_REQUEST',confidence:.92,service_candidate:{label:null,surface:'السياره',confidence:.88},entities:[],side_questions:[],invalidated_fields:[],requested_action:'NONE',confirmation:null};
  const out=await interpretConversationTurnV3({context:c,previousState:null,generate:async()=>({ok:true,reply:JSON.stringify(output),provider:'stub',model:'stub'})});
  assert.equal(out.proposal.serviceName,null);
  assert.equal(out.proposal.serviceSurface,null);
  assert.equal(out.proposal.serviceCandidateLabel,null);
});

test('provider omission of optional V3 arrays is normalized without weakening required intent role confidence',async()=>{
  const normalized=_v3InterpreterTest.normalizeModelContract({intent:'BOOKING',role:'ANSWER_TO_PENDING_QUESTION',confidence:.9});
  assert.deepEqual(normalized.entities,[]);assert.deepEqual(normalized.side_questions,[]);assert.deepEqual(normalized.invalidated_fields,[]);assert.equal(normalized.requested_action,'NONE');assert.equal(normalized.confirmation,null);assert.equal(normalized.service_candidate,null);
  assert.equal(_v3InterpreterTest.validModelContract(normalized,'ستيشن'),true);
});

test('side question does not get swallowed by pending time',()=>{
  const c=context('كم تاخذ وقت؟');
  const p=previous({pending_question:{fields:['time'],purpose:'COLLECT_WHEN'}});
  const proposal={intent:'BOOKING',action:'REPLY',confidence:.95,serviceName:null,serviceSurface:null,serviceCandidateLabel:null,serviceVerified:false,entities:[],serviceQuestion:{field:'duration_minutes',evidence:'كم تاخذ وقت؟'},dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:'كم تاخذ وقت؟',invalidated_fields:[]}};
  const out=understandTurnV3({context:c,proposal,previousState:p});
  assert.equal(out.side_questions[0]?.type,'duration_minutes');
  assert.equal(out.tentatives.some(x=>x.field==='time'&&x.surface==='كم تاخذ وقت؟'),false);
  assert.equal(out.signals.pending_compatible,false);
  assert.equal(out.goal,'BOOK_SERVICE');
});

test('one turn can satisfy pending time and ask service duration in parallel',()=>{
  const c=context('الساعة خمس، وكم تاخذ الخدمة؟');
  const p=previous({pending_question:{fields:['time'],purpose:'COLLECT_WHEN'}});
  const proposal={intent:'BOOKING',action:'REPLY',confidence:.97,serviceName:null,serviceSurface:null,serviceCandidateLabel:null,serviceVerified:false,entities:[{entity:'time',value:'17:00',evidence:'الساعة خمس',confidence:.95,correction:false}],serviceQuestion:{field:'duration_minutes',evidence:'كم تاخذ الخدمة؟'},dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:'الساعة خمس، وكم تاخذ الخدمة؟',invalidated_fields:[]}};
  const out=understandTurnV3({context:c,proposal,previousState:p});
  assert.equal(out.facts.find(x=>x.field==='time')?.value,'17:00');
  assert.equal(out.side_questions[0]?.type,'duration_minutes');
  assert.equal(out.signals.pending_compatible,true);
});
