import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretConversationTurnV3} from '../api/_dabbir-conversation-v3-interpreter.js';
import {understandTurnV3,seedConversationStateV3} from '../api/_dabbir-conversation-v3-understanding.js';
import {planConversationTurnV3} from '../api/_dabbir-conversation-v3-brain.js';

// Real interpreter/reducer/planner, injected provider JSON and synthetic receipts.
// No real provider, database, worker, Meta delivery or historic-state repair claim.
const at='2026-09-12T10:00:00.000Z';
const ids={business:'batch-fixture-business',conversation:'batch-fixture-conversation',branch:'batch-fixture-branch',customer:'batch-fixture-customer',service:'batch-fixture-service'};
const locationBody='[synthetic location display; not customer vehicle text]';
const text=(body,id='text-message')=>({id,body,created_at:at});
const location=(id='location-message')=>text(locationBody,id);
const receipt=(id='location-message',extra={})=>({message_id:id,business_id:ids.business,conversation_id:ids.conversation,value:{lat:0,lng:0,label:null},...extra});
const fact=(field,value,source='CUSTOMER_CONFIRMED')=>({field,value,status:'VERIFIED',source,confidence:1,resolution:'TEST_FIXTURE'});
const prior=()=>({version:2,goal:'BOOK_SERVICE',intent_confirmed:true,episode_id:'test-episode',last_turn_at:at,facts:[fact('branch',ids.branch,'DATABASE_FACT'),fact('service',ids.service),fact('price',40,'DATABASE_FACT'),fact('delivery_mode','MOBILE','DATABASE_FACT')],tentatives:[{field:'vehicle',status:'TENTATIVE',candidate_value:'station',value:'station',surface:'station',source:'SEMANTIC_PROPOSAL',confidence:.95,resolution:'ALLOWED_VALUE_NEEDS_GROUNDING'}],pending_question:{fields:['vehicle'],purpose:'CONFIRM_TENTATIVE_VEHICLE',candidate_value:'station'}});
function context(messages,receipts=[]){return {
  business:{id:ids.business,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},
  conversation:{id:ids.conversation,branch_id:ids.branch,language:'ar'},customer:{id:ids.customer},
  services:[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name:'Exterior',price:40,duration_minutes:30}],workers:[],
  activity_profile:{services:[{service_id:ids.service,business_id:ids.business,branch_id:ids.branch,delivery_modes:['MOBILE'],booking_model:'APPOINTMENT',mode_requirements:{MOBILE:{required:['vehicle','location','date','time']}},entity_definitions:{vehicle:{type:'ENUM',values:['station','saloon']},location:{type:'LOCATION'},date:{type:'DATE'},time:{type:'TIME'}}}]},
  batch:{last_message_at:at},batch_messages:messages,location_receipts:receipts,
};}
function output(extra={}){return {intent:'BOOKING',role:'CORRECTION',confidence:.99,service_candidate:null,entities:[],side_questions:[],invalidated_fields:[],requested_action:'NONE',confirmation:null,...extra};}
const correctionOutput=surface=>output({invalidated_fields:['vehicle'],entities:[{entity:'vehicle',value:'saloon',surface,confidence:.99,correction:true}]});
async function run(c,model,previous=prior()){
  const calls=[];
  const interpreted=await interpretConversationTurnV3({context:c,previousState:previous,now:new Date(at),generate:async input=>{
    calls.push(input);
    if(!model)throw new Error('UNEXPECTED_MODEL_CALL');
    return {ok:true,reply:JSON.stringify(model),provider:'test-fixture',model:'injected-json'};
  }});
  const understood=understandTurnV3({context:{...c,v3_fast_facts:interpreted.fastFacts},proposal:interpreted.proposal,previousState:previous,now:new Date(at)});
  return {calls,interpreted,understood};
}
function assertCorrectionAndLocation(result){
  const {interpreted,understood}=result;
  assert.equal(result.calls.length,1,'mixed content must reach the existing model exactly once');
  assert.deepEqual(interpreted.fastFacts.map(f=>[f.field,f.receipt_id]),[['location','location-message']]);
  assert.ok(understood.facts.some(f=>f.field==='location'&&f.status==='VERIFIED'&&f.source==='PROVIDER_VERIFIED'));
  assert.ok(understood.tentatives.some(f=>f.field==='vehicle'&&f.candidate_value==='saloon'));
  assert.ok(!understood.tentatives.some(f=>f.field==='vehicle'&&(f.candidate_value==='station'||f.surface===locationBody)));
  assert.ok(!understood.facts.some(f=>f.field==='vehicle'),'location is not vehicle confirmation');
  assert.ok(!understood.facts.some(f=>f.field==='slot'),'location is not booking confirmation');
}

