import test from 'node:test';
import assert from 'node:assert/strict';
import {v3SemanticContractViolation} from '../api/_dabbir-conversation-v3-semantic-contract.js';
import {_v3InterpreterTest} from '../api/_dabbir-conversation-v3-interpreter.js';
import {understandTurnV3} from '../api/_dabbir-conversation-v3-understanding.js';
import {planConversationTurnV3} from '../api/_dabbir-conversation-v3-brain.js';
import {runConversationV3Runtime,_v3RuntimeTest} from '../api/_dabbir-conversation-v3-runtime.js';
import {_aiFailureTest} from '../api/_dabbir-whatsapp-ai-core.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001'};
const fact=(field,value,source='CUSTOMER_CONFIRMED',extra={})=>({field,status:'VERIFIED',value,source,confidence:1,resolution:'TEST',surface:null,...extra});
const contract={service_id:ids.service,delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',entity_definitions:{vehicle:{type:'ENUM',values:['saloon','station']},location:{type:'VERIFIED_GPS'},date:{type:'DATE'},time:{type:'TIME'}},mode_requirements:{MOBILE:{required:['vehicle']}},contract_version:'v1'};
const service={id:ids.service,business_id:ids.business,branch_id:ids.branch,name_ar:'عادي',price:40};
function context(body='أول الصباح',at='2026-09-14T03:00:00Z'){
  return {business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},conversation:{id:ids.conversation,branch_id:ids.branch,language:'ar'},customer:{id:ids.customer},services:[service],activity_profile:{services:[contract]},batch:{id:'60000000-0000-4000-8000-000000000001',last_message_at:at},batch_messages:[{id:'70000000-0000-4000-8000-000000000001',body,created_at:at}]};
}
function previousReady(over={}){
  return {version:2,episode_id:'episode-1',episode_started_at:'2026-09-14T02:55:00Z',last_turn_at:'2026-09-14T02:59:30Z',last_operational_turn_at:'2026-09-14T02:59:30Z',goal:'BOOK_SERVICE',intent_confirmed:true,facts:[
    fact('service',ids.service),fact('price',40,'DATABASE_FACT'),fact('delivery_mode','MOBILE','DATABASE_FACT'),fact('vehicle','station'),fact('location',{lat:24.4,lng:54.3},'PROVIDER_VERIFIED',{receipt_id:'location-receipt'}),fact('date','2026-09-14','CUSTOMER_STATED'),fact('time','07:00','CUSTOMER_STATED'),fact('immediacy','NOW','CUSTOMER_STATED'),fact('slot',0,'CUSTOMER_CONFIRMED',{starts_at:'2026-09-14T03:00:00Z'})
  ],tentatives:[],pending_question:{fields:['time'],purpose:'COLLECT_WHEN'},...over};
}

const timeWindowModel={intent:'BOOKING',role:'CORRECTION',confidence:.99,service_candidate:null,entities:[{entity:'time_window',value:'EARLY_MORNING',surface:'أول الصباح',confidence:.99,correction:true}],side_questions:[],invalidated_fields:['time','slot','immediacy'],requested_action:'NONE',confirmation:null};

test('V3 semantic contract represents a daypart without inventing an exact time',()=>{
  const raw=JSON.stringify(timeWindowModel);
  assert.equal(v3SemanticContractViolation(raw),null);
  assert.equal(_v3InterpreterTest.validModelContract(timeWindowModel,'أول الصباح'),true);
  assert.equal(v3SemanticContractViolation(JSON.stringify({...timeWindowModel,entities:[{...timeWindowModel.entities[0],value:'07:00'}]})),'ENTITIES');
});

