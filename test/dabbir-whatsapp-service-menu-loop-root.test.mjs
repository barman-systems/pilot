import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {runUnderstandingTurn} from '../api/_dabbir-understanding-orchestrator.js';

const now=new Date('2026-09-08T06:10:00Z');
const ids={
  business:'20000000-0000-4000-8000-000000000001',
  conversation:'30000000-0000-4000-8000-000000000001',
  customer:'40000000-0000-4000-8000-000000000001',
  branch:'50000000-0000-4000-8000-000000000001',
  home:'60000000-0000-4000-8000-000000000001',
  carpet:'60000000-0000-4000-8000-000000000002',
};
const services=[
  {id:ids.home,business_id:ids.business,branch_id:ids.branch,name_ar:'تنظيف منزل',price:20},
  {id:ids.carpet,business_id:ids.business,branch_id:ids.branch,name_ar:'غسيل سجاد',price:40},
];
const baseContext=extra=>({
  business:{id:ids.business,timezone:'Asia/Dubai',business_type:'cleaning',currency_code:'AED'},
  conversation:{id:ids.conversation,branch_id:ids.branch,state:'ai_active'},
  customer:{id:ids.customer},services,workers:[],upcoming_appointments:[],history:[],knowledge:[],
  ...extra,
});
async function runTurn({text,previous={},pending_state=null,deliverMenu=null}){
  const calls=[],replies=[];let committed=null,version=Number(previous?.semantic_version||0);
  const context=baseContext({batch_messages:[{body:text}],pending_state});
  const claim={batch_id:'90000000-0000-4000-8000-000000000001',lock_token:'90000000-0000-4000-8000-000000000002',attempt_count:1};
  const rpc=async(name,args)=>{
    calls.push({name,args});
    if(name==='dabbir_semantic_load_v2')return {semantic_state:previous?.state||previous||{},version,message_revision:1};
    if(name==='dabbir_semantic_commit_v2'){committed=args.p_state;version+=1;return {version,state:committed,replay:false};}
    if(name==='dabbir_semantic_assert_current_v2')return true;
    if(name==='dabbir_semantic_set_pending_v2')return {pending_action:args.p_action};
    if(name==='dabbir_record_ai_operator_decision_v1')return true;
    throw new Error(`UNEXPECTED_RPC:${name}`);
  };
  const result=await runUnderstandingTurn({
    claim,context,rpc,deliverMenu,resolveProduct:null,
    deliver:async(_claim,_ctx,body)=>{replies.push(body);return {providerMessageId:'wamid.verified-service-menu'};},
    finish:async()=>true,handoff:async()=>true,bookingText:()=>'',slotsText:()=>'',now:()=>now,
  });
  return {result,calls,replies,committed,version};
}
function pendingFromMenu(run){
  const writes=run.calls.filter(x=>x.name==='dabbir_semantic_set_pending_v2'&&x.args.p_action==='choose_service');
  assert.equal(writes.length,2);
  assert.equal(writes[0].args.p_payload.presented,false);
  assert.equal(writes[1].args.p_payload.presented,true);
  assert.equal(writes[1].args.p_payload.provider_message_id,'wamid.verified-service-menu');
  return {pending_action:'choose_service',payload:writes[1].args.p_payload,expires_at:'2026-09-08T06:25:00Z'};
}

test('production reproduction: text service list is persisted as a verified ordered choose_service presentation',async()=>{
  const first=await runTurn({text:'شو خدماتكم'});
  assert.equal(first.result.action,'SERVICE_MENU');
  assert.match(first.replies[0],/1\) تنظيف منزل — 20 AED/);
  assert.match(first.replies[0],/2\) غسيل سجاد — 40 AED/);
  const pending=pendingFromMenu(first);
  assert.deepEqual(pending.payload.services.map(x=>x.id),[ids.home,ids.carpet]);
});

test('production reproduction: bare 2 resolves the second verified service and never becomes 2 AM/PM',async()=>{
  const first=await runTurn({text:'شو خدماتكم'}),pending=pendingFromMenu(first);
  const second=await runTurn({text:'2',previous:first.committed,pending_state:pending});
  assert.equal(second.result.action,'CLARIFY');
  assert.equal(second.committed.intent,'BOOKING');
  assert.equal(second.committed.goal,'BOOK_SERVICE');
  assert.equal(second.committed.entities.service.value,ids.carpet);
  assert.equal(second.committed.entities.service.source,'CUSTOMER_STATED');
  assert.equal(second.committed.entities.time,undefined);
  assert.deepEqual(second.committed.missing_fields,['date','time']);
  assert.equal(second.replies[0],'أي يوم يناسبك؟');
});

test('second/الثاني and exact offered service name resolve through the same grounded service path',async()=>{
  for(const choice of ['الثاني','غسيل سجاد']){
    const first=await runTurn({text:'شو خدماتكم'}),pending=pendingFromMenu(first);
    const second=await runTurn({text:choice,previous:first.committed,pending_state:pending});
    assert.equal(second.committed.intent,'BOOKING',choice);
    assert.equal(second.committed.entities.service.value,ids.carpet,choice);
    assert.notEqual(second.result.action,'SERVICE_MENU',choice);
  }
});

test('legacy loop repair: exact service clears only the unsupported ordinal-as-time artifact',async()=>{
  const first=await runTurn({text:'شو خدماتكم'});
  const legacy=structuredClone(first.committed);
  legacy.entities.time={value:null,source:'CUSTOMER_STATED',status:'unresolved',confidence:.55,hour:2,minute:0,part:'am_pm'};
  const repaired=await runTurn({text:'غسيل سجاد',previous:legacy,pending_state:{pending_action:'handoff',payload:{},expires_at:'2026-09-08T07:00:00Z'}});
  assert.equal(repaired.committed.intent,'BOOKING');
  assert.equal(repaired.committed.entities.service.value,ids.carpet);
  assert.equal(repaired.committed.entities.time,undefined);
  assert.deepEqual(repaired.committed.missing_fields,['date','time']);
  assert.notEqual(repaired.result.action,'SERVICE_MENU');
});

test('unverified, expired, out-of-range or ambiguous service ordinals never select a service',async()=>{
  const first=await runTurn({text:'شو خدماتكم'}),verified=pendingFromMenu(first);
  const cases=[
    ['2',{...verified,payload:{...verified.payload,presented:false}}],
    ['2',{...verified,expires_at:'2026-09-08T06:00:00Z'}],
    ['3',verified],
    ['الأول أو الثاني',verified],
  ];
  for(const [text,pending] of cases){
    const run=await runTurn({text,previous:first.committed,pending_state:pending});
    assert.notEqual(run.committed.entities.service?.value,ids.carpet,text);
    assert.notEqual(run.result.action,'CREATE_BOOKING',text);
  }
});

test('database repair adds choose_service and clears only stale handoff pending state on return to AI',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20260908062000_dabbir_whatsapp_service_menu_state_repair_v1.sql',import.meta.url),'utf8');
  assert.match(sql,/choose_service/);
  assert.match(sql,/pending_action='handoff'/);
  assert.match(sql,/set pending_action='none',payload='\{\}'::jsonb,expires_at=null/);
  assert.match(sql,/h\.state in\('QUEUED','ASSIGNED','HUMAN_ACTIVE'\)/);
  assert.match(sql,/grant execute on function public\.dabbir_whatsapp_ai_set_state[^;]+to service_role/);
  assert.match(sql,/grant execute on function public\.dabbir_return_conversation_to_ai[^;]+to authenticated/);
});
