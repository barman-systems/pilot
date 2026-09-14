import test from 'node:test';
import assert from 'node:assert/strict';
import {understandTurnV3} from '../api/_dabbir-conversation-v3-understanding.js';
import {planConversationTurnV3} from '../api/_dabbir-conversation-v3-brain.js';
import {_v3RuntimeTest} from '../api/_dabbir-conversation-v3-runtime.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001'};
const f=(field,value,source='CUSTOMER_STATED',extra={})=>({field,status:'VERIFIED',value,source,confidence:1,resolution:extra.resolution||'TEST',surface:extra.surface??null,...extra});
const baseFacts=()=>[
  f('branch',ids.branch,'DATABASE_FACT',{resolution:'SERVER_SCOPE'}),
  f('service',ids.service,'CUSTOMER_CONFIRMED',{surface:'خارجي',resolution:'V3_SCOPED_CATALOG_VERIFIED_SELECTION'}),
  f('price',40,'DATABASE_FACT',{resolution:'SCOPED_CATALOG_PRICE'}),
  f('delivery_mode','MOBILE','DATABASE_FACT',{resolution:'SERVICE_SINGLE_MODE'})
];
function context(body,created_at='2026-09-14T05:28:06.728Z'){
  return {
    business:{id:ids.business,business_type:'car_wash',currency_code:'AED',timezone:'Asia/Dubai'},
    conversation:{id:ids.conversation,branch_id:ids.branch,language:'ar'},
    customer:{id:ids.customer,language:'ar'},
    batch_messages:[{id:`m-${created_at}`,body,created_at}],
    services:[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name_ar:'خارجي',price:40}],
    activity_profile:{services:[{business_id:ids.business,branch_id:ids.branch,service_id:ids.service,delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',mode_requirements:{MOBILE:{required:['vehicle','location','date','time']}},entity_definitions:{vehicle:{type:'ENUM',values:['saloon','station']},location:{type:'LOCATION'},date:{type:'DATE'},time:{type:'TIME'}},supported_actions:['CHECK_AVAILABILITY','CREATE_BOOKING'],contract_version:'v-live'}]}
  };
}
function proposal({entities=[],role='ANSWER_TO_PENDING_QUESTION',confidence=.98}={}){return {intent:'BOOKING',action:'REPLY',confidence,serviceName:null,serviceSurface:null,serviceCandidateLabel:null,serviceVerified:false,entities,serviceQuestions:[],dialogue:{message_role:role,evidence:null,invalidated_fields:[]}};}
function state(over={}){return {version:2,goal:'BOOK_SERVICE',intent_confirmed:true,facts:baseFacts(),tentatives:[],invalidations:[],pending_question:null,last_turn_at:'2026-09-14T05:27:55.000Z',last_operational_turn_at:'2026-09-14T05:27:55.000Z',episode_id:'episode-live',episode_started_at:'2026-09-14T05:27:28.511Z',...over};}
const episode={kind:'CONTINUE',reason:'SEMANTIC_ANSWER_TO_PENDING_QUESTION',idle_ms:10000};

test('live regression: explicit saloon answer is accepted without redundant confirmation',()=>{
  const previous=state({pending_question:{fields:['vehicle','location'],purpose:'COLLECT_VEHICLE_AND_LOCATION'}});
  const c=context('صالون');
  const u=understandTurnV3({context:c,proposal:proposal({entities:[{entity:'vehicle',value:'saloon',evidence:'صالون',confidence:.99,correction:false}]}),previousState:previous,now:new Date('2026-09-14T05:28:06.728Z')});
  assert.equal(u.facts.find(x=>x.field==='vehicle')?.value,'saloon');
  assert.equal(u.facts.find(x=>x.field==='vehicle')?.source,'CUSTOMER_STATED');
  assert.equal(u.tentatives.some(x=>x.field==='vehicle'),false);
  const planned=planConversationTurnV3({previousState:previous,understanding:u,episode,context:c});
  assert.equal(planned.plan.next_question?.purpose,'COLLECT_LOCATION');
  assert.match(planned.response.text,/موقعك/);
  assert.doesNotMatch(planned.response.text,/صح[؟?]/);
});

test('live regression: today is retained and the next question asks only for time',()=>{
  const previous=state({facts:[...baseFacts(),f('vehicle','saloon','CUSTOMER_STATED',{surface:'صالون'}),f('location',{lat:24.1858,lng:52.626244,label:''},'PROVIDER_VERIFIED',{receipt_id:'loc-1',resolution:'SIGNED_WHATSAPP_LOCATION'})],pending_question:{fields:['date','time'],purpose:'COLLECT_WHEN'},last_turn_at:'2026-09-14T05:29:20.119Z',last_operational_turn_at:'2026-09-14T05:29:20.119Z'});
  const c=context('اليوم','2026-09-14T05:29:29.681Z');
  const p=proposal({entities:[{entity:'date',value:'2026-09-14',evidence:'اليوم',confidence:.99,correction:false}]});
  const u=understandTurnV3({context:c,proposal:p,previousState:previous,now:new Date('2026-09-14T05:29:29.681Z')});
  const planned=planConversationTurnV3({previousState:previous,understanding:u,episode,context:c});
  assert.equal(planned.state.facts.find(x=>x.field==='date')?.value,'2026-09-14');
  assert.equal(planned.plan.next_question?.purpose,'COLLECT_TIME');
  assert.deepEqual(planned.plan.missing_fields,['time']);
  assert.match(planned.response.text,/اليوم/);
  assert.match(planned.response.text,/الساعة/);
  assert.doesNotMatch(planned.response.text,/متى تبيه[؟?]/);
});

test('live regression: repeating today while time is pending is classified as no progress and stays targeted',()=>{
  const previous=state({facts:[...baseFacts(),f('vehicle','saloon','CUSTOMER_STATED',{surface:'صالون'}),f('location',{lat:24.1858,lng:52.626244,label:''},'PROVIDER_VERIFIED',{receipt_id:'loc-1',resolution:'SIGNED_WHATSAPP_LOCATION'}),f('date','2026-09-14','CUSTOMER_STATED',{surface:'اليوم',resolution:'V3_SEMANTIC_DATE'})],pending_question:{fields:['time'],purpose:'COLLECT_TIME'},last_turn_at:'2026-09-14T05:29:40.497Z',last_operational_turn_at:'2026-09-14T05:29:40.497Z'});
  const c=context('اليوم','2026-09-14T05:29:53.433Z');
  const u=understandTurnV3({context:c,proposal:proposal({entities:[{entity:'date',value:'2026-09-14',evidence:'اليوم',confidence:.99,correction:false}]}),previousState:previous,now:new Date('2026-09-14T05:29:53.433Z')});
  const planned=planConversationTurnV3({previousState:previous,understanding:u,episode,context:c});
  assert.equal(planned.plan.no_progress,true);
  assert.equal(planned.plan.next_question?.purpose,'COLLECT_TIME');
  assert.match(planned.response.text,/مسجل عندي/);
  assert.match(planned.response.text,/الساعة نفسها/);
});

test('live regression: authoritative projection refreshes last_confirmed_facts instead of preserving stale date',()=>{
  const c=context('اليوم','2026-09-14T05:29:53.433Z');
  const s=state({facts:[...baseFacts(),f('vehicle','saloon','CUSTOMER_STATED',{surface:'صالون'}),f('location',{lat:24.1858,lng:52.626244,label:''},'PROVIDER_VERIFIED',{receipt_id:'loc-1',resolution:'SIGNED_WHATSAPP_LOCATION'}),f('date','2026-09-14','CUSTOMER_STATED',{surface:'اليوم',resolution:'V3_SEMANTIC_DATE'})],pending_question:{fields:['time'],purpose:'COLLECT_TIME'}});
  const plan={missing_fields:['time'],required_fields:['vehicle','location','date','time']};
  const load={semantic_state:{revision:34,language:'ar',created_at:'2026-09-11T07:47:12.213Z',last_confirmed_facts:{date:{value:'2026-09-11',source:'CUSTOMER_STATED',confidence:1}}},cognitive_policy:{mode:'active'}};
  const projection=_v3RuntimeTest.authorityProjection({load,state:s,plan,context:c,action:'CLARIFY',at:new Date('2026-09-14T05:29:53.433Z'),interpretation:{provider:'vercel-ai-gateway',model:'openai/gpt-5.6-luna',proposal:{confidence:.98}}});
  assert.equal(projection.last_confirmed_facts.date.value,'2026-09-14');
  assert.equal(projection.last_confirmed_facts.vehicle.value,'saloon');
  assert.equal(projection.last_confirmed_facts.delivery_mode.value,'MOBILE');
});
