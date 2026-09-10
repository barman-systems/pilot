import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const core=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-core.js',import.meta.url),'utf8');
// Presentation, price, service/branch scope and ordinal behavior now have actual
// orchestrator tests in dabbir-service-presentation-authority.test.mjs.
const worker=fs.readFileSync(new URL('../api/dabbir-whatsapp-ai-worker.js',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../api/dabbir-whatsapp-ai-cron.js',import.meta.url),'utf8');

test('live worker and recovery cron both route through service-menu guard',()=>{
  assert.match(worker,/processWhatsAppDispatchWithServiceMenu/);
  assert.doesNotMatch(worker,/processWhatsAppAiDispatchToken/);
  assert.match(cron,/processWhatsAppRecoveryWithServiceMenu/);
  assert.doesNotMatch(cron,/processWhatsAppAiRecovery/);
});

test('service menu outbound resolves the exact conversation branch connection',()=>{
  assert.match(core,/loadConversationConnectionWithServiceKey/);
  assert.match(core,/context\.conversation\.id/);
  assert.doesNotMatch(core,/loadBusinessConnectionWithServiceKey/);
});
