import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTurnUnderstandingV3,runTurnUnderstandingShadowV3} from '../api/_dabbir-turn-understanding-v3.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001'};
const context=(text)=>({business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai'},conversation:{id:ids.conversation,branch_id:ids.branch},customer:{id:ids.customer},
  batch_messages:[{id:'60000000-0000-4000-8000-000000000001',body:text,created_at:'2026-09-11T04:10:11Z'}],services:[{id:ids.service,name:'خارجي'}],
  activity_profile:{source:'DATABASE_FACT',version:1,business_id:ids.business,branch_id:ids.branch,services:[{business_id:ids.business,branch_id:ids.branch,service_id:ids.service,delivery_modes:['MOBILE'],entity_definitions:{vehicle:{type:'ENUM',values:['saloon','station']},date:{type:'DATE'},time:{type:'TIME'}},contract_version:'v1'}]}});
const fact=(value,source='CUSTOMER_STATED',extra={})=>({value,source,status:'active',confidence:1,...extra});
const base={version:2,goal:'BOOK_SERVICE',clarification_entity:'vehicle',cognition:{pending_field:'vehicle'},entities:{service:fact(ids.service),delivery_mode:fact('MOBILE','DATABASE_FACT'),date:fact('2026-09-11','CUSTOMER_STATED',{grounded_by:'MESSAGE_RECEIPT_TIME'}),time:fact('08:10','CUSTOMER_STATED',{grounded_by:'MESSAGE_RECEIPT_TIME'})}};

const proposal=(surface,value='station')=>({confidence:.96,dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:surface},entities:[{entity:'vehicle',value,evidence:surface,confidence:.96,correction:false}]});

for(const surface of ['الاستيشن','استيشن'])test(`V3 retains semantic station candidate for ${surface} without closed lexical validator`,()=>{
  const snapshot=buildTurnUnderstandingV3({context:context(surface),previousState:base,legacyState:base,proposal:proposal(surface)});
  const vehicle=snapshot.tentative.find(f=>f.field==='vehicle');
  assert.equal(vehicle?.candidate_value,'station');
  assert.equal(vehicle?.surface,surface);
  assert.equal(vehicle?.status,'TENTATIVE');
  assert.ok(snapshot.facts.some(f=>f.field==='service'&&f.status==='VERIFIED'));
  assert.ok(snapshot.facts.some(f=>f.field==='delivery_mode'&&f.value==='MOBILE'));
  assert.ok(snapshot.facts.some(f=>f.field==='immediacy'&&f.value==='NOW'));
});

for(const surface of ['جيب شيروكي','وانيت','كامري','السيارة الكبيرة'])test(`V3 preserves unfamiliar Gulf vehicle surface instead of deleting it: ${surface}`,()=>{
  const snapshot=buildTurnUnderstandingV3({context:context(surface),previousState:base,legacyState:base,proposal:{confidence:.72,dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:surface},entities:[]}});
  const vehicle=snapshot.tentative.find(f=>f.field==='vehicle');
  assert.equal(vehicle?.surface,surface);
  assert.equal(vehicle?.candidate_value,null);
  assert.equal(vehicle?.resolution,'SEMANTIC_SURFACE_UNMAPPED');
});

test('V3 shadow runner reports invariant errors without mutating visible legacy decision',()=>{
  const result=runTurnUnderstandingShadowV3({context:context('استيشن'),previousState:base,legacyState:base,proposal:proposal('استيشن')});
  assert.equal(result.ok,true);
  assert.equal(result.snapshot.tentative.find(f=>f.field==='vehicle')?.candidate_value,'station');
});
