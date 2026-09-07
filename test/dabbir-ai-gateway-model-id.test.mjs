import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getDABBIRAiConfig } from '../api/_ai-core.js';

const source=fs.readFileSync(new URL('../api/_ai-core.js',import.meta.url),'utf8');

test('Vercel AI Gateway uses current MiniMax model ids instead of retired -free aliases',()=>{
  const config=getDABBIRAiConfig({VERCEL_ENV:'production'});
  assert.equal(config.model,'minimax/minimax-m3');
  assert.match(source,/FALLBACK_GATEWAY_MODELS = \['minimax\/minimax-m2\.7'\]/);
  assert.doesNotMatch(source,/minimax\/minimax-m(?:3|2\.7)-free/);
});
