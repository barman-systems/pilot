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

test('cognitive quality repair is owned by the conversation brain boundary',()=>{
  const facade=read('_dabbir-cognitive-dialogue.js');
  const finalizer=read('_dabbir-conversation-brain-quality.js');
  const orchestrator=read('_dabbir-understanding-orchestrator.js');
  const orchestratorCore=read('_dabbir-understanding-orchestrator-core.js');

  assert.match(facade,/finalizeConversationBrainQuality as qualityGate/);
  assert.match(facade,/from '\.\/_dabbir-cognitive-dialogue-core\.js'/);
  assert.match(finalizer,/CONVERSATION_BRAIN_QUALITY_OWNER='DABBIR_CONVERSATION_BRAIN'/);
  assert.match(finalizer,/legacyQualityGate\(\{state,decision,previous,context\}\)/);
  assert.doesNotMatch(orchestrator,/_dabbir-cognitive-dialogue-core/);
  assert.match(orchestratorCore,/from '\.\/_dabbir-cognitive-dialogue\.js'/);

  for(const forbidden of [
    'dabbir_semantic_execute_v2',
    'dabbir_semantic_commit_v2',
    'dabbir_whatsapp_ai_check_availability',
    'deliver(',
    'handoff(',
  ])assert.equal(finalizer.includes(forbidden),false,`conversation brain quality finalizer gained execution authority: ${forbidden}`);
});

test('queued-goal customer prose is owned by the conversation brain boundary',()=>{
  const facade=read('_dabbir-goal-queue.js');
  const renderer=read('_dabbir-conversation-brain-queued-goal.js');
  const core=read('_dabbir-goal-queue-core.js');

  assert.match(facade,/renderQueuedGoalPrompt as queuedGoalPrompt/);
  assert.match(facade,/partitionGoalRequests,resumeQueuedGoal/);
  assert.match(renderer,/CONVERSATION_BRAIN_QUEUED_GOAL_OWNER='DABBIR_CONVERSATION_BRAIN'/);
  assert.match(renderer,/legacyQueuedGoalPrompt\(state,context,now,reduce\)/);
  assert.match(core,/export function queuedGoalPrompt/);

  for(const forbidden of [
    'dabbir_semantic_execute_v2',
    'dabbir_semantic_commit_v2',
    'dabbir_whatsapp_ai_check_availability',
    'deliver(',
    'handoff(',
  ])assert.equal(renderer.includes(forbidden),false,`conversation brain queued-goal renderer gained execution authority: ${forbidden}`);
});

test('repeat-memory customer prose is centralized in the conversation brain response owner',()=>{
  const semantic=read('_dabbir-semantic-engine.js');
  const response=read('_dabbir-conversation-brain-response.js');
  assert.match(semantic,/repeatMemoryConfirmationReply/);
  assert.match(semantic,/from '\.\/_dabbir-conversation-brain-response\.js'/);
  assert.doesNotMatch(semantic,/const REPEAT_PROMPT_AR=/);
  assert.doesNotMatch(semantic,/const REPEAT_PROMPT_EN=/);
  assert.match(response,/export function repeatMemoryConfirmationReply/);
  assert.match(response,/نفس السيارة والموقع ولا بتغير/);
  assert.match(response,/Same vehicle and location/);
});

