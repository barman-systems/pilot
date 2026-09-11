import test from 'node:test';
import assert from 'node:assert/strict';
import {createV3ShadowObserver} from '../api/_dabbir-v3-shadow-observer.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001',batch:'60000000-0000-4000-8000-000000000001'};
const context={batch:{id:ids.batch,last_message_at:'2026-09-11T04:10:11Z'},business:{id:ids.business,timezone:'Asia/Dubai'},conversation:{id:ids.conversation,branch_id:ids.branch},customer:{id:ids.customer},batch_messages:[{id:'70000000-0000-4000-8000-000000000001',body:'الاستيشن',created_at:'2026-09-11T04:10:11Z'}],services:[{id:ids.service,name:'خارجي'}]};
const before={version:2,goal:'BOOK_SERVICE',clarification_entity:'vehicle',cognition:{pending_field:'vehicle'},entities:{service:{value:ids.service,source:'CUSTOMER_STATED',status:'active',confidence:1}}};
const load={semantic_state:before,activity_profile:{source:'DATABASE_FACT',version:1,business_id:ids.business,branch_id:ids.branch,services:[{business_id:ids.business,branch_id:ids.branch,service_id:ids.service,delivery_modes:['MOBILE'],entity_definitions:{vehicle:{type:'ENUM',values:['saloon','station']}},contract_version:'v1'}]}};

test('shadow observer logs V3 result but returns the exact legacy RPC result',async()=>{
  const calls=[],logs=[];
  const rpc=async(name,args)=>{calls.push([name,args]);if(name==='dabbir_semantic_load_v2')return load;if(name==='dabbir_semantic_commit_v2')return {version:9,replay:false,state:args.p_state};return {ok:true};};
  const observer=createV3ShadowObserver({context,rpc,logger:{info:x=>logs.push(['info',x]),error:x=>logs.push(['error',x])}});
  await observer.rpc('dabbir_semantic_load_v2',{});
  observer.captureProposal({confidence:.95,dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:'الاستيشن'},entities:[{entity:'vehicle',value:'station',evidence:'الاستيشن',confidence:.95,correction:false}]});
  const legacy={...before,entities:{...before.entities,delivery_mode:{value:'MOBILE',source:'DATABASE_FACT',status:'active',confidence:1}}};
  const committed=await observer.rpc('dabbir_semantic_commit_v2',{p_batch_id:ids.batch,p_state:legacy});
  assert.equal(committed.version,9);
  assert.equal(calls.filter(x=>x[0]==='dabbir_semantic_commit_v2').length,1);
  assert.equal(logs.length,1);
  const event=JSON.parse(logs[0][1]);
  assert.equal(event.event,'DABBIR_V3_TURN_SHADOW');
  assert.equal(event.ok,true);
  assert.ok(event.tentative.some(x=>x.field==='vehicle'&&x.candidate_value==='station'));
});
