import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyEpisodeBoundaryV3,V3_EPISODE_IDLE_MS} from '../api/_dabbir-conversation-v3-episode.js';

const context=(body,at)=>({batch:{last_message_at:at},batch_messages:[{body,created_at:at}]});
const oldCanonical={goal:'BOOK_SERVICE',updated_at:'2026-09-11T06:02:45Z',cognition:{pending_field:'intent_confirmation'},clarification_entity:'intent_confirmation',entities:{service:{value:'svc',status:'active'}}};
const oldShadow={goal:'BOOK_SERVICE',last_turn_at:'2026-09-11T06:02:45Z',pending_question:{fields:['intent_confirmation'],purpose:'COLLECT_INTENT'},facts:[{field:'service',status:'VERIFIED',value:'svc',source:'CUSTOMER_STATED'}]};

test('production regression: long-idle fresh wash-now request outranks stale ANSWER_TO_PENDING_QUESTION role',()=>{
  const at='2026-09-11T06:45:29Z';
  const proposal={intent:'BOOKING',action:'CLARIFY',confidence:.9,dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:'فاضي عشان تغسل سيارتي الحين؟'},entities:[
    {entity:'date',value:'2026-09-11',evidence:'الحين',confidence:.95,correction:false},
    {entity:'time',value:'10:45',evidence:'الحين',confidence:.95,correction:false},
  ]};
  const out=classifyEpisodeBoundaryV3({previousState:oldShadow,canonicalState:oldCanonical,proposal,context:context('فاضي عشان تغسل سيارتي الحين؟',at),now:new Date(at)});
  assert.ok(out.idle_ms>V3_EPISODE_IDLE_MS);
  assert.equal(out.kind,'NEW_EPISODE');
  assert.equal(out.reason,'LONG_IDLE_INDEPENDENT_REQUEST');
});

test('long-idle direct answer to the actual pending vehicle field still continues',()=>{
  const at='2026-09-11T06:45:29Z';
  const previous={...oldShadow,pending_question:{fields:['vehicle'],purpose:'COLLECT_VEHICLE'}};
  const canonical={...oldCanonical,cognition:{pending_field:'vehicle'},clarification_entity:'vehicle'};
  const proposal={intent:'BOOKING',action:'CLARIFY',confidence:.95,dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:'الاستيشن'},entities:[
    {entity:'vehicle',value:'station',evidence:'الاستيشن',confidence:.95,correction:false},
  ]};
  const out=classifyEpisodeBoundaryV3({previousState:previous,canonicalState:canonical,proposal,context:context('الاستيشن',at),now:new Date(at)});
  assert.equal(out.kind,'CONTINUE');
  assert.equal(out.reason,'SEMANTIC_ANSWER_TO_PENDING_QUESTION');
});

test('long-idle short confirmation remains a continuation and cannot invent a new episode',()=>{
  const at='2026-09-11T06:45:29Z';
  const proposal={intent:'BOOKING',action:'CLARIFY',confidence:.95,dialogue:{message_role:'CONFIRMATION',evidence:'هيه'},entities:[]};
  const out=classifyEpisodeBoundaryV3({previousState:oldShadow,canonicalState:oldCanonical,proposal,context:context('هيه',at),now:new Date(at)});
  assert.equal(out.kind,'CONTINUE');
  assert.equal(out.reason,'SEMANTIC_CONFIRMATION');
});
