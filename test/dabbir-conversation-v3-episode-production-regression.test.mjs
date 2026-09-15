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

test('price side question stays inside an active booking episode',()=>{
  const at='2026-09-11T06:03:10Z';
  const proposal={intent:'PRICING',action:'PRICING',confidence:.96,dialogue:{message_role:'SIDE_QUESTION',evidence:'كم سعره؟'},entities:[],serviceQuestion:{field:'price',evidence:'السعر'}};
  const out=classifyEpisodeBoundaryV3({previousState:oldShadow,canonicalState:oldCanonical,proposal,context:context('وبالمناسبة كم سعره؟',at),now:new Date(at)});
  assert.equal(out.kind,'CONTINUE');
  assert.equal(out.reason,'ACTIVE_EPISODE');
});

test('different-service side question does not steal the active booking goal',()=>{
  const at='2026-09-11T06:03:20Z';
  const proposal={intent:'SERVICE_DISCOVERY',action:'REPLY',confidence:.96,serviceName:'غسيل سجاد',dialogue:{message_role:'SIDE_QUESTION',evidence:'عندكم غسيل سجاد؟'},entities:[]};
  const out=classifyEpisodeBoundaryV3({previousState:oldShadow,canonicalState:oldCanonical,proposal,context:context('وبالمناسبة عندكم غسيل سجاد؟',at),now:new Date(at)});
  assert.equal(out.kind,'CONTINUE');
  assert.equal(out.reason,'ACTIVE_EPISODE');
});

test('explicit new operational request can start a new episode even when another booking is active',()=>{
  const at='2026-09-11T06:03:30Z';
  const proposal={intent:'BOOKING',action:'CLARIFY',confidence:.97,serviceName:'غسيل سجاد',dialogue:{message_role:'NEW_REQUEST',evidence:'ابا احجز غسيل سجاد بعد'},entities:[]};
  const out=classifyEpisodeBoundaryV3({previousState:oldShadow,canonicalState:oldCanonical,proposal,context:context('ابا احجز غسيل سجاد بعد',at),now:new Date(at)});
  assert.equal(out.kind,'NEW_EPISODE');
  assert.equal(out.reason,'EXPLICIT_NEW_REQUEST');
});

test('long idle SIDE_QUESTION is still not enough by itself to create a new episode',()=>{
  const at='2026-09-11T06:45:29Z';
  const proposal={intent:'PRICING',action:'PRICING',confidence:.95,dialogue:{message_role:'SIDE_QUESTION',evidence:'كم سعره؟'},entities:[],serviceQuestion:{field:'price',evidence:'السعر'}};
  const out=classifyEpisodeBoundaryV3({previousState:oldShadow,canonicalState:oldCanonical,proposal,context:context('كم سعره؟',at),now:new Date(at)});
  assert.ok(out.idle_ms>V3_EPISODE_IDLE_MS);
  assert.equal(out.kind,'CONTINUE');
  assert.equal(out.reason,'LONG_IDLE_BUT_NOT_NEW_REQUEST');
});
