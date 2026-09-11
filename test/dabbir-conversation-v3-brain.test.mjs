import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyEpisodeBoundaryV3} from '../api/_dabbir-conversation-v3-episode.js';
import {freshConversationStateV3,understandTurnV3} from '../api/_dabbir-conversation-v3-understanding.js';
import {planConversationTurnV3} from '../api/_dabbir-conversation-v3-brain.js';
import {runConversationV3Shadow} from '../api/_dabbir-conversation-v3-pipeline.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001'};
const service={id:ids.service,business_id:ids.business,branch_id:ids.branch,name:'خارجي',name_ar:'خارجي',price:40};
const contract={business_id:ids.business,branch_id:ids.branch,service_id:ids.service,activity_type:'car_wash',delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',mode_requirements:{MOBILE:{required:['vehicle']}},entity_definitions:{service:{type:'CATALOG_REFERENCE'},delivery_mode:{type:'ENUM',values:['MOBILE']},vehicle:{type:'ENUM',values:['saloon','station']},location:{type:'VERIFIED_GPS'},date:{type:'DATE'},time:{type:'TIME'}},contract_version:'v1'};
function context(text,at='2026-09-11T06:30:00Z'){return {business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},conversation:{id:ids.conversation,branch_id:ids.branch},customer:{id:ids.customer},batch:{last_message_at:at},batch_messages:[{id:'60000000-0000-4000-8000-000000000001',body:text,created_at:at}],services:[service],activity_profile:{source:'DATABASE_FACT',version:1,business_id:ids.business,branch_id:ids.branch,services:[contract]}};}
const entity=(entity,value,evidence,confidence=.95)=>({entity,value,evidence,confidence,correction:false});
function proposal({intent='BOOKING',action='CLARIFY',role='NEW_REQUEST',confidence=.9,serviceName=null,entities=[],serviceQuestion=null}={}){return {intent,action,confidence,serviceName,entities,serviceQuestion,dialogue:{message_role:role,evidence:null}};}

test('Episode Boundary starts new episode after long idle complete request despite old active goal',()=>{
 const previous={goal:'BOOK_SERVICE',last_turn_at:'2026-09-11T04:00:00Z',facts:[{field:'service',status:'VERIFIED',value:ids.service,source:'CUSTOMER_STATED'}],pending_question:{fields:['vehicle']}};
 const p=proposal({role:'NEW_REQUEST',entities:[entity('date','2026-09-11','الحين'),entity('time','10:30','الحين')]});
 const out=classifyEpisodeBoundaryV3({previousState:previous,proposal:p,context:context('اذا فاضي تعال غسل السياره الحين'),now:new Date('2026-09-11T06:30:00Z')});
 assert.equal(out.kind,'NEW_EPISODE');assert.equal(out.reason,'LONG_IDLE_COMPLETE_NEW_REQUEST');
});

test('clean first request understands MOBILE and NOW without inheriting old service',()=>{
 const c=context('اذا فاضي تعال غسل السياره الحين');
 const p=proposal({entities:[entity('date','2026-09-11','الحين'),entity('time','10:30','الحين')]});
 const r=runConversationV3Shadow({context:c,canonicalState:{},previousShadow:null,proposal:p,now:new Date('2026-09-11T06:30:00Z')});
 assert.equal(r.ok,true);assert.equal(r.episode.kind,'NEW_EPISODE');
 assert.equal(r.state.facts.find(x=>x.field==='delivery_mode')?.value,'MOBILE');
 assert.equal(r.state.facts.find(x=>x.field==='immediacy')?.value,'NOW');
 assert.equal(r.state.facts.some(x=>x.field==='service'),false);
 assert.deepEqual(r.plan.next_question.fields,['service']);
 assert.match(r.response.text,/الحين/);assert.match(r.response.text,/أي خدمة/);
});

test('service selection is decisive booking behavior and never asks intent_confirmation',()=>{
 const c=context('غسيل خارجي','2026-09-11T06:31:00Z');
 const previous={version:2,goal:'BOOK_SERVICE',intent_confirmed:true,facts:[{field:'branch',status:'VERIFIED',value:ids.branch,source:'DATABASE_FACT'},{field:'delivery_mode',status:'VERIFIED',value:'MOBILE',source:'DATABASE_FACT'},{field:'date',status:'VERIFIED',value:'2026-09-11',source:'CUSTOMER_STATED'},{field:'time',status:'VERIFIED',value:'10:30',source:'CUSTOMER_STATED'},{field:'immediacy',status:'VERIFIED',value:'NOW',source:'CUSTOMER_STATED'}],tentatives:[],pending_question:{fields:['service']},last_turn_at:'2026-09-11T06:30:00Z',episode_id:'e1',episode_started_at:'2026-09-11T06:30:00Z'};
 const p=proposal({role:'ANSWER_TO_PENDING_QUESTION',serviceName:'خارجي'});
 const u=understandTurnV3({context:c,proposal:p,previousState:previous});
 const e={kind:'CONTINUE',reason:'SEMANTIC_ANSWER_TO_PENDING_QUESTION',idle_ms:60000};
 const r=planConversationTurnV3({previousState:previous,understanding:u,episode:e,context:c});
 assert.equal(r.state.intent_confirmed,true);assert.equal(r.plan.next_question.fields.includes('intent_confirmation'),false);
 assert.deepEqual(r.plan.next_question.fields,['vehicle','location']);
 assert.doesNotMatch(r.response.text,/تقصد تبا تحجز/);assert.match(r.response.text,/خارجي/);assert.match(r.response.text,/سيارتك/);
});

