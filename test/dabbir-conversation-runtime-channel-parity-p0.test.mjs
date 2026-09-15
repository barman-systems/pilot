import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {_webAiCoreTest} from '../api/_dabbir-conversation-web-transport.js';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const customer=read('api/chat-customer.js');
const webCore=read('api/_dabbir-conversation-web-transport.js');
const whatsappCore=read('api/_dabbir-whatsapp-ai-core.js');
const migration=read('supabase/migrations/20260916023000_dabbir_conversation_brain_channel_parity_v1.sql');

test('web customer path cannot own a second reply brain',()=>{
  assert.doesNotMatch(customer,/chat-send\.js/);
  assert.doesNotMatch(customer,/_ai-core\.js/);
  assert.doesNotMatch(customer,/generateDABBIRAiReply/);
  assert.match(customer,/processClaimedWebAiBatch/);
  assert.match(customer,/dabbir_web_ai_persist_inbound_v1/);
  assert.match(customer,/dabbir_whatsapp_ai_claim_dispatch/);
});

test('web and WhatsApp converge on the exact same canonical conversation runtime boundary',()=>{
  assert.match(webCore,/from '\.\/_dabbir-conversation-runtime\.js'/);
  assert.match(webCore,/runConversationRuntimeTurn\(\{/);
  assert.match(whatsappCore,/from '\.\/_dabbir-conversation-runtime\.js'/);
  assert.match(whatsappCore,/runConversationRuntimeTurn\(\{/);
  for(const forbidden of ['_dabbir-conversation-v3-interpreter.js','_dabbir-conversation-v3-brain.js','generateDABBIRAiReply']){
    assert.equal(webCore.includes(forbidden),false,`Web transport must not own ${forbidden}`);
  }
});

test('web transport persists a semantic receipt instead of faking a WhatsApp receipt',async()=>{
  const calls=[];
  const rpc=async(name,args)=>{
    calls.push({name,args});
    return {provider_message_id:'90000000-0000-4000-8000-000000000001',message:{id:'90000000-0000-4000-8000-000000000001',sender_type:'ai',body:args.p_body},state:'PERSISTED'};
  };
  const sent=await _webAiCoreTest.deliverWith(
    rpc,
    {batch_id:'10000000-0000-4000-8000-000000000001',lock_token:'20000000-0000-4000-8000-000000000001',semantic_version:7},
    {conversation:{channel_type:'web'}},
    'رد موثق',
    'v3-reply',
  );
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'dabbir_semantic_deliver_web_v1');
  assert.equal(calls[0].args.p_version,7);
  assert.equal(sent.providerMessageId,'90000000-0000-4000-8000-000000000001');
  await assert.rejects(()=>_webAiCoreTest.deliverWith(rpc,{semantic_version:7},{conversation:{channel_type:'whatsapp'}},'x','reply'),/WEB_AI_DELIVERY_CHANNEL_INVALID/);
});

test('database contract carries the same semantic batch/version proof across Web and WhatsApp',()=>{
  assert.match(migration,/semantic_batch_id uuid references public\.dabbir_message_batches/);
  assert.match(migration,/semantic_version bigint/);
  assert.match(migration,/dabbir_messages_web_semantic_delivery_uq/);
  assert.match(migration,/c\.channel_type not in \('whatsapp','web'\)/);
  assert.match(migration,/semantic_presentation_verified_v1/);
  assert.match(migration,/channel='whatsapp'/);
  assert.match(migration,/channel='web'/);
  assert.match(migration,/SEMANTIC_EXECUTE_PRESENTATION_CONTRACT_DRIFT/);
  assert.doesNotMatch(migration,/insert into public\.dabbir_whatsapp_outbound_reservations[\s\S]*channel='web'/i);
});
