import {activityContext} from './fixtures/understanding/activity.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runUnderstandingTurn, SEMANTIC_SESSION_IDLE_MS } from '../api/_dabbir-understanding-orchestrator.js';

const ids={
  business:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',
  customer:'40000000-0000-4000-8000-000000000001',branch:'50000000-0000-4000-8000-000000000001',
  home:'60000000-0000-4000-8000-000000000001',carpet:'60000000-0000-4000-8000-000000000002',
};
const services=[
  {id:ids.home,business_id:ids.business,branch_id:ids.branch,name_ar:'تنظيف منزل',price:20},
  {id:ids.carpet,business_id:ids.business,branch_id:ids.branch,name_ar:'غسيل سجاد',price:40},
];
const turnAt=new Date('2026-09-08T10:30:00Z');
const stalePresentation={
  pending_action:'choose_service',expires_at:'2026-09-08T09:15:00Z',
  payload:{services:services.map(s=>({id:s.id,label:s.name_ar})),presented:true,provider_message_id:'meta-old'},
};
const livePresentation={...stalePresentation,expires_at:'2026-09-08T10:45:00Z',payload:{...stalePresentation.payload,provider_message_id:'meta-live'}};
function previous(updatedAt='2026-09-08T09:00:00Z'){
  return {
    version:2,revision:7,scope:{business_id:ids.business,conversation_id:ids.conversation,customer_id:ids.customer,branch_id:ids.branch},
    goal:'UNKNOWN',intent:'SERVICE_DISCOVERY',sub_intent:null,
    entities:{
      service:{value:ids.carpet,label:'غسيل سجاد',source:'CUSTOMER_STATED',status:'active',confidence:.98,updated_at:updatedAt,grounded_by:'DATABASE_FACT'},
      price:{value:40,source:'DATABASE_FACT',status:'active',confidence:1,updated_at:updatedAt},
      time:{value:null,hour:2,minute:0,part:'am_pm',source:'CUSTOMER_STATED',status:'unresolved',confidence:.55,updated_at:updatedAt},
    },
    pending_action:null,missing_fields:[],unresolved_references:[],user_corrections:[],business_constraints:[],owner_policies:[],last_confirmed_facts:{},
    last_verified_action:null,last_verified_outcome:null,language:'ar',dialect:'GCC',overall_confidence:.98,semantic_confidence:.98,operational_confidence:.98,
    created_at:'2026-09-08T08:00:00Z',updated_at:updatedAt,expires_at:'2026-09-09T08:00:00Z',
  };
}
function harness({text,semantic=previous(),pending=stalePresentation,at=turnAt}={}){
  const calls=[],replies=[];let committed=null,plannerCalls=0;
  const context=activityContext({
    business:{id:ids.business,timezone:'Asia/Dubai',business_type:'services',currency_code:'AED'},
    conversation:{id:ids.conversation,branch_id:ids.branch,state:'ai_active'},customer:{id:ids.customer},services,workers:[],
    pending_state:pending,batch_messages:[{body:text,created_at:at.toISOString()}],history:[],knowledge:[],
  });
  const claim={batch_id:'70000000-0000-4000-8000-000000000001',lock_token:'80000000-0000-4000-8000-000000000001',attempt_count:1};
  const rpc=async(name,args)=>{
    calls.push({name,args});
    if(name==='dabbir_semantic_load_v2')return {semantic_state:semantic||{},version:7,message_revision:9,verified_memory:[],approved_aliases:[],branches:[]};
    if(name==='dabbir_semantic_commit_v2'){committed=args.p_state;return {version:8,state:committed,replay:false};}
    if(name==='dabbir_semantic_assert_current_v2')return true;
    if(name==='dabbir_semantic_set_pending_v2')return {pending_action:args.p_action};
    if(name==='dabbir_record_ai_operator_decision_v1')return true;
    throw new Error('UNEXPECTED_RPC:'+name);
  };
  const run=()=>runUnderstandingTurn({
    claim,context,rpc,now:()=>at,
    deliver:async(_claim,_context,body)=>{replies.push(body);return {providerMessageId:'meta-reply'};},
    deliverMenu:async()=>{throw new Error('MENU_MUST_NOT_BE_SENT');},resolveProduct:null,
    finish:async()=>true,handoff:async()=>true,bookingText:()=>'',slotsText:()=>'',
    planner:async()=>{plannerCalls++;throw new Error('PLANNER_MUST_NOT_RUN');},
  });
  return {run,calls,replies,get committed(){return committed;},get plannerCalls(){return plannerCalls;}};
}

test('production regression: idle service discovery followed by السلام عليكم starts a fresh semantic session',async()=>{
  assert.equal(SEMANTIC_SESSION_IDLE_MS,30*60*1000);
  const h=harness({text:'السلام عليكم'});const result=await h.run();
  assert.equal(result.action,'REPLY');assert.deepEqual(h.replies,['وعليكم السلام، حياك. كيف أقدر أساعدك؟']);assert.equal(h.plannerCalls,0);
  assert.equal(h.committed.session_reset,true);assert.equal(h.committed.intent,'SUPPORT');assert.equal(h.committed.goal,'UNKNOWN');
  assert.equal(h.committed.entities.service,undefined);assert.equal(h.committed.entities.time,undefined);
  const cleared=h.calls.filter(x=>x.name==='dabbir_semantic_set_pending_v2');assert.equal(cleared.length,1);assert.equal(cleared[0].args.p_action,'none');
  const decision=h.calls.find(x=>x.name==='dabbir_record_ai_operator_decision_v1');assert.equal(decision.args.p_reason_code,'NEW_SESSION_GREETING');
});

test('greeting variants are deterministic and do not re-send an active service menu',async()=>{
  for(const text of ['السلام علیکم','هلا والله','مرحبا','hello']){
    const h=harness({text,semantic:previous('2026-09-08T10:25:00Z'),pending:livePresentation});
    const result=await h.run();assert.equal(result.action,'REPLY',text);assert.equal(h.plannerCalls,0,text);
    assert.ok(!h.calls.some(x=>x.name==='dabbir_semantic_set_pending_v2'),text);
    assert.ok(!h.replies[0].includes('تنظيف منزل'),text);assert.ok(!h.replies[0].includes('غسيل سجاد'),text);
  }
});

test('a verified live service menu remains selectable after a greeting',async()=>{
  const greeting=harness({text:'السلام عليكم',semantic:previous('2026-09-08T10:25:00Z'),pending:livePresentation});await greeting.run();
  const selection=harness({text:'2',semantic:greeting.committed,pending:livePresentation,at:new Date('2026-09-08T10:31:00Z')});
  const result=await selection.run();assert.equal(result.action,'CLARIFY');
  assert.equal(selection.committed.entities.service.value,ids.carpet);assert.equal(selection.committed.intent,'BOOKING');
  assert.ok(!selection.replies[0].includes('تنظيف منزل'));assert.ok(!selection.replies[0].includes('غسيل سجاد — 40'));
});

test('an expired menu ordinal after an idle session cannot become an old service or a time fact',async()=>{
  const h=harness({text:'2'});const result=await h.run();
  assert.equal(result.action,'REPLY');assert.equal(h.committed.entities.service,undefined);assert.equal(h.committed.entities.time,undefined);
  assert.match(h.replies[0],/انتهت|expired/i);assert.equal(h.plannerCalls,0);
});
