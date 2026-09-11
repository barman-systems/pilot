import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretConversationTurnV3,_v3InterpreterTest} from '../api/_dabbir-conversation-v3-interpreter.js';
import {runConversationV3Runtime,_v3RuntimeTest} from '../api/_dabbir-conversation-v3-runtime.js';
import {_v3CutoverTest} from '../api/_dabbir-whatsapp-ai-core.js';
import {generateDABBIRAiReply} from '../api/_ai-core.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',vip:'50000000-0000-4000-8000-000000000001',external:'50000000-0000-4000-8000-000000000002'};
const services=[{id:ids.vip,business_id:ids.business,branch_id:ids.branch,name:'Vip',name_ar:'Vip',price:100},{id:ids.external,business_id:ids.business,branch_id:ids.branch,name:'خارجي',name_ar:'خارجي',price:40}];
const contracts=services.map(s=>({business_id:ids.business,branch_id:ids.branch,service_id:s.id,activity_type:'car_wash',delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',mode_requirements:{MOBILE:{required:['vehicle']}},entity_definitions:{service:{type:'CATALOG_REFERENCE'},delivery_mode:{type:'ENUM',values:['MOBILE']},vehicle:{type:'ENUM',values:['saloon','station']},location:{type:'VERIFIED_GPS'},date:{type:'DATE'},time:{type:'TIME'}},contract_version:'v1'}));
function context(text='مرحبا',at='2026-09-11T08:00:00Z'){return {business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},conversation:{id:ids.conversation,branch_id:ids.branch,language:'ar'},customer:{id:ids.customer},batch:{id:'60000000-0000-4000-8000-000000000001',last_message_at:at},batch_messages:[{id:'70000000-0000-4000-8000-000000000001',body:text,created_at:at}],services,workers:[],activity_profile:{source:'DATABASE_FACT',services:contracts}};}
const valid=(over={})=>({intent:'BOOKING',role:'ANSWER_TO_PENDING_QUESTION',confidence:.95,service_candidate:null,entities:[],side_questions:[],invalidated_fields:[],requested_action:'NONE',confirmation:null,...over});

test('V3 interpreter semantically grounds Arabic-spelled VIP to the live scoped Vip service',async()=>{
  const previous={goal:'BOOK_SERVICE',intent_confirmed:true,facts:[],tentatives:[],pending_question:{fields:['service'],purpose:'COLLECT_SERVICE',options:services.map(s=>({type:'service',id:s.id,label:s.name}))}};
  const generate=async()=>({ok:true,reply:JSON.stringify(valid({service_candidate:{label:'Vip',surface:'في اي بي',confidence:.97}})),provider:'stub',model:'stub-v3'});
  const out=await interpretConversationTurnV3({context:context('في اي بي'),previousState:previous,generate});
  assert.equal(out.proposal.serviceName,'Vip');assert.equal(out.proposal.serviceSurface,'في اي بي');assert.equal(out.proposal.intent,'BOOKING');
});

test('V3 fast path resolves an offered service ordinal without calling a model',async()=>{
  const previous={goal:'BOOK_SERVICE',intent_confirmed:true,facts:[],tentatives:[],pending_question:{fields:['service'],purpose:'COLLECT_SERVICE',options:[{type:'service',id:ids.vip,label:'Vip'},{type:'service',id:ids.external,label:'خارجي'}]}};
  let calls=0;const out=await interpretConversationTurnV3({context:context('1'),previousState:previous,generate:async()=>{calls++;throw new Error('must not call model')}});
  assert.equal(calls,0);assert.equal(out.proposal.serviceName,'Vip');assert.equal(out.provider,'deterministic-v3-fast-path');
});

test('typed text cannot become a verified GPS fact without a signed location receipt',()=>{
  const noReceipt=_v3InterpreterTest.fastPath({context:context('هذا موقعي'),previousState:{goal:'BOOK_SERVICE'},raw:'هذا موقعي'});
  assert.equal(noReceipt.fastFacts.some(x=>x.field==='location'),false);
  const c=context('location');c.location_receipts=[{message_id:c.batch_messages[0].id,business_id:ids.business,conversation_id:ids.conversation,value:{lat:24.1,lng:54.2}}];
  const receipt=_v3InterpreterTest.fastPath({context:c,previousState:{goal:'BOOK_SERVICE'},raw:'location'});
  assert.equal(receipt.fastFacts.find(x=>x.field==='location')?.source,'PROVIDER_VERIFIED');
});

test('AI core uses the V3 json schema when semantic=v3',async()=>{
  let requestBody=null;
  const fetchImpl=async(_url,options)=>{requestBody=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({model:'openai/gpt-oss-20b',choices:[{message:{content:JSON.stringify(valid({intent:'SUPPORT',role:'GREETING',confidence:1}))},finish_reason:'stop'}]}),clone(){return this},headers:{get:()=>null}}};
  const result=await generateDABBIRAiReply({project:'dabbir_businesses',semantic:'v3',message:'مرحبا',businessContext:'{}',env:{GROQ_API_KEY:'test'},fetchImpl});
  assert.equal(result.ok,true);assert.equal(requestBody.response_format.type,'json_schema');assert.equal(requestBody.response_format.json_schema.name,'dabbir_v3_interpretation');
});

test('canary/active route to V3 while shadow remains legacy-visible',()=>{
  assert.equal(_v3CutoverTest.engineForMode('canary'),'V3');assert.equal(_v3CutoverTest.engineForMode('active'),'V3');assert.equal(_v3CutoverTest.engineForMode('shadow'),'LEGACY');assert.equal(_v3CutoverTest.engineForMode('off'),'LEGACY');
});

test('real V3 runtime writes and sends the Brain response without legacy dialogue ownership',async()=>{
  const c=context('مرحبا');const calls=[],sent=[],logs=[];
  const load={version:0,message_revision:1,semantic_state:{},cognitive_policy:{mode:'canary'},activity_profile:c.activity_profile};
  const rpc=async(name,args)=>{calls.push(name);if(name==='dabbir_semantic_commit_v2')return {version:1,replay:false,state:args.p_state};if(name==='dabbir_semantic_assert_current_v2')return true;if(name==='dabbir_record_ai_operator_decision_v1')return true;throw new Error(`unexpected rpc ${name}`)};
  const interpreter=async()=>({proposal:{intent:'SUPPORT',action:'REPLY',confidence:1,serviceName:null,entities:[],serviceQuestion:null,dialogue:{message_role:'GREETING',evidence:'مرحبا',invalidated_fields:[]}},fastFacts:[],provider:'stub-v3',model:'stub'});
  const deliver=async(_claim,_ctx,body,purpose)=>{sent.push({body,purpose});return {providerMessageId:'meta-v3'}};
  const result=await runConversationV3Runtime({claim:{batch_id:c.batch.id,lock_token:'80000000-0000-4000-8000-000000000001'},context:c,rpc,deliver,finish:async()=>true,handoff:async()=>{throw new Error('no handoff')},bookingText:()=>'',slotsText:()=>'',interpreter,preloadedLoad:load,logger:{info:x=>logs.push(x)}});
  assert.equal(result.engine,'V3');assert.equal(result.legacy_dialogue_called,false);assert.match(sent[0].body,/حياك/);assert.ok(logs.some(x=>x.includes('CONVERSATION_BRAIN_V3')));assert.equal(calls.includes('dabbir_semantic_commit_v2'),true);
});

test('authority projection never promotes tentative vehicle into executable canonical entities',()=>{
  const c=context('جيب شيروكي'),state={version:2,goal:'BOOK_SERVICE',intent_confirmed:true,episode_id:'e',episode_started_at:c.batch.last_message_at,last_turn_at:c.batch.last_message_at,episode_boundary:{kind:'CONTINUE'},facts:[{field:'service',status:'VERIFIED',value:ids.vip,source:'CUSTOMER_STATED',confidence:1},{field:'delivery_mode',status:'VERIFIED',value:'MOBILE',source:'DATABASE_FACT',confidence:1}],tentatives:[{field:'vehicle',status:'TENTATIVE',candidate_value:'station',surface:'جيب شيروكي'}],invalidations:[],pending_question:null};
  const projection=_v3RuntimeTest.authorityProjection({load:{semantic_state:{},cognitive_policy:{mode:'canary'}},state,plan:{missing_fields:['vehicle','location'],required_fields:['vehicle','location']},context:c,action:'CLARIFY',at:new Date(c.batch.last_message_at),interpretation:{proposal:{confidence:.9},provider:'stub'}});
  assert.equal(projection.entities.vehicle,undefined);assert.equal(projection.operational_confidence,.6);assert.equal(projection.v3_engine.legacy_dialogue_called,false);
});
