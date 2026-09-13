import test from 'node:test';
import assert from 'node:assert/strict';
import {runConversationV3Runtime} from '../api/_dabbir-conversation-v3-runtime.js';
import {interpretConversationTurnV3} from '../api/_dabbir-conversation-v3-interpreter.js';
import {assertDialoguePlanV3} from '../api/_dabbir-conversation-v3-invariants.js';

const ids={business:'10000000-0000-4000-8000-000000000001',branch:'20000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',customer:'40000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001'};
const fact=(field,value,source='CUSTOMER_CONFIRMED',extra={})=>({field,value,source,status:'VERIFIED',confidence:1,...extra});
const pin='📍 موقع واتساب: 24.453884, 54.377343';
const contract={service_id:ids.service,delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',entity_definitions:{vehicle:{type:'ENUM',values:['saloon','station']},location:{type:'VERIFIED_GPS'},date:{type:'DATE'},time:{type:'TIME'}},mode_requirements:{MOBILE:{required:['vehicle']}},contract_version:'v1'};
function previous({at='2026-09-11T16:45:00Z',surface=pin,complete=false}={}){
  return {version:2,episode_id:'previous-booking',episode_started_at:at,last_turn_at:at,goal:'BOOK_SERVICE',intent_confirmed:true,
    facts:[fact('service',ids.service),fact('price',40,'DATABASE_FACT'),fact('delivery_mode','MOBILE','DATABASE_FACT'),fact('location',{lat:24.453884124,lng:54.37734291,label:''},'PROVIDER_VERIFIED',{receipt_id:'signed-location-message',resolution:'SIGNED_WHATSAPP_LOCATION'}),
      ...(complete?[fact('vehicle','station'),fact('date','2026-09-12'),fact('time','19:00'),fact('slot',0,'CUSTOMER_CONFIRMED',{starts_at:'2026-09-12T15:00:00Z'})]:[])],
    tentatives:complete?[]:[{field:'vehicle',value:null,candidate_value:null,source:'CURRENT_TURN_SURFACE',status:'TENTATIVE',surface,confidence:1,resolution:'SEMANTIC_SURFACE_UNMAPPED'}],
    pending_question:complete?null:{fields:['vehicle'],purpose:'MAP_TENTATIVE_VEHICLE'}};
}
const interpretation=(over={})=>({intent:'SUPPORT',role:'GREETING',confidence:1,service_candidate:null,entities:[],side_questions:[],invalidated_fields:[],requested_action:'NONE',confirmation:null,...over});
function harness(initial){
  let semantic={v3_runtime:structuredClone(initial)},counter=0;
  const sent=[],calls=[],providerInputs=[],commits=[];
  return {sent,calls,providerInputs,commits,get state(){return semantic.v3_runtime;},async turn(body,at,modelResult){
    const context={business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},conversation:{id:ids.conversation,branch_id:ids.branch,language:'ar'},customer:{id:ids.customer},services:[{id:ids.service,name_ar:'خارجي',price:40}],activity_profile:{services:[contract]},batch:{id:`batch-${++counter}`,last_message_at:at},batch_messages:[{id:`message-${counter}`,body,created_at:at}]};
    const rpc=async(name,args)=>{calls.push(name);if(name==='dabbir_semantic_commit_v2'){semantic=args.p_state;commits.push(semantic);return {version:counter,replay:false,state:semantic};}if(['dabbir_semantic_assert_current_v2','dabbir_record_ai_operator_decision_v1'].includes(name))return true;throw new Error(`Unexpected authority call: ${name}`);};
    const interpreter=args=>interpretConversationTurnV3({...args,generate:async input=>{providerInputs.push(JSON.parse(input.businessContext));return {ok:true,reply:JSON.stringify(modelResult),provider:'fixture',model:'fixture'};}});
    return runConversationV3Runtime({context,claim:{batch_id:context.batch.id,lock_token:'test-lock'},rpc,interpreter,preloadedLoad:{semantic_state:semantic,version:counter-1,message_revision:counter,cognitive_policy:{mode:'canary'}},deliver:async(_claim,_ctx,text)=>{sent.push(text);return {providerMessageId:`receipt-${counter}`};},finish:async()=>true,handoff:async()=>{throw new Error('Unexpected handoff');},bookingText:()=>'',slotsText:()=>'',logger:{info(){}}});
  }};
}

test('real runtime: returning greeting does not turn yesterday’s provider location into a vehicle question',async()=>{
  const h=harness(previous());
  const result=await h.turn('هلا','2026-09-12T14:58:16Z',interpretation());
  assert.equal(result.action,'REPLY');
  assert.doesNotMatch(h.sent[0],/السيارة|موقع واتساب|خارجي|24\.453884/);
  assert.match(h.sent[0],/هلا/);
  assert.equal(h.state.episode_id,'previous-booking','greeting must not erase the booking episode');
  assert.equal(h.state.facts.find(x=>x.field==='service').value,ids.service);
  assert.equal(h.state.tentatives.length,0);
  assert.ok(h.state.invalidations.some(x=>x.field==='vehicle'&&x.reason==='PROVIDER_EVIDENCE_FIELD_MISMATCH'));
  assert.equal(h.providerInputs[0].previous.tentatives.length,0,'repair must run before model interpretation');
});