test('unseen الاستيشن survives as station tentative and is surfaced, not repeated generic vehicle question',()=>{
 const c=context('الاستيشن','2026-09-11T06:32:00Z');
 const previous={version:2,goal:'BOOK_SERVICE',intent_confirmed:true,facts:[{field:'branch',status:'VERIFIED',value:ids.branch,source:'DATABASE_FACT'},{field:'service',status:'VERIFIED',value:ids.service,source:'CUSTOMER_STATED'},{field:'delivery_mode',status:'VERIFIED',value:'MOBILE',source:'DATABASE_FACT'},{field:'date',status:'VERIFIED',value:'2026-09-11',source:'CUSTOMER_STATED'},{field:'time',status:'VERIFIED',value:'10:30',source:'CUSTOMER_STATED'},{field:'immediacy',status:'VERIFIED',value:'NOW',source:'CUSTOMER_STATED'}],tentatives:[],pending_question:{fields:['vehicle','location']},last_turn_at:'2026-09-11T06:31:00Z',episode_id:'e1',episode_started_at:'2026-09-11T06:30:00Z'};
 const p=proposal({role:'ANSWER_TO_PENDING_QUESTION',entities:[entity('vehicle','station','الاستيشن')]});
 const u=understandTurnV3({context:c,proposal:p,previousState:previous});
 const r=planConversationTurnV3({previousState:previous,understanding:u,episode:{kind:'CONTINUE',reason:'SEMANTIC_ANSWER_TO_PENDING_QUESTION',idle_ms:60000},context:c});
 assert.equal(r.state.tentatives.find(x=>x.field==='vehicle')?.candidate_value,'station');
 assert.deepEqual(r.plan.next_question.fields,['vehicle']);
 assert.match(r.response.text,/فهمت إن السيارة ستيشن\/SUV/);assert.doesNotMatch(r.response.text,/أي سيارة نخدم لك/);
 assert.equal((r.response.text.match(/[؟?]/g)||[]).length,1);
});

test('price side question is answered without abandoning booking',()=>{
 const c=context('وكم السعر؟','2026-09-11T06:33:00Z');
 const previous={version:2,goal:'BOOK_SERVICE',intent_confirmed:true,facts:[{field:'branch',status:'VERIFIED',value:ids.branch,source:'DATABASE_FACT'},{field:'service',status:'VERIFIED',value:ids.service,source:'CUSTOMER_STATED'},{field:'delivery_mode',status:'VERIFIED',value:'MOBILE',source:'DATABASE_FACT'},{field:'date',status:'VERIFIED',value:'2026-09-11',source:'CUSTOMER_STATED'},{field:'time',status:'VERIFIED',value:'10:30',source:'CUSTOMER_STATED'},{field:'immediacy',status:'VERIFIED',value:'NOW',source:'CUSTOMER_STATED'}],tentatives:[],pending_question:{fields:['vehicle','location']},last_turn_at:'2026-09-11T06:32:00Z',episode_id:'e1',episode_started_at:'2026-09-11T06:30:00Z'};
 const p=proposal({intent:'PRICING',action:'PRICING',role:'SIDE_QUESTION',serviceQuestion:{field:'price',evidence:'السعر'}});
 const u=understandTurnV3({context:c,proposal:p,previousState:previous});
 const r=planConversationTurnV3({previousState:previous,understanding:u,episode:{kind:'CONTINUE',reason:'ACTIVE_EPISODE',idle_ms:60000},context:c});
 assert.equal(r.state.goal,'BOOK_SERVICE');assert.equal(r.plan.answers[0]?.value,40);assert.match(r.response.text,/40 درهم/);assert.ok(r.plan.next_question);
});

