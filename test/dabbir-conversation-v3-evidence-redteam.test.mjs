import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretConversationTurnV3} from '../api/_dabbir-conversation-v3-interpreter.js';
import {understandTurnV3} from '../api/_dabbir-conversation-v3-understanding.js';

const at='2026-09-12T10:00:00Z';
function context(body){return {business:{id:'business-a',timezone:'Asia/Dubai'},conversation:{id:'conversation-a',branch_id:'branch-a'},batch_messages:[{id:'message-a',body,created_at:at}],services:[],activity_profile:{services:[]}};}
function previous(field='vehicle',facts=[]){return {goal:'BOOK_SERVICE',intent_confirmed:true,facts,tentatives:[],pending_question:{fields:[field],purpose:'COLLECT_DETAILS'}};}
function contract(overrides={}){return {intent:'BOOKING',role:'ANSWER_TO_PENDING_QUESTION',confidence:.95,service_candidate:null,entities:[],side_questions:[],invalidated_fields:[],requested_action:'NONE',confirmation:null,...overrides};}
async function turn(body,output,state=previous(),extras={}){
  const c={...context(body),...extras};
  const interpreted=await interpretConversationTurnV3({context:c,previousState:state,generate:async()=>({ok:true,reply:JSON.stringify(output),provider:'redteam-fixture',model:'fixture'})});
  return {interpreted,understood:understandTurnV3({context:{...c,v3_fast_facts:interpreted.fastFacts},proposal:interpreted.proposal,previousState:state})};
}

for(const field of ['entities','side_questions','invalidated_fields']){
  for(const value of ['vehicle',{field:'date'},true,0]){
    test(`redteam: malformed ${field} (${typeof value}) fails closed through public interpreter`,async()=>{
      await assert.rejects(turn('غير الموعد',contract({[field]:value})),{code:'V3_INTERPRETER_CONTRACT_INVALID'});
    });
  }
}
for(const field of ['intent','role','confidence']){
  test(`redteam: optional defaults never invent mandatory ${field}`,async()=>{
    const output={intent:'BOOKING',role:'ANSWER_TO_PENDING_QUESTION',confidence:.95};delete output[field];
    await assert.rejects(turn('تفاصيل جديدة',output),{code:'V3_INTERPRETER_CONTRACT_INVALID'});
  });
}
test('redteam: omitted optional fields preserve unmapped customer answer',async()=>{
  const {understood}=await turn('تفاصيل جديدة',{intent:'BOOKING',role:'ANSWER_TO_PENDING_QUESTION',confidence:.95});
  assert.equal(understood.tentatives.find(x=>x.field==='vehicle')?.surface,'تفاصيل جديدة');
});

for(const type of ['price','duration_minutes','availability']){
  for(const field of ['vehicle','time','property_details']){
    test(`redteam: ${type} question cannot populate unrelated ${field}`,async()=>{
      const body='عندي سؤال عن الخدمة';
      const {understood}=await turn(body,contract({side_questions:[{type,surface:body}]}),previous(field));
      assert.equal(understood.side_questions.some(q=>q.type===type),true);
      assert.equal(understood.tentatives.some(x=>x.field===field),false);
      assert.equal(understood.goal,'BOOK_SERVICE');
    });
  }
}
test('redteam: multiple explicit questions survive together with a real pending answer',async()=>{
  const body='الساعة خمس، كم السعر وكم المدة؟';
  const {understood}=await turn(body,contract({entities:[{entity:'time',value:'17:00',surface:'الساعة خمس',confidence:.95,correction:false}],side_questions:[{type:'price',surface:'كم السعر'},{type:'duration_minutes',surface:'كم المدة'}]}),previous('time'));
  assert.equal(understood.facts.find(x=>x.field==='time')?.value,'17:00');
  assert.deepEqual(understood.side_questions.map(q=>q.type),['price','duration_minutes']);
  assert.equal(understood.tentatives.some(x=>x.field==='time'),false);
});
test('redteam: explicit invalidation is independent evidence, not an unrelated vehicle answer',async()=>{
  const state=previous('vehicle',[{field:'date',status:'VERIFIED',value:'2026-09-12',source:'CUSTOMER_STATED'}]);
  const {understood}=await turn('مو اليوم',contract({invalidated_fields:['date']}),state);
  assert.equal(understood.facts.some(x=>x.field==='date'),false);
  assert.equal(understood.invalidations.some(x=>x.field==='date'),true);
  assert.equal(understood.tentatives.some(x=>x.field==='vehicle'),false);
});
for(const override of [{business_id:'business-b'},{conversation_id:'conversation-b'},{message_id:'old-message'}]){
  test(`redteam: mismatched location receipt is not trusted (${Object.keys(override)[0]})`,async()=>{
    const receipt={business_id:'business-a',conversation_id:'conversation-a',message_id:'message-a',value:{lat:24,lng:54},...override};
    const {interpreted,understood}=await turn('موقع',contract({role:'CONTINUATION'}),previous(),{location_receipts:[receipt]});
    assert.equal(interpreted.fastFacts.length,0);
    assert.equal(understood.facts.some(x=>x.field==='location'),false);
  });
}
test('redteam: valid signed receipt retains location without inventing a service or vehicle',async()=>{
  const receipt={business_id:'business-a',conversation_id:'conversation-a',message_id:'message-a',value:{lat:24,lng:54}};
  const {interpreted,understood}=await turn('موقع',null,previous(),{location_receipts:[receipt]});
  assert.equal(interpreted.provider,'deterministic-v3-fast-path');
  assert.equal(understood.facts.find(x=>x.field==='location')?.source,'PROVIDER_VERIFIED');
  assert.equal(understood.tentatives.some(x=>['service','vehicle'].includes(x.field)),false);
});