for(const [language,body,surface] of [['ar','لا، سيارتي صالون مب ستيشن','صالون'],['en','No, the car is a saloon, not a station.','saloon']]){
  for(const order of ['text-location','location-text'])test(`${language}: correction survives ${order} in one batch`,async()=>{
    const m=text(body),loc=location(),messages=order==='text-location'?[m,loc]:[loc,m];
    const c=context(messages,[receipt()]),before=structuredClone(c);
    const result=await run(c,correctionOutput(surface));
    assertCorrectionAndLocation(result);
    assert.equal(result.calls[0].message,body,'location display must not become model text');
    assert.deepEqual(c,before,'interpreter must not mutate the supplied batch');
  });
}

test('isolated receipt keeps the zero-model path and the unconfirmed vehicle',async()=>{
  const result=await run(context([location()],[receipt()]),null);
  assert.equal(result.calls.length,0);
  assert.equal(result.interpreted.fastFacts.length,1);
  assert.equal(result.understood.tentatives.find(f=>f.field==='vehicle').candidate_value,'station');
  assert.ok(!result.understood.facts.some(f=>f.field==='vehicle'||f.field==='slot'));
});

for(const order of ['text-location','location-text'])test(`receipt does not consume a price question: ${order}`,async()=>{
  const m=text('كم السعر؟'),loc=location();
  const result=await run(context(order==='text-location'?[m,loc]:[loc,m],[receipt()]),output({role:'SIDE_QUESTION',intent:'PRICING',side_questions:[{type:'price',surface:'السعر'}]}));
  assert.equal(result.calls.length,1);
  assert.ok(result.understood.facts.some(f=>f.field==='location'));
  assert.ok(result.understood.side_questions.some(q=>q.type==='price'));
  assert.equal(result.understood.tentatives.find(f=>f.field==='vehicle').candidate_value,'station');
});

test('correction split around a location retains both text parts in order',async()=>{
  const c=context([text('لا، سيارتي','text-first'),location(),text('صالون مب ستيشن','text-last')],[receipt()]);
  const result=await run(c,correctionOutput('صالون'));
  assertCorrectionAndLocation(result);
  assert.ok(result.calls[0].message.indexOf('لا، سيارتي')<result.calls[0].message.indexOf('صالون مب ستيشن'));
  assert.ok(!result.calls[0].message.includes(locationBody));
});

test('model failure cannot fall back to location and silently finish mixed content',async()=>{
  const c=context([text('لا، سيارتي صالون'),location()],[receipt()]);
  await assert.rejects(()=>interpretConversationTurnV3({context:c,previousState:prior(),generate:async()=>({ok:false})}),{code:'V3_INTERPRETER_UNAVAILABLE'});
});

test('malformed model output still rejects the whole mixed interpretation',async()=>{
  const c=context([text('لا، سيارتي صالون'),location()],[receipt()]);
  await assert.rejects(()=>interpretConversationTurnV3({context:c,previousState:prior(),generate:async()=>({ok:true,reply:'not json'})}),{code:'V3_INTERPRETER_CONTRACT_INVALID'});
});

test('unreceipted location-looking text grants no GPS authority',async()=>{
  const result=await run(context([text('لا، سيارتي صالون'),location()]),correctionOutput('صالون'));
  assert.equal(result.calls.length,1);
  assert.equal(result.interpreted.fastFacts.length,0);
  assert.ok(!result.understood.facts.some(f=>f.field==='location'));
});

