import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyAutomationTask, deterministicPlan, readMetricForQuestion, readOnlyAnswer } from '../api/_barman-executive-automation.js';

const cron=fs.readFileSync(new URL('../api/barman-executive-cron.js',import.meta.url),'utf8');
const verifier=fs.readFileSync(new URL('../scripts/barman-independent-verifier.mjs',import.meta.url),'utf8');
const verifierBroker=fs.readFileSync(new URL('../api/barman-independent-verifier.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260906013500_barman_ceo_automation_v1.sql',import.meta.url),'utf8');
const receiptMigration=fs.readFileSync(new URL('../supabase/migrations/20260913182500_barman_independent_snapshot_receipt_v1.sql',import.meta.url),'utf8');

test('multi-step owner objective becomes an executable plan instead of tool-agent BLOCKED',()=>{
  const plan=deterministicPlan(`1. راجع صفحة المالك وأصلح الخلل\n2. كم عدد الحسابات المسجلة\n3. اختبر النتيجة`);
  assert.equal(plan.source,'DETERMINISTIC_LIST');
  assert.equal(plan.tasks.length,3);
  assert.equal(plan.tasks[0].kind,'REPO_CHANGE');
  assert.equal(plan.tasks[1].kind,'DATA_QUERY');
});

test('owner-only money, KYC and OTP remain fail-closed',()=>{
  assert.equal(classifyAutomationTask('نفذ تحويل مالي').kind,'OWNER_GATE');
  assert.equal(classifyAutomationTask('استخدم رمز OTP').kind,'OWNER_GATE');
  assert.throws(()=>deterministicPlan(`1. أصلح الواجهة\n2. نفذ تحويل مالي`),/PLAN_OWNER_GATE_REQUIRED/);
});

test('read-only answers distinguish DABBIR accounts from business customers',()=>{
  const snapshot={registered_accounts:{total:4},businesses:{total:18},customers:{total:7},appointments:{total:6},orders:{total:1}};
  const accounts=readOnlyAnswer('كم عدد المسجلين في دبر',snapshot);
  const customers=readOnlyAnswer('كم عدد زبائن الأنشطة',snapshot);
  assert.equal(accounts.metric,'REGISTERED_ACCOUNTS_TOTAL');
  assert.match(accounts.summary,/4/);
  assert.equal(customers.metric,'CUSTOMERS_TOTAL');
  assert.match(customers.summary,/7/);
});

test('registered customers wording resolves to DABBIR accounts, never tenant CRM customers',()=>{
  const snapshot={registered_accounts:{total:4},businesses:{total:18},customers:{total:7},appointments:{total:6},orders:{total:1}};
  const exactOwnerQuestion='كم عدد العملاء المسجلين في دبر؟';
  const answer=readOnlyAnswer(exactOwnerQuestion,snapshot);
  assert.equal(readMetricForQuestion(exactOwnerQuestion),'REGISTERED_ACCOUNTS_TOTAL');
  assert.equal(answer.metric,'REGISTERED_ACCOUNTS_TOTAL');
  assert.deepEqual(answer.expected,{registered_accounts_total:4});
  assert.match(answer.summary,/4/);
  assert.doesNotMatch(answer.summary,/7/);
  assert.equal(readMetricForQuestion('كم عدد عملاء الأنشطة؟'),'CUSTOMERS_TOTAL');
});

test('executive cron claims planner, read-only and runtime lanes separately',()=>{
  assert.match(cron,/p_lane:'planner'/);
  assert.match(cron,/p_lane:'read_only'/);
  assert.match(cron,/p_lane:'runtime'/);
  assert.match(cron,/barman_executive_decompose_v1/);
  assert.match(cron,/barman-executive-snapshot-v1/);
});

test('read-only executor evidence is independently checked against its immutable Postgres receipt',()=>{
  assert.match(verifier,/reference==='barman-executive-snapshot-v1'/);
  assert.match(verifier,/phase:'snapshot_receipt'/);
  assert.match(verifier,/IMMUTABLE_POSTGRES_SNAPSHOT_RECEIPT/);
  assert.match(verifierBroker,/phase==='snapshot_receipt'/);
  assert.match(verifierBroker,/barman_executive_read_snapshot_receipt_v1/);
  assert.match(receiptMigration,/before insert on dabbir_private\.executive_evidence/i);
  assert.match(receiptMigration,/SNAPSHOT_EVIDENCE_CHANGED_BEFORE_PERSIST_/);
});

test('database routing no longer wakes code agent for planner or read-only work',()=>{
  assert.match(migration,/registered_accounts/);
  assert.match(migration,/inferred_lane='tool_agent'/);
  assert.match(migration,/inferred_lane='planner'/);
  assert.match(migration,/inferred_lane='read_only'/);
});
