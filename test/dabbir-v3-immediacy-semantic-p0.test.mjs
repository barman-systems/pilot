import test from 'node:test';
import assert from 'node:assert/strict';
import {v3SemanticContractViolation} from '../api/_dabbir-conversation-v3-semantic-contract.js';
import {interpretConversationTurnV3,_v3InterpreterTest} from '../api/_dabbir-conversation-v3-interpreter.js';
import {freshConversationStateV3,understandTurnV3} from '../api/_dabbir-conversation-v3-understanding.js';
import {planConversationTurnV3} from '../api/_dabbir-conversation-v3-brain.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001'};
const contract={business_id:ids.business,branch_id:ids.branch,service_id:ids.service,activity_type:'car_wash',delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',mode_requirements:{MOBILE:{required:['vehicle']}},entity_definitions:{location:{type:'VERIFIED_GPS'},date:{type:'DATE'},time:{type:'TIME'},vehicle:{type:'ENUM',values:['saloon','station']}},contract_version:'v1'};
const service={id:ids.service,business_id:ids.business,branch_id:ids.branch,name:'خارجي',name_ar:'خارجي',price:40};
function context(body,createdAt){return {business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},conversation:{id:ids.conversation,branch_id:ids.branch,language:'ar'},customer:{id:ids.customer},services:[service],activity_profile:{services:[contract]},batch:{id:'60000000-0000-4000-8000-000000000001',last_message_at:createdAt},batch_messages:[{id:'70000000-0000-4000-8000-000000000001',body,created_at:createdAt}]};}

test('V3 semantic contract owns immediacy instead of forcing the model to invent a clock time',()=>{
  const good={intent:'BOOKING',role:'NEW_REQUEST',confidence:.99,service_candidate:null,entities:[{entity:'immediacy',value:'NOW',surface:'الحين',confidence:.99,correction:false}],side_questions:[],invalidated_fields:[],requested_action:'NONE',confirmation:null};
  assert.equal(v3SemanticContractViolation(JSON.stringify(good)),null);
  assert.equal(_v3InterpreterTest.validModelContract(good,'ابا اغسل سيارتي الحين'),true);
  const bad={...good,entities:[{...good.entities[0],value:'SOON'}]};
  assert.equal(v3SemanticContractViolation(JSON.stringify(bad)),'ENTITIES');
  assert.equal(_v3InterpreterTest.validModelContract(bad,'ابا اغسل سيارتي الحين'),false);
});

test('immediacy NOW is grounded from the message receipt time in the business timezone',async()=>{
  const at='2026-09-15T21:33:48.000Z',c=context('ابا اغسل سيارتي الحين',at);
  const semantic={intent:'BOOKING',role:'NEW_REQUEST',confidence:.99,service_candidate:null,entities:[{entity:'immediacy',value:'NOW',surface:'الحين',confidence:.99,correction:false}],side_questions:[],invalidated_fields:[],requested_action:'NONE',confirmation:null};
  const generate=async()=>({ok:true,reply:JSON.stringify(semantic),provider:'fixture',model:'fixture',telemetry:{}});
  const interpreted=await interpretConversationTurnV3({context:c,generate,now:new Date(at),env:{}});
  assert.deepEqual(interpreted.proposal.entities.map(x=>[x.entity,x.value,x.evidence]),[
    ['date','2026-09-16','الحين'],
    ['time','01:33','الحين'],
  ]);
  assert.equal(interpreted.proposal.entities.some(x=>x.entity==='immediacy'),false,'NOW is converted to grounded date/time before understanding');
});

test('live regression: الحين survives service selection instead of asking when again',async()=>{
  const firstAt='2026-09-15T21:33:48.000Z',c1=context('ابا اغسل سيارتي الحين',firstAt);
  const semantic={intent:'BOOKING',role:'NEW_REQUEST',confidence:.99,service_candidate:null,entities:[{entity:'immediacy',value:'NOW',surface:'الحين',confidence:.99,correction:false}],side_questions:[],invalidated_fields:[],requested_action:'NONE',confirmation:null};
  const interpreted=await interpretConversationTurnV3({context:c1,generate:async()=>({ok:true,reply:JSON.stringify(semantic),provider:'fixture',model:'fixture',telemetry:{}}),now:new Date(firstAt),env:{}});
  const fresh=freshConversationStateV3({context:c1,at:new Date(firstAt)});
  const u1=understandTurnV3({context:c1,proposal:interpreted.proposal,previousState:fresh,now:new Date(firstAt)});
  const p1=planConversationTurnV3({previousState:fresh,understanding:u1,episode:{kind:'NEW_EPISODE',reason:'TEST',idle_ms:null},context:c1});
  assert.equal(p1.state.facts.find(f=>f.field==='date')?.value,'2026-09-16');
  assert.equal(p1.state.facts.find(f=>f.field==='time')?.value,'01:33');
  assert.equal(p1.state.facts.find(f=>f.field==='immediacy')?.value,'NOW');
  assert.deepEqual(p1.plan.missing_fields,['service']);

  const secondAt='2026-09-15T21:34:09.000Z',c2=context('2',secondAt);
  const select={intent:'BOOKING',action:'REPLY',confidence:1,serviceName:'خارجي',serviceSurface:'2',serviceVerified:true,entities:[],serviceQuestion:null,serviceQuestions:[],dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:'2',invalidated_fields:[]}};
  const u2=understandTurnV3({context:c2,proposal:select,previousState:p1.state,now:new Date(secondAt)});
  const p2=planConversationTurnV3({previousState:p1.state,understanding:u2,episode:{kind:'CONTINUE',reason:'TEST',idle_ms:21_000},context:c2});
  assert.equal(p2.state.facts.find(f=>f.field==='immediacy')?.value,'NOW');
  assert.equal(p2.state.facts.find(f=>f.field==='date')?.value,'2026-09-16');
  assert.equal(p2.state.facts.find(f=>f.field==='time')?.value,'01:33');
  assert.equal(p2.plan.missing_fields.includes('date'),false);
  assert.equal(p2.plan.missing_fields.includes('time'),false);
  assert.deepEqual(p2.plan.missing_fields,['vehicle','location']);
});
