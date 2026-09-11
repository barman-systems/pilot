import test from 'node:test';
import assert from 'node:assert/strict';
import {createV3ShadowObserver} from '../api/_dabbir-v3-shadow-observer.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001',batch:'60000000-0000-4000-8000-000000000001'};
const context={batch:{id:ids.batch,last_message_at:'2026-09-11T04:10:11Z'},business:{id:ids.business,timezone:'Asia/Dubai',currency_code:'AED'},conversation:{id:ids.conversation,branch_id:ids.branch},customer:{id:ids.customer},batch_messages:[{id:'70000000-0000-4000-8000-000000000001',body:'الاستيشن',created_at:'2026-09-11T04:10:11Z'}],services:[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name:'خارجي',price:40}]};
const before={version:2,goal:'BOOK_SERVICE',updated_at:'2026-09-11T04:09:59Z',clarification_entity:'vehicle',cognition:{pending_field:'vehicle'},entities:{service:{value:ids.service,source:'CUSTOMER_STATED',status:'active',confidence:1},delivery_mode:{value:'MOBILE',source:'DATABASE_FACT',status:'active',confidence:1},date:{value:'2026-09-11',source:'CUSTOMER_STATED',status:'active',confidence:1},time:{value:'08:10',source:'CUSTOMER_STATED',status:'active',confidence:1}}};
const load={cognitive_policy:{mode:'canary'},semantic_state:before,activity_profile:{source:'DATABASE_FACT',version:1,business_id:ids.business,branch_id:ids.branch,services:[{business_id:ids.business,branch_id:ids.branch,service_id:ids.service,delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',mode_requirements:{MOBILE:{required:['vehicle']}},entity_definitions:{vehicle:{type:'ENUM',values:['saloon','station']},location:{type:'VERIFIED_GPS'},date:{type:'DATE'},time:{type:'TIME'}},contract_version:'v1'}]}};

test('observer logs Phase 1 and Phase 2 and persists bounded non-authoritative V3 shadow state',async()=>{
  const calls=[],logs=[];
  const rpc=async(name,args)=>{calls.push([name,args]);if(name==='dabbir_semantic_load_v2')return load;if(name==='dabbir_semantic_commit_v2')return {version:9,replay:false,state:args.p_state};return {ok:true};};
  const observer=createV3ShadowObserver({context,rpc,logger:{info:x=>logs.push(['info',x]),error:x=>logs.push(['error',x])}});
  await observer.rpc('dabbir_semantic_load_v2',{});
  observer.captureProposal({intent:'BOOKING',action:'CLARIFY',confidence:.95,dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:'الاستيشن'},entities:[{entity:'vehicle',value:'station',evidence:'الاستيشن',confidence:.95,correction:false}]});
  const committed=await observer.rpc('dabbir_semantic_commit_v2',{p_batch_id:ids.batch,p_state:{...before,cognition:{...before.cognition,decision:{reply:'تمام. أي سيارة نخدم لك؟',reasonCode:'GOAL_DRIVEN_NEXT_BEST_QUESTION'}}}});
  assert.equal(committed.version,9);assert.ok(committed.state.v3_shadow);assert.equal(committed.state.v3_shadow.tentatives.find(x=>x.field==='vehicle')?.candidate_value,'station');
  assert.equal(logs.length,2);
  const turn=JSON.parse(logs[0][1]),dialogue=JSON.parse(logs[1][1]);
  assert.equal(turn.event,'DABBIR_V3_TURN_SHADOW');assert.equal(dialogue.event,'DABBIR_V3_DIALOGUE_SHADOW');assert.equal(dialogue.state_persisted,true);
  assert.equal(dialogue.response.source,'CONVERSATION_BRAIN_V3');assert.doesNotMatch(dialogue.response.text,/أي سيارة نخدم لك/);assert.equal(dialogue.legacy.reply,'تمام. أي سيارة نخدم لك؟');
});

test('shadow observer never blocks legacy commit even if logger throws',async()=>{
  const rpc=async(name,args)=>name==='dabbir_semantic_load_v2'?load:name==='dabbir_semantic_commit_v2'?{version:10,replay:false,state:args.p_state}:{ok:true};
  const observer=createV3ShadowObserver({context,rpc,logger:{info(){throw new Error('LOGGER_FAIL')},error(){throw new Error('LOGGER_FAIL')}}});
  await observer.rpc('dabbir_semantic_load_v2',{});
  const committed=await observer.rpc('dabbir_semantic_commit_v2',{p_batch_id:ids.batch,p_state:before});
  assert.equal(committed.version,10);
});

test('cognitive_mode off disables V3 observation and persistence',async()=>{
  const logs=[];const offLoad={...load,cognitive_policy:{mode:'off'}};
  const rpc=async(name,args)=>name==='dabbir_semantic_load_v2'?offLoad:name==='dabbir_semantic_commit_v2'?{version:11,replay:false,state:args.p_state}:{ok:true};
  const observer=createV3ShadowObserver({context,rpc,logger:{info:x=>logs.push(x),error:x=>logs.push(x)}});
  await observer.rpc('dabbir_semantic_load_v2',{});
  const committed=await observer.rpc('dabbir_semantic_commit_v2',{p_batch_id:ids.batch,p_state:before});
  assert.equal(committed.version,11);assert.equal(committed.state.v3_shadow,undefined);assert.deepEqual(logs,[]);
});
