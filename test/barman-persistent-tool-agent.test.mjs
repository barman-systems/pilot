import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateToolAgentClaims } from '../api/barman-tool-agent-broker.js';

const workflow=fs.readFileSync(new URL('../.github/workflows/barman-tool-agent.yml',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../scripts/barman-tool-agent.mjs',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../api/barman-tool-agent-broker.js',import.meta.url),'utf8');
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
  assert.equal(validateToolAgentClaims({...baseClaims,workflow_ref:'barman-systems/pilot/.github/workflows/evil.yml@refs/heads/main'},1000),false);
  assert.equal(validateToolAgentClaims({...baseClaims,ref:'refs/heads/dev'},1000),false);
  assert.equal(validateToolAgentClaims({...baseClaims,event_name:'pull_request'},1000),false);
  assert.equal(validateToolAgentClaims({...baseClaims,aud:'wrong'},1000),false);
});

test('persistent worker is event-looped and cannot bypass governance files',()=>{
  assert.match(workflow,/cron:\s*'\*\/5 \* \* \* \*'/);
  for(const token of ['id-token: write','contents: write','pull-requests: write','actions: write','cancel-in-progress: false'])assert.match(workflow,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(worker,/phase:'claim'/);
  assert.match(worker,/p_lane:'tool_agent'|phase:'claim'/);
  assert.match(worker,/git',['"]apply['"],['"]--check/);
  assert.match(worker,/PATCH_TOUCHED_GOVERNANCE_FILE/);
  assert.match(worker,/path\.startsWith\('\.github\/'\)/);
  assert.match(worker,/api\/barman-tool-agent-broker\.js/);
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

test('broker finalization sends Telegram outcome and evidence remains fail-closed',()=>{
  assert.match(broker,/barman_executive_finalize_v1/);
  assert.match(broker,/notifyTelegram/);
  assert.match(broker,/barman_executive_claim_v1/);
  assert.match(broker,/p_lane:'tool_agent'/);
  assert.match(broker,/Never edit \.github\//);
});