test('time-window correction removes stale NOW, exact time and slot and asks for an exact time',()=>{
  const c=context(),previous=previousReady();
  const proposal={intent:'BOOKING',action:'REPLY',confidence:.99,serviceName:null,serviceSurface:null,serviceVerified:false,entities:[{entity:'time_window',value:'EARLY_MORNING',evidence:'أول الصباح',confidence:.99,correction:true}],serviceQuestion:null,serviceQuestions:[],dialogue:{message_role:'CORRECTION',evidence:'أول الصباح',invalidated_fields:[]}};
  const understanding=understandTurnV3({context:c,proposal,previousState:previous,now:new Date(c.batch.last_message_at)});
  assert.equal(understanding.facts.some(f=>f.field==='time'),false);
  assert.equal(understanding.facts.some(f=>f.field==='slot'),false);
  assert.equal(understanding.facts.some(f=>f.field==='immediacy'),false);
  assert.equal(understanding.facts.find(f=>f.field==='time_window')?.value,'EARLY_MORNING');
  for(const field of ['time','slot','immediacy'])assert.ok(understanding.invalidations.some(x=>x.field===field));
  const planned=planConversationTurnV3({previousState:previous,understanding,episode:{kind:'CONTINUE',reason:'TEST',idle_ms:30_000},context:c});
  assert.equal(planned.plan.next_question?.purpose,'COLLECT_EXACT_TIME_IN_WINDOW');
  assert.match(planned.response.text,/أول الصباح/);
  assert.doesNotMatch(planned.response.text,/الحين/);
  assert.doesNotMatch(planned.response.text,/متنقل/,'database-owned delivery mode must not be attributed to the customer');
  const projection=_v3RuntimeTest.authorityProjection({load:{semantic_state:{},cognitive_policy:{mode:'canary'}},state:planned.state,plan:planned.plan,context:c,action:'CLARIFY',at:new Date(c.batch.last_message_at),interpretation:{proposal:{confidence:.99},provider:'fixture'}});
  assert.equal(projection.delivery_mode,'MOBILE');
  assert.equal(projection.entities.delivery_mode?.value,'MOBILE','verified delivery mode must survive the V3 -> authority projection boundary');
  assert.equal(projection.entities.delivery_mode?.source,'DATABASE_FACT');
});

test('slot ordinal 2 reaches CREATE_BOOKING with delivery_mode present in executable entities',async()=>{
  const at='2026-09-14T03:02:00Z',c=context('2',at),slots=[
    {starts_at:'2026-09-14T04:00:00Z',timezone:'Asia/Dubai',service_id:ids.service},
    {starts_at:'2026-09-14T04:30:00Z',timezone:'Asia/Dubai',service_id:ids.service},
    {starts_at:'2026-09-14T05:00:00Z',timezone:'Asia/Dubai',service_id:ids.service},
  ];
  c.pending_state={pending_action:'choose_slot',payload:{presented:true,slots}};
  const previous=previousReady({facts:previousReady().facts.filter(f=>!['slot','immediacy'].includes(f.field)).map(f=>f.field==='time'?{...f,value:'08:30'}:f),pending_question:null,last_turn_at:'2026-09-14T03:01:30Z',last_operational_turn_at:'2026-09-14T03:01:30Z'});
  let committed=null,executed=false;const sent=[];
  const rpc=async(name,args)=>{
    if(name==='dabbir_semantic_commit_v2'){committed=args.p_state;return {version:5,replay:false,state:committed};}
    if(name==='dabbir_record_ai_operator_decision_v1'||name==='dabbir_semantic_assert_current_v2'||name==='dabbir_semantic_set_pending_v2')return true;
    if(name==='dabbir_semantic_execute_v2'){
      executed=true;
      assert.equal(committed?.entities?.delivery_mode?.value,'MOBILE');
      assert.equal(committed?.entities?.slot?.value,1);
      assert.equal(committed?.entities?.slot?.starts_at,slots[1].starts_at);
      return {verified:true,appointment_id:'80000000-0000-4000-8000-000000000001',status:'confirmed',timezone:'Asia/Dubai',starts_at:slots[1].starts_at,service_name:'عادي'};
    }
    throw new Error(`unexpected rpc ${name}`);
  };
  const result=await runConversationV3Runtime({claim:{batch_id:c.batch.id,lock_token:'90000000-0000-4000-8000-000000000001'},context:c,rpc,deliver:async(_claim,_ctx,body)=>{sent.push(body);return {providerMessageId:'meta-v3'};},finish:async()=>true,handoff:async()=>{throw new Error('unexpected handoff')},bookingText:()=> 'تم تأكيد حجزك ✅',slotsText:()=>'',preloadedLoad:{version:4,message_revision:5,semantic_state:{language:'ar',v3_runtime:previous},cognitive_policy:{mode:'active'},activity_profile:c.activity_profile},logger:{info(){}}});
  assert.equal(result.action,'CREATE_BOOKING');
  assert.equal(result.state,'PROCESSED');
  assert.equal(executed,true);
  assert.equal(sent.length,1);
});

test('deterministic activity contract failures do not enter blind retry and shifted slots explain the miss',()=>{
  assert.equal(_aiFailureTest.isPermanentCode('ACTIVITY_DELIVERY_MODE_UNRESOLVED'),true);
  const text=_aiFailureTest.slotsText([{starts_at:'2026-09-14T04:00:00Z',timezone:'Asia/Dubai'}],'ar',{date:'2026-09-14',time:'07:00',timezone:'Asia/Dubai'});
  assert.match(text,/07:00/);
  assert.match(text,/غير متاح/);
  assert.match(text,/أقرب المتاح/);
});
