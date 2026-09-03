import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { routeToolAgentCommand, validateToolAgentClaims } from '../api/barman-tool-agent-broker.js';

const workflow=fs.readFileSync(new URL('../.github/workflows/barman-tool-agent.yml',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../scripts/barman-tool-agent.mjs',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../api/barman-tool-agent-broker.js',import.meta.url),'utf8');
const waitProduction=fs.readFileSync(new URL('../scripts/wait-dabbir-production-sha.mjs',import.meta.url),'utf8');
const ci=fs.readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');

const baseClaims={
  iss:'https://token.actions.githubusercontent.com',
  aud:'barman-executive-tool-agent',
  repository:'barman-systems/pilot',
  ref:'refs/heads/main',
  workflow_ref:'barman-systems/pilot/.github/workflows/barman-tool-agent.yml@refs/heads/main',
  event_name:'schedule',
  exp:2000,
  nbf:900,
};

test('tool-agent OIDC is locked to the canonical main workflow',()=>{
  assert.equal(validateToolAgentClaims(baseClaims,1000),true);
  assert.equal(validateToolAgentClaims({...baseClaims,event_name:'workflow_dispatch'},1000),true);
  assert.equal(validateToolAgentClaims({...baseClaims,event_name:'push'},1000),true);
  assert.equal(validateToolAgentClaims({...baseClaims,workflow_ref:'barman-systems/pilot/.github/workflows/evil.yml@refs/heads/main'},1000),false);
  assert.equal(validateToolAgentClaims({...baseClaims,ref:'refs/heads/dev'},1000),false);
  assert.equal(validateToolAgentClaims({...baseClaims,event_name:'pull_request'},1000),false);
  assert.equal(validateToolAgentClaims({...baseClaims,aud:'wrong'},1000),false);
});

test('tool-agent routes non-code commands fail-closed before patch generation',()=>{
  assert.equal(routeToolAgentCommand('كم عميل لدينا ونشاط').route,'DATA_QUERY');
  assert.equal(routeToolAgentCommand('قم بتطوير وإصلاح لوحة تحكم مالك دبر').route,'REPO_CHANGE');
  assert.equal(routeToolAgentCommand('1. أصلح BAR-12\n2. اربط واتساب').route,'MULTI_STEP');
  assert.equal(routeToolAgentCommand('1. أصلح BAR-12\\n2. اربط واتساب').route,'MULTI_STEP');
  assert.equal(routeToolAgentCommand('أرسل رمز التحقق').route,'OWNER_GATE');
  assert.match(worker,/phase:'route'/);
  assert.match(worker,/routing\.route!==['"]REPO_CHANGE['"]/);
});

test('persistent worker has schedule plus protected-main push wake-up',()=>{
  assert.match(workflow,/cron:\s*'\*\/5 \* \* \* \*'/);
  assert.match(workflow,/push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow,/github\.event_name == 'push'/);
  assert.match(workflow,/wait-dabbir-production-sha\.mjs/);
  for(const token of ['id-token: write','contents: write','pull-requests: write','actions: write','cancel-in-progress: false'])assert.match(workflow,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(waitProduction,/release-evidence/);
  assert.match(waitProduction,/commit_sha/);
  assert.match(waitProduction,/environment/);
  assert.match(worker,/phase:'claim'/);
  assert.match(worker,/spawnSync\('git',\['apply','--check'/);
  assert.match(worker,/PATCH_TOUCHED_GOVERNANCE_FILE/);
  assert.match(worker,/path\.startsWith\('\.github\/'\)/);
  assert.match(worker,/api\/barman-tool-agent-broker\.js/);
});

test('empty AI patches trigger bounded autonomous context recovery instead of owner questions',()=>{
  assert.match(worker,/PATCH_EMPTY_RECOVERY/);
  assert.match(worker,/expandContext\(context,discovery,allPaths,commandText\)/);
  assert.match(worker,/AI_PATCH_EMPTY_AUTORECOVERY/);
  assert.match(worker,/AI_PATCH_EMPTY_AFTER_AUTORECOVERY/);
  assert.match(worker,/add\('package\.json'\)/);
  assert.match(broker,/explicitly authorized to create NEW files under test\//);
  assert.match(broker,/does NOT need to already appear in the supplied context/);
  assert.match(broker,/Never ask the owner to name the test file or reconfirm/);
});

test('new test and migration files are included in change detection and commit scope',()=>{
  assert.match(worker,/git\(\['ls-files','--others','--exclude-standard'\]\)/);
  assert.match(worker,/new Set\(\[\.\.\.tracked,\.\.\.untracked\]\)/);
  assert.match(worker,/git\(\['add','--',\.\.\.changed\]\)/);
});

test('required branch-protection test context is emitted only by pull_request CI',()=>{
  assert.match(ci,/name:\s*\$\{\{\s*github\.event_name == 'pull_request' && 'test' \|\| 'ci-non-pr'\s*\}\}/);
  assert.match(ci,/Require terminal mobile release gates before merge/);
  assert.match(ci,/if:\s*github\.event_name == 'pull_request'/);
});

test('DONE requires CI, exact Production release and full customer journey',()=>{
  assert.match(ci,/workflow_dispatch:/);
  assert.match(worker,/dispatch\('ci\.yml'/);
  assert.match(worker,/waitWorkflow\('ci\.yml'/);
  assert.match(worker,/\/api\/release-evidence/);
  assert.match(worker,/payload\?\.commit_sha/);
  assert.match(worker,/dispatch\('dabbir-ai-customer-journey\.yml','main'/);
  assert.match(worker,/waitWorkflow\('dabbir-ai-customer-journey\.yml','main'/);
  assert.match(worker,/finalize\('DONE'/);
});

test('executor persists independent-required state before waking verifier and cannot self-promote',()=>{
  assert.match(worker,/FINALIZE_DONE_NOT_PERSISTED/);
  assert.match(worker,/verification_status!=='INDEPENDENT_REQUIRED'/);
  assert.match(worker,/terminalPersisted=true/);
  assert.match(worker,/dispatch\('barman-independent-verifier\.yml','main',\{\}\)/);
  assert.match(worker,/VERIFIER_WAKE_FAILED_UNPROMOTED/);
  assert.match(worker,/POST_FINALIZE_FAILURE_COMMAND_REMAINS_UNPROMOTED/);
  assert.doesNotMatch(worker,/barman_executive_verify_command_v1/);
});

test('broker finalization sends Telegram outcome and evidence remains fail-closed',()=>{
  assert.match(broker,/barman_executive_finalize_v1/);
  assert.match(broker,/notifyTelegram/);
  assert.match(broker,/barman_executive_claim_v1/);
  assert.match(broker,/p_lane:'tool_agent'/);
  assert.match(broker,/Never edit \.github\//);
});