test('goal planner owns focus selection while conversation brain owns goal-question prose',()=>{
  const planner=read('_dabbir-goal-driven-planner.js');
  const response=read('_dabbir-conversation-brain-response.js');
  assert.match(planner,/from '\.\/_dabbir-conversation-brain-response\.js'/);
  assert.match(planner,/goalClarificationReply\(/);
  assert.match(planner,/function chooseFocus/);
  assert.match(planner,/function fieldScore/);
  for(const phrase of [
    'أكيد. أي خدمة تبي بالضبط؟',
    'متى يناسبك؟ اذكر اليوم والوقت اللي تفضله.',
    'تمام. أي سيارة نخدم لك؟',
    'تمام. وين موقع الخدمة؟',
    'Would you prefer the service',
    'What time works for you?',
  ]){
    assert.equal(planner.includes(phrase),false,`goal planner still owns customer prose: ${phrase}`);
    assert.equal(response.includes(phrase),true,`conversation brain response owner is missing customer prose: ${phrase}`);
  }
});

test('operational delivery is rebuilt from committed state and verified receipts without exposing RPC identity in the facade',()=>{
  const orchestrator=read('_dabbir-understanding-orchestrator.js');
  const core=read('_dabbir-understanding-orchestrator-core.js');
  const response=read('_dabbir-conversation-brain-response.js');

  assert.match(orchestrator,/from '\.\/_dabbir-understanding-orchestrator-core\.js'/);
  assert.match(orchestrator,/from '\.\/_dabbir-conversation-brain-response\.js'/);
  assert.match(orchestrator,/renderOperationalResponse\(\{/);
  assert.match(orchestrator,/args\?\.p_state&&args\?\.p_metrics/);
  assert.match(orchestrator,/result\?\.verified===true&&result\?\.appointment_id/);
  assert.match(orchestrator,/rpc:brainRpc/);
  assert.match(orchestrator,/responseText:conversationBrainCompatibilityReply/);
  assert.doesNotMatch(orchestrator,/\bdabbir_semantic_execute_v2\b|\bdabbir_semantic_commit_v2\b|\bprocess\.env\b/);
  assert.match(response,/CONVERSATION_BRAIN_RESPONSE_OWNER='DABBIR_CONVERSATION_BRAIN'/);
  assert.match(response,/export function conversationBrainCompatibilityReply/);
  assert.match(response,/export function renderOperationalResponse/);
  assert.match(response,/appointmentPresentation/);
  assert.match(response,/decision\?\.action==='PRICING'/);
  assert.match(response,/executionResult\?\.verified===true/);
  assert.match(core,/export async function runUnderstandingTurn/);
  assert.match(core,/CONVERSATION_BRAIN_RESPONSE_OWNER_REQUIRED/);

  for(const forbidden of [
    'dabbir_semantic_execute_v2',
    'dabbir_semantic_commit_v2',
    'dabbir_whatsapp_ai_check_availability',
    'process.env',
  ])assert.equal(response.includes(forbidden),false,`conversation brain response renderer gained execution authority: ${forbidden}`);
});

test('compatibility core contains no customer-facing response copy',()=>{
  const core=read('_dabbir-understanding-orchestrator-core.js');
  const response=read('_dabbir-conversation-brain-response.js');
  assert.match(core,/responseText\(\{kind:'RECOVERY_GREETING'/);
  assert.match(core,/responseText\(\{kind:'VERIFIED_MUTATION'/);
  assert.match(core,/responseText\(\{kind:'SERVICE_LIST'/);
  assert.match(core,/responseText\(\{kind:'DEFAULT_SERVICE'/);
  for(const phrase of [
    'هلا، طلبك السابق ما اكتمل. تبا نكمل عليه؟',
    'وعليكم السلام، حياك. كيف أقدر أساعدك؟',
    'انتهت القائمة السابقة. اكتب طلبك أو أرسل «شو خدماتكم» لعرض الخدمات من جديد.',
    'تم إلغاء الموعد ✅.',
    'Your appointment was rescheduled ✅ to',
    'ما حصلت وقتًا متاحًا قريبًا. أي وقت آخر يناسبك؟',
    'No nearby time is available. What other time works for you?',
    'السعر غير متحقق',
    'price unverified',
    'لا توجد خدمات مفعّلة حاليًا.',
    'There are no active services right now.',
    'أي خدمة تحتاج؟',
    'Which service do you need?',
  ]){
    assert.equal(core.includes(phrase),false,`compatibility core still owns customer prose: ${phrase}`);
    assert.equal(response.includes(phrase),true,`conversation brain response owner is missing customer prose: ${phrase}`);
  }
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
