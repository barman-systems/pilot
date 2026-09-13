import test from 'node:test';
import assert from 'node:assert/strict';
import {seedConversationStateV3,understandTurnV3} from '../api/_dabbir-conversation-v3-understanding.js';
import {classifyEpisodeBoundaryV3} from '../api/_dabbir-conversation-v3-episode.js';
import {planConversationTurnV3} from '../api/_dabbir-conversation-v3-brain.js';

// Frozen before the implementation edit. Real seed/reducer/planner functions;
// semantic proposals and server fast facts are supplied fixtures. This is not
// live-model, RPC persistence, worker concurrency or real-phone evidence.
const oldAt='2026-09-11T10:00:00.000Z',at='2026-09-12T10:00:00.000Z';
const ids={business:'fixture-business',conversation:'fixture-conversation',branch:'fixture-branch',service:'fixture-service'};
const point={lat:0,lng:0,label:null};
const fact=(field,value,source='CUSTOMER_CONFIRMED',extra={})=>({field,value,status:'VERIFIED',source,confidence:1,resolution:'FIXTURE',...extra});
const msg=(body,id,created_at=at)=>({id,body,created_at});
function prior(){return {version:2,episode_id:'fixture-episode',goal:'BOOK_SERVICE',intent_confirmed:false,last_turn_at:oldAt,last_operational_turn_at:oldAt,facts:[fact('service',ids.service),fact('vehicle','saloon')],tentatives:[],pending_question:{fields:['location'],purpose:'COLLECT_LOCATION'}};}
function context(messages=[msg('هلا','hello')],fastFacts=[],lang='ar'){
  return {business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},conversation:{id:ids.conversation,branch_id:ids.branch,language:lang},services:[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name:'Exterior',price:40,duration_minutes:30}],activity_profile:{services:[{service_id:ids.service,business_id:ids.business,branch_id:ids.branch,delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',mode_requirements:{MOBILE:{required:['vehicle','location','date','time']}},entity_definitions:{vehicle:{type:'ENUM',values:['saloon','station']},location:{type:'LOCATION'},date:{type:'DATE'},time:{type:'TIME'}}}]},batch_messages:messages,batch:{last_message_at:messages.at(-1).created_at},v3_fast_facts:fastFacts};
}
const social=(role='GREETING',intent='SUPPORT')=>({intent,action:'REPLY',confidence:1,entities:[],serviceQuestions:[],dialogue:{message_role:role,invalidated_fields:[]}});
const location=(id='point')=>({field:'location',value:point,source:'PROVIDER_VERIFIED',resolution:'SIGNED_WHATSAPP_LOCATION',receipt_id:id});
function run(c,p=prior(),proposal=social()){
  const before=structuredClone({c,p,proposal});
  const seeded=seedConversationStateV3({previousShadow:p,canonicalState:{}});
  const episode=classifyEpisodeBoundaryV3({previousState:seeded,proposal,context:c});
  const u=understandTurnV3({previousState:seeded,proposal,context:c});
  const result=planConversationTurnV3({previousState:seeded,understanding:u,episode,context:c});
  assert.deepEqual({c,p,proposal},before,'classification must not mutate its inputs');
  return {...result,u,seeded};
}
function assertOperational(result){
  assert.equal(result.u.signals.social_only,false);
  assert.notEqual(result.plan.turn_disposition,'SOCIAL_ONLY');
  assert.equal(result.state.last_operational_turn_at,at);
}
function assertSocial(result,expectedAt=oldAt){
  assert.equal(result.u.signals.social_only,true);
  assert.equal(result.plan.turn_disposition,'SOCIAL_ONLY');
  assert.equal(result.plan.proposed_action,'REPLY');
  assert.equal(result.state.last_operational_turn_at,expectedAt);
}

for(const role of ['GREETING','SOCIAL'])for(const lang of ['ar','en'])for(const order of ['text-location','location-text'])test(`${role}/${lang}/${order}: current location participates in the whole-turn decision`,()=>{
  const text=msg(lang==='ar'?'هلا':'hello','hello'),pin=msg('[receipt-backed display]','point');
  const c=context(order==='text-location'?[text,pin]:[pin,text],[location()],lang);
  const r=run(c,prior(),social(role));assertOperational(r);
  assert.equal(r.state.facts.find(f=>f.field==='location').receipt_id,'point');
  assert.ok(!r.state.pending_question?.fields.includes('location'));
  assert.equal(r.plan.proposed_action,'CLARIFY','still needs date and time');
  assert.equal(r.u.signals.booking_intent_strong,false);
  assert.equal(r.state.intent_confirmed,false,'location is not booking consent');
  assert.equal(r.u.role,role,'do not rewrite the text speech act into confirmation');
});

for(const role of ['GREETING','SOCIAL'])test(`${role}: a trusted current slot also prevents social-only deferral`,()=>{
  // Same internal producer contract as the presented-slot fast path; no DB
  // authority is inferred or executed in this test.
  const slot={field:'slot',value:0,source:'CUSTOMER_CONFIRMED',resolution:'PRESENTED_SLOT_SELECTION',starts_at:'2026-09-13T10:00:00Z',service_id:ids.service};
  const p=prior();p.pending_question={fields:['slot'],purpose:'CHOOSE_SLOT'};
  const r=run(context([msg('hello','hello')],[slot]),p,social(role));assertOperational(r);
  assert.ok(r.u.turn_verified.some(f=>f.field==='slot'&&f.value===0));
  assert.equal(r.state.intent_confirmed,false);
  assert.equal(r.plan.proposed_action,'CLARIFY','slot cannot bypass missing location/date/time');
});

for(const role of ['GREETING','SOCIAL'])for(const intent of ['SUPPORT','BOOKING'])test(`${role}/${intent}: recomputed database mode is not current customer evidence`,()=>{
  const p=prior(),r=run(context(),p,social(role,intent));
  assert.ok(r.u.turn_verified.some(f=>f.field==='delivery_mode'&&f.source==='DATABASE_FACT'));
  assertSocial(r);assert.deepEqual(r.state.pending_question,p.pending_question);
  assert.equal(r.state.intent_confirmed,false);
});

for(const role of ['GREETING','SOCIAL'])test(`${role}: historical reconciliation is not a new customer correction`,()=>{
  const p=prior();p.facts.push(fact('location',point,'PROVIDER_VERIFIED',{receipt_id:'old-point',resolution:'SIGNED_WHATSAPP_LOCATION'}));
  p.tentatives=[{field:'vehicle',value:null,candidate_value:null,status:'TENTATIVE',source:'CURRENT_TURN_SURFACE',resolution:'SEMANTIC_SURFACE_UNMAPPED',surface:'📍 موقع واتساب: 0.000000, 0.000000'}];
  p.pending_question={fields:['vehicle'],purpose:'MAP_TENTATIVE_VEHICLE'};
  const r=run(context(),p,social(role));
  assert.ok(r.u.invalidations.some(i=>i.reason==='PROVIDER_EVIDENCE_FIELD_MISMATCH'));
  assertSocial(r);assert.equal(r.state.intent_confirmed,false);
});

test('stored verified location and prior tentative are not current-turn input',()=>{
  const p=prior();p.facts.push(fact('location',point,'PROVIDER_VERIFIED',{receipt_id:'old-point',resolution:'SIGNED_WHATSAPP_LOCATION'}));
  p.tentatives=[{field:'vehicle',candidate_value:'station',value:'station',surface:'ستيشن',status:'TENTATIVE',source:'SEMANTIC_PROPOSAL',confidence:.7}];
  p.pending_question={fields:['vehicle'],purpose:'CONFIRM_TENTATIVE_VEHICLE'};
  const r=run(context(),p);assertSocial(r);assert.deepEqual(r.state.tentatives,p.tentatives);
});

test('same coordinates in a new receipt still count as a current answer',()=>{
  const p=prior();p.facts.push(fact('location',point,'PROVIDER_VERIFIED',{receipt_id:'old-point',resolution:'SIGNED_WHATSAPP_LOCATION'}));
  const r=run(context([msg('هلا','hello'),msg('[display]','point')],[location()]),p);
  assertOperational(r);assert.equal(r.state.facts.find(f=>f.field==='location').receipt_id,'point');
});

test('location received out of question order does not confirm a tentative vehicle',()=>{
  const p=prior();p.facts=p.facts.filter(f=>f.field!=='vehicle');
  p.tentatives=[{field:'vehicle',candidate_value:'station',value:'station',surface:'ستيشن',status:'TENTATIVE',source:'SEMANTIC_PROPOSAL',confidence:.7}];
  p.pending_question={fields:['vehicle'],purpose:'CONFIRM_TENTATIVE_VEHICLE'};
  const r=run(context([msg('هلا','hello'),msg('[display]','point')],[location()]),p);
  assertOperational(r);assert.ok(!r.state.facts.some(f=>f.field==='vehicle'));
  assert.equal(r.state.tentatives[0].confidence,.7);
  assert.equal(r.plan.next_question.purpose,'CONFIRM_TENTATIVE_VEHICLE');
  assert.equal(r.state.intent_confirmed,false);
});

test('rejected fast-fact source/type pairs do not become accepted operational evidence',()=>{
  const fast=[{...location(),source:'AI_INFERENCE'},{field:'slot',value:0,source:'PROVIDER_VERIFIED'},{field:'vehicle',value:'station',source:'CUSTOMER_CONFIRMED'}];
  const r=run(context(undefined,fast));assertSocial(r);
  assert.ok(!r.u.turn_verified.some(f=>['location','slot'].includes(f.field)));
});

test('explicit customer invalidation is operational even when the text role is greeting',()=>{
  const proposal=social();proposal.dialogue.invalidated_fields=['vehicle'];
  const r=run(context([msg('هلا مب صالون','correction')]),prior(),proposal);
  assertOperational(r);assert.ok(r.u.invalidations.some(i=>i.field==='vehicle'&&i.reason==='CUSTOMER_CORRECTION'));
  assert.ok(!r.state.facts.some(f=>f.field==='vehicle'));
});

test('greeting and a price question remain operational without any fast fact',()=>{
  const proposal=social();proposal.serviceQuestions=[{field:'price',evidence:'السعر'}];
  const r=run(context([msg('هلا كم السعر','question')]),prior(),proposal);
  assertOperational(r);assert.equal(r.plan.answers[0].value,40);
});

test('current correction keeps its confidence and does not acquire verification from a greeting',()=>{
  const proposal=social();proposal.dialogue.invalidated_fields=['vehicle'];
  proposal.entities=[{entity:'vehicle',value:'station',evidence:'ستيشن',confidence:.6,correction:true}];
  const r=run(context([msg('هلا سيارتي ستيشن مب صالون','correction')]),prior(),proposal);
  assertOperational(r);assert.equal(r.state.tentatives.find(t=>t.field==='vehicle').confidence,.6);
  assert.ok(!r.state.facts.some(f=>f.field==='vehicle'));assert.equal(r.state.intent_confirmed,false);
});

test('a later greeting after JSON reload does not replay an earlier fast fact as new evidence',()=>{
  const first=run(context([msg('هلا','hello'),msg('[display]','point')],[location()]));assertOperational(first);
  const stamp='2026-09-12T10:02:00.000Z';
  const r=run(context([msg('hello','later-hello',stamp)]),JSON.parse(JSON.stringify(first.state)));
  assertSocial(r,at);assert.equal(r.state.last_turn_at,stamp);
  assert.equal(r.state.facts.find(f=>f.field==='location').receipt_id,'point');
});

test('repeated social turns and modeled reload never renew operational age or add candidate identity',()=>{
  let p=prior();
  for(let i=0;i<4;i++){
    const stamp=new Date(Date.parse(at)+i*1000).toISOString();
    const r=run(context([msg('هلا',`hello-${i}`,stamp)]),p);assertSocial(r);
    p=JSON.parse(JSON.stringify(r.state));
    assert.ok(!JSON.stringify(p).includes('candidate_id'));assert.ok(!JSON.stringify(p).includes('candidate_revision'));
  }
});
