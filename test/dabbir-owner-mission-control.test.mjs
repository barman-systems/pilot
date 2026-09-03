import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../api/owner-ceo-command.js',import.meta.url),'utf8');
const decisions=fs.readFileSync(new URL('../api/owner-decision.js',import.meta.url),'utf8');

test('authoritative owner command center exposes full CEO Mission Control without another numbered entrypoint',()=>{
  for(const token of ['ownerCeoMissionControl','مركز مهمة CEO','ownerMissionObjective','ownerMissionAcceptance','ownerMissionDue','ownerMissionPriority','ownerMissionFilter','ownerDecisionList']) assert.match(ui,new RegExp(token));
  assert.match(ui,/entrypoint:'owner-command-center\.js'/);
  assert.doesNotMatch(ui,/owner-command-center-v30|owner-command-center-v31/);
});

test('Mission Control keeps command completion truth outside the browser',()=>{
  assert.match(ui,/DONE لا تُعرض من الواجهة/);
  assert.match(ui,/ACTION → ARTIFACT → TEST → EVIDENCE/);
  assert.match(ui,/\/api\/owner-ceo-command/);
  assert.doesNotMatch(ui,/status\s*=\s*['\"]DONE['\"]/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY|service_role|apikey/i);
});

test('Mission Control gives the owner lifecycle controls and evidence visibility',()=>{
  for(const token of ['reprioritize','set_due_at','add_guidance','cancel','resume','acceptance_criteria','commandEvidence','evidence','blocked_reason','result_summary']) assert.match(ui,new RegExp(token));
  assert.match(api,/ceo_command_update/);
});

test('Owner Decision Inbox supports approve reject modify through a protected API',()=>{
  for(const token of ['قرارات مطلوبة من المالك','approve','reject','modify','\/api\/owner-decision']) assert.match(ui,new RegExp(token));
  assert.match(decisions,/requireSameOrigin/);
  assert.match(decisions,/ownerSessionToken/);
  assert.match(decisions,/decision_resolve/);
});

test('Mission Control remains mobile-first instead of extending the long leadership page',()=>{
  assert.match(ui,/ownerMissionList\{display:grid;gap:9px;max-height:520px;overflow:auto/);
  assert.match(ui,/@media\(max-width:760px\)/);
  assert.match(ui,/ownerMissionSummary\{grid-template-columns:1fr 1fr/);
  assert.match(ui,/ownerMissionCmdOps\{grid-template-columns:1fr/);
});
