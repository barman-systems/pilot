import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const serviceConnection=fs.readFileSync(new URL('../api/_whatsapp-service-connection.js',import.meta.url),'utf8');
const aiCore=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-core.js',import.meta.url),'utf8');

test('business-only service connection lookup fails closed when multiple branch numbers exist',()=>{
  assert.match(serviceConnection,/business_id=eq\.\$\{encodeURIComponent\(id\)\}&status=eq\.connected&limit=2/);
  assert.match(serviceConnection,/rows\.length > 1/);
  assert.match(serviceConnection,/WHATSAPP_CONNECTION_AMBIGUOUS_BRANCH/);
  assert.match(serviceConnection,/branch_id/);
});

test('exact branch and conversation-scoped service-key loaders exist for branch-safe outbound migration',()=>{
  assert.match(serviceConnection,/loadBusinessBranchConnectionWithServiceKey/);
  assert.match(serviceConnection,/branch_id=eq\.\$\{encodeURIComponent\(branch\)\}/);
  assert.match(serviceConnection,/loadConversationConnectionWithServiceKey/);
  assert.match(serviceConnection,/dabbir_conversations\?select=id,business_id,branch_id,channel_type/);
  assert.match(serviceConnection,/channel_type !== 'whatsapp'/);
});

test('WhatsApp AI outbound resolves the exact connection from the conversation branch',()=>{
  assert.match(aiCore,/loadConversationConnectionWithServiceKey/);
  assert.match(aiCore,/loadConversationConnectionWithServiceKey\(key,context\.business\.id,context\.conversation\.id\)/);
  assert.doesNotMatch(aiCore,/loadBusinessConnectionWithServiceKey\(/);
});
