import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const api=path.join(root,'api');
const read=name=>fs.readFileSync(path.join(api,name),'utf8');

test('semantic engine delegates dialogue composition to the canonical conversation brain',()=>{
  const semantic=read('_dabbir-semantic-engine.js');
  assert.match(semantic,/from '\.\/_dabbir-conversation-brain\.js'/);
  assert.match(semantic,/return runConversationBrain\(args,understandLegacyConversation\)/);
  assert.doesNotMatch(semantic,/cognitiveReduce\s*\(/);
  assert.doesNotMatch(semantic,/applyGoalDrivenConversationPlan\s*\(/);
});

test('only canonical conversation brain composes cognitive reducer with goal dialogue planner',()=>{
  const brain=read('_dabbir-conversation-brain.js');
  assert.match(brain,/CONVERSATION_BRAIN_OWNER='DABBIR_CONVERSATION_BRAIN'/);
  assert.match(brain,/const reduced=cognitiveReduce\(args,legacyReducer\)/);
  assert.match(brain,/return applyGoalDrivenConversationPlan\(\{args,result:reduced\}\)/);

  const jsFiles=fs.readdirSync(api).filter(name=>name.endsWith('.js'));
  const plannerImporters=jsFiles.filter(name=>read(name).includes("from './_dabbir-goal-driven-planner.js'"));
  assert.deepEqual(plannerImporters,['_dabbir-conversation-brain.js']);
});

test('conversation brain remains a compatibility seam, not execution authority',()=>{
  const brain=read('_dabbir-conversation-brain.js');
  for(const forbidden of [
    'dabbir_semantic_execute_v2',
    'dabbir_semantic_commit_v2',
    'dabbir_whatsapp_ai_check_availability',
    'deliver(',
    'handoff(',
  ])assert.equal(brain.includes(forbidden),false,`conversation brain gained execution authority: ${forbidden}`);
});
