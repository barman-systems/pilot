import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shadow=fs.readFileSync(new URL('../api/_dabbir-v3-reasoning-shadow-benchmark.js',import.meta.url),'utf8');
const aiCore=fs.readFileSync(new URL('../api/_ai-core.js',import.meta.url),'utf8');

test('V3 reasoning benchmark preserves production semantic structured-output headroom',()=>{
  assert.match(aiCore,/max_tokens:\s*semanticEnabled\s*\?\s*1600\s*:\s*320/);
  assert.match(shadow,/temperature:0,stream:false,max_tokens:1600/);
  assert.doesNotMatch(shadow,/max_tokens:\s*420/);
});