for(const role of ['NEW_REQUEST','ANSWER_TO_PENDING_QUESTION'])test(`real runtime: greeting does not refresh old booking evidence before fresh request (${role})`,async()=>{
  const h=harness(previous());
  await h.turn('هلا','2026-09-12T14:58:16Z',interpretation());
  await h.turn('ابا غسيل الحين','2026-09-12T14:58:24Z',interpretation({intent:'BOOKING',role,entities:[{entity:'date',value:'2026-09-12',surface:'الحين',confidence:.98,correction:false},{entity:'time',value:'18:58',surface:'الحين',confidence:.98,correction:false}]}));
  assert.equal(h.state.episode_boundary.kind,'NEW_EPISODE');
  assert.ok(h.state.episode_boundary.idle_ms>20*60*60*1000);
  assert.equal(h.state.facts.some(f=>f.field==='service'||f.field==='location'),false,'new request cannot silently reuse yesterday’s selection/GPS');
  assert.equal(h.state.facts.find(f=>f.field==='immediacy')?.value,'NOW');
  assert.deepEqual(h.state.pending_question.fields,['service']);
  assert.doesNotMatch(h.sent[1],/فهمت السيارة|موقع واتساب/);
  assert.equal(h.calls.some(x=>x==='dabbir_semantic_execute_v2'),false);
});

for(const language of [{body:'هلا',role:'GREETING'},{body:'thanks',role:'SOCIAL'}])test(`social turn cannot execute a previously ready booking (${language.role})`,async()=>{
  const h=harness(previous({at:'2026-09-12T14:58:00Z',complete:true}));
  const result=await h.turn(language.body,'2026-09-12T14:58:16Z',interpretation({role:language.role}));
  assert.equal(result.action,'REPLY');
  assert.equal(h.state.facts.find(x=>x.field==='slot')?.value,0);
  assert.equal(h.calls.includes('dabbir_semantic_execute_v2'),false);
});

test('social interruption preserves a valid pending vehicle candidate and its subsequent confirmation',async()=>{
  const p=previous({at:'2026-09-12T14:58:00Z',surface:'الاستيشن'});
  Object.assign(p.tentatives[0],{value:'station',candidate_value:'station',source:'SEMANTIC_PROPOSAL',resolution:'ALLOWED_VALUE_NEEDS_GROUNDING'});
  p.pending_question={fields:['vehicle'],purpose:'CONFIRM_TENTATIVE_VEHICLE'};
  const h=harness(p);
  await h.turn('هلا','2026-09-12T14:58:16Z',interpretation());
  assert.doesNotMatch(h.sent[0],/السيارة|ستيشن/);
  assert.equal(h.state.tentatives[0].candidate_value,'station');
  assert.equal(h.state.pending_question.purpose,'CONFIRM_TENTATIVE_VEHICLE');
  await h.turn('صح','2026-09-12T14:58:24Z',null);
  assert.equal(h.state.facts.find(f=>f.field==='vehicle')?.value,'station');
  assert.equal(h.state.tentatives.length,0);
});

test('current request in a greeting turn is still processed',async()=>{
  const h=harness(previous({at:'2026-09-12T14:58:00Z',surface:'كامري'}));
  await h.turn('هلا بكم السعر','2026-09-12T14:58:16Z',interpretation({intent:'PRICING',side_questions:[{type:'price',surface:'السعر'}]}));
  assert.match(h.sent[0],/40 درهم/);
  assert.equal(h.state.tentatives[0].surface,'كامري');
});

test('a semantically explicit new booking cannot reuse an old booking merely because the goals match',async()=>{
  const p=previous({at:'2026-09-12T14:58:00Z'});
  p.episode_started_at='2026-09-11T16:45:00Z';
  const h=harness(p);
  await h.turn('أحتاج حجز غسيل جديد','2026-09-12T14:58:24Z',interpretation({intent:'BOOKING',role:'NEW_REQUEST'}));
  assert.equal(h.state.episode_boundary.kind,'NEW_EPISODE');
  assert.equal(h.state.facts.some(x=>x.field==='service'||x.field==='location'),false);
  assert.deepEqual(h.state.pending_question.fields,['service']);
});

for(const goal of ['RESCHEDULE_BOOKING','CANCEL_BOOKING'])test(`greeting alone does not resume ${goal}`,async()=>{
  const p=previous({at:'2026-09-12T14:58:00Z',complete:true});p.goal=goal;
  const h=harness(p);
  const result=await h.turn('هلا','2026-09-12T14:58:24Z',interpretation());
  assert.equal(result.action,'REPLY');assert.equal(h.state.goal,goal);
});

test('tentative deferral cannot conceal evidence during an operational plan',()=>{
  const state={facts:[],tentatives:[{field:'vehicle'}]};
  for(const over of [{turn_disposition:'OPERATIONAL'},{proposed_action:'READY_FOR_AUTHORITY'},{next_question:{fields:['service']}},{answers:[{type:'price',value:40}]},{surfaced_facts:['service']}]){
    assert.throws(()=>assertDialoguePlanV3({state,plan:{turn_disposition:'SOCIAL_ONLY',proposed_action:'REPLY',deferred_tentative_fields:['vehicle'],...over}}),{code:'V3_INVALID_TENTATIVE_DEFERRAL'});
  }
  assert.throws(()=>assertDialoguePlanV3({state,plan:{proposed_action:'REPLY'}}),{code:'V3_TENTATIVE_FACT_DROPPED'});
});

for(const change of [p=>{p.facts=p.facts.filter(f=>f.field!=='location');},p=>{p.facts.find(f=>f.field==='location').source='CUSTOMER_STATED';},p=>{p.tentatives[0].surface='كامري';},p=>{p.tentatives[0].surface='📍 موقع واتساب: 25.000000, 55.000000';}])test('evidence reconciliation does not erase an unproven or unrelated tentative',async()=>{
  const p=previous();change(p);const h=harness(p);
  await h.turn('هلا','2026-09-12T14:58:16Z',interpretation());
  assert.deepEqual(h.state.tentatives,p.tentatives);
});
