import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/chat-control.js',import.meta.url),'utf8');

test('human_message routes WhatsApp conversations through live outbound provider path',()=>{
  assert.match(source,/channel_type/);
  assert.match(source,/dabbir-whatsapp-reply/);
  assert.match(source,/external_side_effects:true/);
  assert.doesNotMatch(source,/action,result,external_side_effects:false/);
});