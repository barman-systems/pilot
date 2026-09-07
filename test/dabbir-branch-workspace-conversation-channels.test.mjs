import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/branch-workspace.js',import.meta.url),'utf8');

test('branch workspace exposes real customer conversations from supported channels',()=>{
  assert.match(source,/channel_type=in\.\(web,whatsapp,instagram\)/);
  assert.doesNotMatch(source,/dabbir_conversations[^`]*channel_type=eq\.web/);
});