for(const [name,change] of [['another business',{business_id:'foreign-business'}],['another conversation',{conversation_id:'foreign-conversation'}],['another message',{message_id:'foreign-message'}]])test(`receipt for ${name} cannot be consumed`,async()=>{
  const result=await run(context([text('لا، سيارتي صالون'),location()],[receipt('location-message',change)]),correctionOutput('صالون'));
  assert.equal(result.calls.length,1);
  assert.equal(result.interpreted.fastFacts.length,0);
  assert.ok(!result.understood.facts.some(f=>f.field==='location'));
});

test('provider cannot cite a receipt display as semantic evidence for the vehicle',async()=>{
  const c=context([text('لا، سيارتي صالون'),location()],[receipt()]);
  await assert.rejects(()=>run(c,correctionOutput(locationBody)),{code:'V3_INTERPRETER_CONTRACT_INVALID'});
});

test('oversized mixed text is rejected rather than silently clipping a later correction',async()=>{
  const c=context([text('x'.repeat(2050)),location(),text('لا، سيارتي صالون','last-text')],[receipt()]);
  let calls=0;
  await assert.rejects(()=>interpretConversationTurnV3({context:c,previousState:prior(),generate:async()=>{calls++;return {ok:true,reply:JSON.stringify(correctionOutput('صالون'))};}}),{code:'V3_INTERPRETER_CONTRACT_INVALID'});
  assert.equal(calls,0);
});

test('distinct location receipts in a mixed batch do not silently select one',async()=>{
  const c=context([text('لا، سيارتي صالون'),location('first-point'),location()],[receipt('first-point'),receipt('location-message',{value:{lat:1,lng:1,label:null}})]);
  await assert.rejects(()=>run(c,correctionOutput('صالون')),{code:'V3_INTERPRETER_CONTRACT_INVALID'});
});

test('repeated identical location receipts do not drop text or create multiple locations',async()=>{
  const c=context([location('first-point'),text('لا، سيارتي صالون'),location()],[receipt('first-point'),receipt()]);
  const result=await run(c,correctionOutput('صالون'));
  assertCorrectionAndLocation(result);
});

test('mixed result survives the real reducer/planner and modeled JSON reload',async()=>{
  const c=context([text('لا، سيارتي صالون'),location()],[receipt()]);
  const previous=prior(),result=await run(c,correctionOutput('صالون'),previous);
  assertCorrectionAndLocation(result);
  const planned=planConversationTurnV3({previousState:previous,understanding:result.understood,episode:{kind:'CONTINUE',reason:'TEST_CORRECTION'},context:c});
  const saved=JSON.parse(JSON.stringify(planned.state));
  const reloaded=seedConversationStateV3({previousShadow:saved,canonicalState:{}});
  assert.equal(reloaded.tentatives.find(f=>f.field==='vehicle').candidate_value,'saloon');
  assert.equal(reloaded.facts.find(f=>f.field==='location').receipt_id,'location-message');
  assert.equal(planned.plan.proposed_action,'CLARIFY');
  assert.ok(!planned.response.text.includes(locationBody));
  assert.ok(!reloaded.facts.some(f=>f.field==='vehicle'||f.field==='slot'));
  assert.ok(reloaded.tentatives.every(f=>!Object.hasOwn(f,'candidate_id')&&!Object.hasOwn(f,'candidate_revision')),'this patch does not change candidate identity');
});

test('location delivered in a later batch preserves an already interpreted correction',async()=>{
  const firstContext=context([text('لا، سيارتي صالون')]);
  const first=await run(firstContext,correctionOutput('صالون'));
  const next={...prior(),facts:first.understood.facts,tentatives:first.understood.tentatives};
  const second=await run(context([location()],[receipt()]),null,next);
  assert.equal(first.calls.length,1);assert.equal(second.calls.length,0);
  assert.equal(second.understood.tentatives.find(f=>f.field==='vehicle').candidate_value,'saloon');
  assert.ok(second.understood.facts.some(f=>f.field==='location'));
});
