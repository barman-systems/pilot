import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const exists=path=>fs.existsSync(new URL('../'+path,import.meta.url));
const customer=read('api/chat-customer.js');
const journey=read('test/ai-full-customer-journey-v2.mjs');
const migration=read('supabase/migrations/20260916023000_dabbir_conversation_brain_channel_parity_v1.sql');

test('production containment restores the previously verified grounded Web customer path',()=>{
  assert.match(customer,/from 'node:stream'/);
  assert.match(customer,/chatSendHandler from '\.\/chat-send\.js'/);
  assert.match(customer,/return chatSendHandler\(delegateRequest\(req,body\),res\)/);
  assert.doesNotMatch(customer,/processClaimedWebAiBatch/);
  assert.doesNotMatch(customer,/dabbir_web_ai_persist_inbound_v1/);
  assert.doesNotMatch(customer,/dabbir_whatsapp_ai_claim_dispatch/);
});

test('containment keeps authentication, tenant scope, Web-only scope and human takeover intact',()=>{
  assert.match(customer,/requireSameOrigin\(req\)/);
  assert.match(customer,/getVerifiedUser\(token\)/);
  assert.match(customer,/m\.business_id===businessId&&\(!m\.status\|\|m\.status==='active'\)/);
  assert.match(customer,/conversation\.channel_type!=='web'\|\|conversation\.demo_mode===true/);
  assert.match(customer,/conversation\.state==='human_active'/);
  assert.match(customer,/state:'human_active'/);
});

test('unproven Web shared-runtime adapter is removed rather than left as dead authority',()=>{
  assert.equal(exists('api/_dabbir-conversation-web-transport.js'),false);
});

test('already-applied channel-parity migration remains append-only history, not runtime promotion authority',()=>{
  assert.match(migration,/dabbir_ai_context/);
  assert.match(migration,/dabbir_semantic_deliver_web_v1/);
  assert.match(migration,/semantic_presentation_verified_v1/);
  assert.match(migration,/channel='web'/);
  assert.doesNotMatch(customer,/dabbir_semantic_deliver_web_v1/);
});

test('exact Production journey continues to require a real AI reply and governed return-to-AI',()=>{
  assert.match(journey,/assert\(result\.json\?\.ai_message\?\.sender_type === 'ai', 'AI_REPLY_MISSING'\)/);
  assert.match(journey,/20_ai_resumes_after_return/);
  assert.match(journey,/AI_RESUME_FAILED_/);
});
