import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyAtomicKind, deterministicDataSummary, validateOrchestratorClaims } from '../api/barman-orchestrator-broker.js';

const workflow=fs.readFileSync(new URL('../.github/workflows/barman-orchestrator.yml',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../scripts/barman-orchestrator.mjs',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../api/barman-orchestrator-broker.js',import.meta.url),'utf8');

const claims={
  iss:'https://token.actions.githubusercontent.com',
  aud:'barman-executive-orchestrator',
  repository:'barman-systems/pilot',
  ref:'refs/heads/main',
  workflow_ref:'barman-systems/pilot/.github/workflows/barman-orchestrator.yml@refs/heads/main',
  event_name:'schedule',
  exp:2000,
  nbf:900,
};

test('orchestrator OIDC is locked to canonical scheduled main workflow',()=>{
  assert.equal(validateOrchestratorClaims(claims,1000),true);
  assert.equal(validateOrchestratorClaims({...claims,ref:'refs/heads/dev'},1000),false);
  assert.equal(validateOrchestratorClaims({...claims,aud:'wrong'},1000),false);
  assert.equal(validateOrchestratorClaims({...claims,event_name:'pull_request'},1000),false);
});

test('atomic capability routing separates data, code, owner gates and external actions',()=>{
  assert.equal(classifyAtomicKind('كم عميل لدينا ونشاط'),'DATA_QUERY');
  assert.equal(classifyAtomicKind('أصلح بطء لوحة تحكم المالك واختبرها'),'REPO_CHANGE');
  assert.equal(classifyAtomicKind('أرسل رسالة إلى العميل'),'EXTERNAL_ACTION');
  assert.equal(classifyAtomicKind('أرسل رمز التحقق OTP'),'OWNER_GATE');
});

test('read-only summary is deterministic and grounded in the database snapshot',()=>{
  const summary=deterministicDataSummary({businesses:{total:8},customers:{total:6,new_24h:2},appointments:{total:5,created_24h:1},orders:{total:3,created_24h:1}});
  assert.match(summary,/8 منشآت/);
  assert.match(summary,/6 عملاء/);
  assert.match(summary,/5 حجوزات/);
  assert.match(summary,/3 طلبات/);
});

test('persistent orchestrator owns planner and read-only lanes without repository write authority',()=>{
  assert.match(workflow,/cron:\s*'\*\/5 \* \* \* \*'/);
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/contents: read/);
  assert.doesNotMatch(workflow,/contents: write/);
  assert.match(worker,/processLane\('planner'\)/);
  assert.match(worker,/processLane\('read_only'\)/);
  assert.match(broker,/barman_executive_read_snapshot_v1/);
  assert.match(broker,/barman_executive_decompose_v1/);
  assert.match(broker,/barman_executive_claim_v1/);
});
