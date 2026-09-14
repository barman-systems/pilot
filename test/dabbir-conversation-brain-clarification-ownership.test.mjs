import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {clarification as legacyClarification} from '../api/_dabbir-semantic-engine-core.js';
import {semanticClarificationReply} from '../api/_dabbir-conversation-brain-clarification.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const context={
  business:{id:'b1'},conversation:{branch_id:'br1'},customer:{id:'c1'},
  services:[{id:'svc1',business_id:'b1',branch_id:'br1',name_ar:'غسيل خارجي',name_en:'Exterior wash'}],
};
const fact=(value,source='CUSTOMER_CONFIRMED',confidence=1)=>({value,source,confidence,status:'active'});
const state=overrides=>({
  language:'ar',intent:'BOOKING',entities:{service:fact('svc1')},missing_fields:[],unresolved_references:[],
  activity_requirements:{contract:{delivery_modes:['AT_BUSINESS','MOBILE'],entity_definitions:{
    location:{question_ar:'وين موقع الخدمة؟',question_en:'Where is the service location?'},
    vehicle:{question_ar:'أي سيارة؟',question_en:'Which vehicle?'},
    property_details:{question_ar:'ما تفاصيل المكان؟',question_en:'What property details?'},
  }}},
  ...overrides,
});

const cases=[
  state({unresolved_references:['branch']}),
  state({language:'en',unresolved_references:['voice_transcript']}),
  state({intent:'CANCEL_BOOKING',missing_fields:['intent_confirmation']}),
  state({language:'en',missing_fields:['service'],entities:{service:{value:null,status:'unresolved',source:'AI_INFERENCE',confidence:.5,label:'VIP'}}}),
  state({missing_fields:['time'],entities:{service:fact('svc1'),time:{value:null,status:'active',source:'CUSTOMER_STATED',confidence:.55,part:'am_pm',hour:5}}}),
  state({language:'en',missing_fields:['delivery_mode']}),
  state({missing_fields:['location'],entities:{service:fact('svc1'),date:fact('2026-09-15'),time:fact('17:00')}}),
  state({language:'en',missing_fields:['vehicle'],entities:{service:fact('svc1'),vehicle:{value:'station',status:'active',source:'AI_INFERENCE',confidence:.5}}}),
  state({unresolved_references:['multiple_options']}),
  state({language:'en'}),
];

test('Brain clarification renderer preserves legacy customer wording byte-for-byte',()=>{
  for(const sample of cases){
    assert.equal(semanticClarificationReply(structuredClone(sample),context),legacyClarification(structuredClone(sample),context));
    assert.equal(semanticClarificationReply(structuredClone(sample),context,{acknowledge:false}),legacyClarification(structuredClone(sample),context,{acknowledge:false}));
  }
});

test('semantic facade exports Brain clarification instead of legacy core clarification',()=>{
  const facade=read('api/_dabbir-semantic-engine.js');
  assert.match(facade,/semanticClarificationReply as clarification/);
  assert.match(facade,/from '\.\/_dabbir-conversation-brain-clarification\.js'/);
  assert.doesNotMatch(facade,/\n\s*clarification,\n\s*semanticPlannerContext/);
});

test('quality repair and queued-goal presentation use the Brain clarification owner',()=>{
  const quality=read('api/_dabbir-conversation-brain-quality.js');
  const queued=read('api/_dabbir-conversation-brain-queued-goal.js');
  assert.match(quality,/semanticClarificationReply/);
  assert.match(quality,/COGNITIVE_REPLAN/);
  assert.match(queued,/semanticClarificationReply/);
  assert.doesNotMatch(queued,/legacyQueuedGoalPrompt/);
  assert.doesNotMatch(queued,/_dabbir-goal-queue-core/);
});

test('Brain clarification owner remains presentation-only',()=>{
  const renderer=read('api/_dabbir-conversation-brain-clarification.js');
  for(const forbidden of [
    'dabbir_semantic_execute_v2','dabbir_semantic_commit_v2','dabbir_whatsapp_ai_check_availability',
    'serviceRpc(','fetch(','deliver(','handoff(','SUPABASE_SERVICE_ROLE_KEY',
  ])assert.equal(renderer.includes(forbidden),false,`clarification owner gained execution authority: ${forbidden}`);
});
