import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretConversationTurnV3} from '../api/_dabbir-conversation-v3-interpreter.js';
import {classifyEpisodeBoundaryV3,V3_EPISODE_IDLE_MS} from '../api/_dabbir-conversation-v3-episode.js';

const previous={
  goal:'BOOK_SERVICE',
  intent_confirmed:true,
  last_turn_at:'2026-09-12T15:00:28.019692Z',
  episode_id:'stale-booking',
  episode_started_at:'2026-09-11T16:45:40Z',
  facts:[
    {field:'service',status:'VERIFIED',value:'external-service',source:'CUSTOMER_CONFIRMED',confidence:1},
    {field:'delivery_mode',status:'VERIFIED',value:'MOBILE',source:'DATABASE_FACT',confidence:1},
    {field:'location',status:'VERIFIED',value:{lat:23.826294,lng:52.810448},source:'PROVIDER_VERIFIED',confidence:1},
  ],
  tentatives:[{field:'vehicle',status:'TENTATIVE',candidate_value:null,surface:'📍 موقع واتساب: 23.826294, 52.810448'}],
  pending_question:{fields:['vehicle'],purpose:'MAP_TENTATIVE_VEHICLE'},
};

const context=(body,at)=>({
  business:{id:'10000000-0000-4000-8000-000000000001',business_type:'car_wash',timezone:'Asia/Dubai'},
  conversation:{id:'30000000-0000-4000-8000-000000000001',branch_id:'20000000-0000-4000-8000-000000000001'},
  batch:{last_message_at:at},
  batch_messages:[{id:'70000000-0000-4000-8000-000000000001',body,created_at:at}],
  services:[],
  activity_profile:{services:[]},
});

for(const greeting of ['هلا','مرحبا','السلام عليكم','hello']){
  test(`standalone greeting ${greeting} bypasses providers even with stale booking state`,async()=>{
    let modelCalls=0;
    const at='2026-09-13T12:12:01.775992Z';
    const out=await interpretConversationTurnV3({
      context:context(greeting,at),
      previousState:previous,
      generate:async()=>{modelCalls++;throw new Error('provider must not be called for a standalone greeting');},
    });
    assert.equal(modelCalls,0);
    assert.equal(out.provider,'deterministic-v3-fast-path');
    assert.equal(out.proposal.intent,'SUPPORT');
    assert.equal(out.proposal.action,'REPLY');
    assert.equal(out.proposal.dialogue.message_role,'GREETING');
    assert.deepEqual(out.fastFacts,[]);
  });
}

test('live regression: long-idle greeting starts a new social episode instead of resuming stale booking',()=>{
  const at='2026-09-13T12:12:01.775992Z';
  const proposal={intent:'SUPPORT',action:'REPLY',confidence:1,entities:[],dialogue:{message_role:'GREETING',evidence:'هلا',invalidated_fields:[]}};
  const out=classifyEpisodeBoundaryV3({previousState:previous,canonicalState:{goal:'BOOK_SERVICE',updated_at:previous.last_turn_at},proposal,context:context('هلا',at),now:new Date(at)});
  assert.ok(out.idle_ms>V3_EPISODE_IDLE_MS);
  assert.equal(out.kind,'NEW_EPISODE');
  assert.equal(out.reason,'LONG_IDLE_SOCIAL_RESTART');
});

test('short-idle greeting does not erase an active booking episode',()=>{
  const at='2026-09-12T15:05:00.000Z';
  const proposal={intent:'SUPPORT',action:'REPLY',confidence:1,entities:[],dialogue:{message_role:'GREETING',evidence:'هلا',invalidated_fields:[]}};
  const out=classifyEpisodeBoundaryV3({previousState:previous,canonicalState:{goal:'BOOK_SERVICE',updated_at:previous.last_turn_at},proposal,context:context('هلا',at),now:new Date(at)});
  assert.ok(out.idle_ms<V3_EPISODE_IDLE_MS);
  assert.equal(out.kind,'CONTINUE');
  assert.equal(out.reason,'ACTIVE_EPISODE');
});
