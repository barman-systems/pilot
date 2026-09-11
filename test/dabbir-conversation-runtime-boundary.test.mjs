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
  for(const forbidden of [
    '_dabbir-semantic-interpreter.js',
    '_dabbir-knowledge-rag.js',
    '_dabbir-understanding-orchestrator.js',
    '_dabbir-v3-shadow-observer.js',
    'planner:async',
    'captureProposal(',
  ])assert.equal(core.includes(forbidden),false,`WhatsApp channel must not own ${forbidden}`);
});

test('canonical conversation runtime owns semantic composition without transport authority',()=>{
  const runtime=read('_dabbir-conversation-runtime.js');
  for(const required of [
    '_dabbir-semantic-interpreter.js',
    '_dabbir-knowledge-rag.js',
    '_dabbir-understanding-orchestrator.js',
    '_dabbir-v3-shadow-observer.js',
    'runUnderstandingTurn({',
    'createV3ShadowObserver({context,rpc})',
    'shadow.captureProposal({',
    "cognitiveMode:'policy'",
  ])assert.ok(runtime.includes(required),`conversation runtime must retain ${required}`);
  for(const forbidden of [
    '_whatsapp-live-core.js',
    '_whatsapp-service-connection.js',
    '_dabbir-whatsapp-catalog.js',
    '_dabbir-whatsapp-flows.js',
    'sendMetaText(',
    'sendMetaCatalogProducts(',
    'sendMetaBookingFlow(',
  ])assert.equal(runtime.includes(forbidden),false,`conversation runtime must not own transport ${forbidden}`);
});

test('consolidation does not promote V3 shadow into execution authority',()=>{
  const runtime=read('_dabbir-conversation-runtime.js');
  assert.ok(runtime.includes('createV3ShadowObserver'));
  assert.equal(runtime.includes('dabbir_semantic_execute_v2'),false);
  assert.equal(runtime.includes('dabbir_whatsapp_ai_reserve_outbound'),false);
  assert.equal(runtime.includes('serviceRpc('),false);
});
