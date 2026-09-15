import test from 'node:test';
import assert from 'node:assert/strict';
import {v3SemanticContractViolation} from '../api/_dabbir-conversation-v3-semantic-contract.js';
import {_v3InterpreterTest} from '../api/_dabbir-conversation-v3-interpreter.js';
import {_v3RuntimeTest} from '../api/_dabbir-conversation-v3-runtime.js';

const ids={business:'10000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001'};
const fact=(field,value,source='CUSTOMER_STATED')=>({field,value,status:'VERIFIED',source,confidence:1});
const readyState=(extra=[])=>({goal:'BOOK_SERVICE',facts:[fact('service',ids.service,'CUSTOMER_CONFIRMED'),fact('date','2026-09-15'),fact('time','21:34'),fact('location',{lat:23.8,lng:52.8},'PROVIDER_VERIFIED'),...extra]});
const readyPlan={proposed_action:'READY_FOR_AUTHORITY',missing_fields:[],required_fields:['service','date','time','location']};
const interpretation=(over={})=>({proposal:{intent:'BOOKING',action:'REPLY',entities:[],serviceQuestions:[],dialogue:{message_role:'CONTINUATION',evidence:'x'},...over},fastFacts:[]});

test('semantic contract accepts bounded business-hours read intent',()=>{
  const payload={intent:'SUPPORT',role:'SIDE_QUESTION',confidence:.99,service_candidate:null,entities:[],side_questions:[{type:'business_hours',surface:'متى تسكر؟'}],invalidated_fields:[],requested_action:'NONE',confirmation:null};
  assert.equal(v3SemanticContractViolation(JSON.stringify(payload)),null);
  assert.equal(_v3InterpreterTest.validModelContract(payload,'متى تسكر؟'),true);
});

test('ready booking plus business-hours read cannot inherit CHECK_AVAILABILITY',()=>{
  const i=interpretation({serviceQuestions:[{field:'business_hours',evidence:'متى تسكر؟'}],dialogue:{message_role:'SIDE_QUESTION',evidence:'متى تسكر؟'}});
  const authority=_v3RuntimeTest.deriveCurrentTurnAuthority({interpretation:i});
  assert.equal(authority.read,'BUSINESS_HOURS');
  assert.equal(_v3RuntimeTest.inheritedOperationalAction({state:readyState(),plan:readyPlan}),'CHECK_AVAILABILITY');
  assert.equal(_v3RuntimeTest.authorityAction({state:readyState(),plan:readyPlan,authority}),'REPLY');
});

test('ready booking plus availability discovery cannot re-run narrow inherited action',()=>{
  const i=interpretation({serviceQuestions:[{field:'availability',evidence:'شو الوقت المتاح عندك'}],dialogue:{message_role:'SIDE_QUESTION',evidence:'شو الوقت المتاح عندك'}});
  const authority=_v3RuntimeTest.deriveCurrentTurnAuthority({interpretation:i});
  assert.equal(authority.read,'AVAILABILITY_DISCOVERY');
  assert.equal(_v3RuntimeTest.authorityAction({state:readyState(),plan:readyPlan,authority}),'REPLY');
});

test('unsupported side read fails to REPLY instead of executing stale readiness',()=>{
  const i=interpretation({dialogue:{message_role:'SIDE_QUESTION',evidence:'عندكم شي ثاني؟'}});
  const authority=_v3RuntimeTest.deriveCurrentTurnAuthority({interpretation:i});
  assert.equal(authority.read,'UNKNOWN_READ');
  assert.equal(_v3RuntimeTest.authorityAction({state:readyState(),plan:readyPlan,authority}),'REPLY');
});

test('verified WhatsApp location is current-turn progress and still authorizes availability',()=>{
  const i=interpretation();i.fastFacts=[{field:'location',source:'PROVIDER_VERIFIED',value:{lat:23.8,lng:52.8}}];
  const authority=_v3RuntimeTest.deriveCurrentTurnAuthority({interpretation:i});
  assert.equal(authority.evidence_source,'STRUCTURED_LOCATION_RECEIPT');
  assert.equal(authority.goal_progress,true);
  assert.equal(_v3RuntimeTest.authorityAction({state:readyState(),plan:readyPlan,authority}),'CHECK_AVAILABILITY');
});

test('only a current presented slot selection can authorize CREATE_BOOKING',()=>{
  const state=readyState([fact('slot',1,'CUSTOMER_CONFIRMED')]),i=interpretation();i.fastFacts=[{field:'slot',source:'CUSTOMER_CONFIRMED',value:1}];
  const authority=_v3RuntimeTest.deriveCurrentTurnAuthority({interpretation:i});
  assert.equal(authority.slot_selected,true);
  assert.equal(_v3RuntimeTest.authorityAction({state,plan:readyPlan,authority}),'CREATE_BOOKING');
  assert.equal(_v3RuntimeTest.authorityAction({state,plan:readyPlan,authority:{read:null,goal_progress:false,slot_selected:false,explicit_mutation:null}}),'REPLY');
});

test('explicit current cancellation remains eligible for the existing safe handoff path',()=>{
  const i=interpretation({intent:'CANCEL_BOOKING',action:'CANCEL_BOOKING',dialogue:{message_role:'CANCELLATION',evidence:'ألغي الحجز'}}),authority=_v3RuntimeTest.deriveCurrentTurnAuthority({interpretation:i});
  assert.equal(authority.explicit_mutation,'CANCEL_BOOKING');
  assert.equal(_v3RuntimeTest.authorityAction({state:{goal:'CANCEL_BOOKING',facts:[]},plan:{proposed_action:'READY_FOR_AUTHORITY'},authority}),'HANDOFF');
});

test('business-hours reply is built only from approved owner knowledge',()=>{
  const context={knowledge:[{key:'business_hours',source:'owner_approved',confidence:1,value:{text:'Sunday 08:00-18:00; Monday 08:00-18:00; Tuesday 08:00-18:00; Wednesday 08:00-18:00; Thursday 08:00-18:00; Friday 08:00-18:00; Saturday 08:00-18:00'}}]};
  assert.equal(_v3RuntimeTest.businessHoursReply(context,'ar'),'ساعات العمل: من 08:00 إلى 18:00 يوميًا.');
  assert.equal(_v3RuntimeTest.businessHoursReply({knowledge:[{key:'business_hours',source:'model',confidence:1,value:{text:'08:00-22:00'}}]},'ar'),null);
});

test('availability discovery skips past empty day and searches next grounded dates read-only',async()=>{
  const calls=[],at=new Date('2026-09-15T17:37:46Z'),state={facts:[fact('service',ids.service,'CUSTOMER_CONFIRMED'),fact('date','2026-09-15')]},context={business:{id:ids.business,timezone:'Asia/Dubai'},conversation:{id:ids.conversation}};
  const rpc=async(name,args)=>{assert.equal(name,'dabbir_whatsapp_ai_find_available_options_v1');calls.push(args.p_requested_date);if(args.p_requested_date==='2026-09-15')return {state:'NO_SLOTS',slots:[{starts_at:'2026-09-15T04:00:00Z'}]};return {state:'OPTIONS_FOUND',slots:[{starts_at:'2026-09-16T04:00:00Z',service_id:ids.service}]};};
  const result=await _v3RuntimeTest.discoverAvailability({rpc,state,context,at});
  assert.deepEqual(calls,['2026-09-15','2026-09-16']);assert.equal(result.state,'OPTIONS_FOUND');assert.equal(result.date,'2026-09-16');assert.equal(result.slots.length,1);
});
