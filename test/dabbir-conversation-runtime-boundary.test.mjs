import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const apiRoot=path.resolve(import.meta.dirname,'..','api');
const read=file=>fs.readFileSync(path.join(apiRoot,file),'utf8');

test('WhatsApp channel owns transport but not conversation composition',()=>{
  const core=read('_dabbir-whatsapp-ai-core.js');
  assert.ok(core.includes("from './_dabbir-conversation-runtime.js'"));
  assert.ok(core.includes('runConversationRuntimeTurn({'));
  for(const forbidden of ['_dabbir-semantic-interpreter.js','_dabbir-knowledge-rag.js','_dabbir-understanding-orchestrator.js','_dabbir-v3-shadow-observer.js','_dabbir-conversation-v3-runtime.js','planner:async','captureProposal('])assert.equal(core.includes(forbidden),false,`WhatsApp channel must not own ${forbidden}`);
});

test('canonical conversation runtime owns engine selection without Meta transport authority',()=>{
  const runtime=read('_dabbir-conversation-runtime.js');
  for(const required of ['_dabbir-semantic-interpreter.js','_dabbir-knowledge-rag.js','_dabbir-understanding-orchestrator.js','_dabbir-v3-shadow-observer.js','_dabbir-conversation-v3-runtime.js','runUnderstandingTurn({','runConversationV3Runtime({','createV3ShadowObserver({context,rpc:turnRpc})',"cognitiveMode:'policy'",'preloadedSemanticRpc({rpc,claim,load:routingLoad})'])assert.ok(runtime.includes(required),`conversation runtime must retain ${required}`);
  for(const forbidden of ['_whatsapp-live-core.js','_whatsapp-service-connection.js','_dabbir-whatsapp-catalog.js','_dabbir-whatsapp-flows.js','sendMetaText(','sendMetaCatalogProducts(','sendMetaBookingFlow('])assert.equal(runtime.includes(forbidden),false,`conversation runtime must not own transport ${forbidden}`);
});

test('rollout semantics are structural: shadow is legacy-visible, canary and active are V3-owned',async()=>{
  const {conversationEngineForMode}=await import('../api/_dabbir-conversation-runtime.js');
  assert.equal(conversationEngineForMode('off'),'LEGACY');assert.equal(conversationEngineForMode('shadow'),'LEGACY');assert.equal(conversationEngineForMode('canary'),'V3');assert.equal(conversationEngineForMode('active'),'V3');
});

test('canonical boundary cannot bypass authority or reserve outbound itself',()=>{
  const runtime=read('_dabbir-conversation-runtime.js');
  assert.equal(runtime.includes('dabbir_semantic_execute_v2'),false);
  assert.equal(runtime.includes('dabbir_whatsapp_ai_reserve_outbound'),false);
  assert.equal(runtime.includes('serviceRpc('),false);
});

test('canonical runtime fences the preloaded semantic snapshot before legacy composition',()=>{
  const runtime=read('_dabbir-conversation-runtime.js');
  assert.match(runtime,/SEMANTIC_PRELOAD_SCOPE_MISMATCH/);
  assert.match(runtime,/args\?\.p_batch_id!==claim\.batch_id\|\|args\?\.p_lock_token!==claim\.lock_token/);
  assert.match(runtime,/const routingLoad=await rpc\('dabbir_semantic_load_v2'/);
  assert.match(runtime,/const turnRpc=preloadedSemanticRpc\(\{rpc,claim,load:routingLoad\}\)/);
});