test('customer confirmation promotes an allowed tentative vehicle to VERIFIED without repeating vehicle question',()=>{
 const c=context('هيه','2026-09-11T06:33:30Z');
 const previous={version:2,goal:'BOOK_SERVICE',intent_confirmed:true,facts:[{field:'branch',status:'VERIFIED',value:ids.branch,source:'DATABASE_FACT'},{field:'service',status:'VERIFIED',value:ids.service,source:'CUSTOMER_STATED'},{field:'delivery_mode',status:'VERIFIED',value:'MOBILE',source:'DATABASE_FACT'},{field:'date',status:'VERIFIED',value:'2026-09-11',source:'CUSTOMER_STATED'},{field:'time',status:'VERIFIED',value:'10:30',source:'CUSTOMER_STATED'},{field:'immediacy',status:'VERIFIED',value:'NOW',source:'CUSTOMER_STATED'}],tentatives:[{field:'vehicle',status:'TENTATIVE',candidate_value:'station',value:'station',surface:'الاستيشن',source:'SEMANTIC_PROPOSAL',resolution:'ALLOWED_VALUE_NEEDS_GROUNDING'}],pending_question:{fields:['vehicle'],purpose:'CONFIRM_TENTATIVE_VEHICLE'},last_turn_at:'2026-09-11T06:32:00Z',episode_id:'e1',episode_started_at:'2026-09-11T06:30:00Z'};
 const p=proposal({role:'CONFIRMATION',entities:[]});
 const u=understandTurnV3({context:c,proposal:p,previousState:previous});
 const r=planConversationTurnV3({previousState:previous,understanding:u,episode:{kind:'CONTINUE',reason:'SEMANTIC_CONFIRMATION',idle_ms:90000},context:c});
 assert.equal(r.state.facts.find(x=>x.field==='vehicle')?.value,'station');assert.equal(r.state.facts.find(x=>x.field==='vehicle')?.source,'CUSTOMER_CONFIRMED');
 assert.equal(r.state.tentatives.some(x=>x.field==='vehicle'),false);assert.deepEqual(r.plan.next_question.fields,['location']);assert.doesNotMatch(r.response.text,/سيارتك صالون/);
});

test('unmapped vehicle surface is preserved and asks a grounded category correction once',()=>{
 const c=context('كامري','2026-09-11T06:34:00Z');
 const previous={version:2,goal:'BOOK_SERVICE',intent_confirmed:true,facts:[{field:'branch',status:'VERIFIED',value:ids.branch,source:'DATABASE_FACT'},{field:'service',status:'VERIFIED',value:ids.service,source:'CUSTOMER_STATED'},{field:'delivery_mode',status:'VERIFIED',value:'MOBILE',source:'DATABASE_FACT'},{field:'date',status:'VERIFIED',value:'2026-09-11',source:'CUSTOMER_STATED'},{field:'time',status:'VERIFIED',value:'10:30',source:'CUSTOMER_STATED'}],tentatives:[],pending_question:{fields:['vehicle'],purpose:'COLLECT_VEHICLE'},last_turn_at:'2026-09-11T06:33:00Z',episode_id:'e1',episode_started_at:'2026-09-11T06:30:00Z'};
 const p=proposal({role:'ANSWER_TO_PENDING_QUESTION',entities:[]});
 const u=understandTurnV3({context:c,proposal:p,previousState:previous});
 const r=planConversationTurnV3({previousState:previous,understanding:u,episode:{kind:'CONTINUE',reason:'SEMANTIC_ANSWER_TO_PENDING_QUESTION',idle_ms:60000},context:c});
 assert.equal(r.state.tentatives.find(x=>x.field==='vehicle')?.surface,'كامري');assert.equal(r.plan.next_question.purpose,'MAP_TENTATIVE_VEHICLE');
 assert.match(r.response.text,/كامري/);assert.match(r.response.text,/صالون أو ستيشن\/SUV/);assert.equal((r.response.text.match(/[؟?]/g)||[]).length,1);
});

test('explicit vehicle correction invalidates old verified vehicle before retaining the new candidate',()=>{
 const c=context('لا قصدي جيب شيروكي','2026-09-11T06:35:00Z');
 const previous={version:2,goal:'BOOK_SERVICE',intent_confirmed:true,facts:[{field:'branch',status:'VERIFIED',value:ids.branch,source:'DATABASE_FACT'},{field:'service',status:'VERIFIED',value:ids.service,source:'CUSTOMER_STATED'},{field:'delivery_mode',status:'VERIFIED',value:'MOBILE',source:'DATABASE_FACT'},{field:'vehicle',status:'VERIFIED',value:'saloon',source:'CUSTOMER_CONFIRMED'}],tentatives:[],pending_question:null,last_turn_at:'2026-09-11T06:34:00Z',episode_id:'e1',episode_started_at:'2026-09-11T06:30:00Z'};
 const p={...proposal({role:'CORRECTION',entities:[]}),dialogue:{message_role:'CORRECTION',evidence:'لا قصدي جيب شيروكي',invalidated_fields:['vehicle']}};
 const u=understandTurnV3({context:c,proposal:p,previousState:previous});
 const r=planConversationTurnV3({previousState:previous,understanding:u,episode:{kind:'CONTINUE',reason:'SEMANTIC_CORRECTION',idle_ms:60000},context:c});
 assert.equal(r.state.facts.some(x=>x.field==='vehicle'&&x.value==='saloon'),false);assert.ok(r.state.invalidations.some(x=>x.field==='vehicle'));
});
