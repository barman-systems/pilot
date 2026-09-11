import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..','api');
const files=['_dabbir-conversation-v3-episode.js','_dabbir-conversation-v3-understanding.js','_dabbir-conversation-v3-brain.js','_dabbir-conversation-v3-pipeline.js','_dabbir-conversation-v3-invariants.js'];
const forbidden=['_dabbir-goal-driven-planner','understandLegacyConversation','cognitiveReduce','_dabbir-cognitive-dialogue'];

test('V3 Phase 2 modules stay independent from frozen legacy dialogue stack',()=>{
 for(const file of files){const text=fs.readFileSync(path.join(root,file),'utf8');for(const token of forbidden)assert.equal(text.includes(token),false,`${file} must not reference ${token}`);}
});

test('only Conversation Brain module constructs V3 customer-facing prose',()=>{
 for(const file of files.filter(x=>!['_dabbir-conversation-v3-brain.js','_dabbir-conversation-v3-invariants.js'].includes(x))){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  assert.equal(text.includes('brainResponseV3('),false,`${file} must not construct a final V3 response`);
 }
 const brain=fs.readFileSync(path.join(root,'_dabbir-conversation-v3-brain.js'),'utf8');assert.ok(brain.includes('brainResponseV3('));
});
