import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/dabbir-whatsapp-reply.js',import.meta.url),'utf8');

test('manual WhatsApp reply resolves the reserved connection through service-role RPC',()=>{
  assert.match(source,/serviceRpc\('dabbir_whatsapp_ai_connection'/);
  assert.match(source,/p_connection_id:\s*reservation\.connectionId/);
  assert.doesNotMatch(source,/loadExactBusinessConnection\(/);
  assert.doesNotMatch(source,/owner\.accessToken[\s\S]{0,120}reservation\.connectionId/);
});
