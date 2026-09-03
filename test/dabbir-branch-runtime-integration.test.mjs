import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const workspace=read('api/branch-workspace.js');
const operations=read('api/branch-operations.js');
const context=read('api/branch-context.js');
const ui=read('api/branch-context-ui.js');
const bundles=JSON.parse(read('config/dabbir-ui-bundles.json'));

test('branch workspace filters branch-owned operational reads on the server',()=>{
  assert.match(workspace,/resolveBranchScope/);
  assert.match(workspace,/const suffix=branchFilter\(scope\)/);
  assert.match(workspace,/dabbir_conversations\?[\s\S]*\$\{suffix\}/);
  assert.match(workspace,/dabbir_appointments\?[\s\S]*\$\{suffix\}/);
  assert.match(workspace,/truth_mode:'FAIL_CLOSED_BRANCH_SCOPED_READS'/);
});

test('branch workspace derives dependent rows from scoped conversation ids',()=>{
  assert.match(workspace,/conversationIds=idsFilter/);
  assert.match(workspace,/dabbir_handoffs\?[\s\S]*conversation_id=in\.\$\{conversationIds\}/);
  assert.match(workspace,/dabbir_followups\?[\s\S]*conversation_id=in\.\$\{conversationIds\}/);
  assert.match(workspace,/dabbir_messages\?[\s\S]*conversation_id=eq\.\$\{enc\(selectedConversationId\)\}/);
});

test('branch writes require an explicit selected scope and verify persisted branch id',()=>{
  assert.match(operations,/branchWrite\(scope\)/);
  assert.match(operations,/branch_id:branchId/);
  assert.match(operations,/conversation\.branch_id!==branchId/);
  assert.match(operations,/appointment\.branch_id!==branchId/);
});

test('authorized branch options are server-derived, not guessed from the business branch registry',()=>{
  assert.match(context,/dabbir_membership_branches/);
  assert.match(context,/all_allowed:allAllowed/);
  assert.match(context,/SERVER_RLS_BRANCH_ASSIGNMENTS/);
});

test('branch UI reuses the bounded shell by replacing the duplicate owner-copilot presentation slot',()=>{
  assert.ok(bundles.deferred.includes('/api/branch-context-ui'));
  assert.ok(!bundles.deferred.includes('/api/owner-copilot-ui'));
  assert.equal(bundles.critical.length+bundles.deferred.length,26);
  assert.equal(bundles.critical.at(-1),'/api/auth-session-stability-ui');
  assert.match(ui,/\/api\/branch-workspace/);
  assert.match(ui,/\/api\/branch-operations/);
  assert.match(ui,/\['start_conversation','create_appointment'\]/);
  assert.match(ui,/dabbir_active_branch_scope:/);
  assert.match(ui,/dabbir:branch-scope-changed/);
});
