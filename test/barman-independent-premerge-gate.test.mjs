import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  REQUIRED_WORKFLOWS,
  STATUS_CONTEXT,
  validatePullRequestShape,
} from '../scripts/barman-independent-premerge-gate.mjs';

const workflow=fs.readFileSync(new URL('../.github/workflows/barman-independent-premerge-gate.yml',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../scripts/barman-independent-premerge-gate.mjs',import.meta.url),'utf8');

const shaA='a'.repeat(40);
const shaB='b'.repeat(40);
function pr(overrides={}){
  return {
    number:755,
    draft:false,
    base:{ref:'main',sha:shaA,repo:{full_name:'barman-systems/pilot'}},
    head:{ref:'feature/test',sha:shaB,repo:{full_name:'barman-systems/pilot'}},
    ...overrides,
  };
}

test('pre-merge gate uses trusted base events and minimal write permission',()=>{
  assert.match(workflow,/pull_request_target:/);
  assert.match(workflow,/push:\s*\n\s*branches: \[main\]/);
  assert.match(workflow,/workflow_dispatch:/);
  for(const token of ['contents: read','actions: read','pull-requests: read','statuses: write','persist-credentials: false']){
    assert.match(workflow,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  for(const token of ['contents: write','actions: write','pull-requests: write','id-token: write','secrets.']){
    assert.doesNotMatch(workflow,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  assert.match(workflow,/pull_request\.base\.sha/);
  assert.doesNotMatch(workflow,/pull_request\.head\.sha/);
});

test('pre-merge gate publishes an exact stable status context and requires CI plus security',()=>{
  assert.equal(STATUS_CONTEXT,'BARMAN Independent Pre-Merge Gate');
  assert.deepEqual([...REQUIRED_WORKFLOWS],['DABBIR CI','DABBIR Security Gate']);
  assert.match(script,/\/statuses\/\$\{sha\}/);
  assert.match(script,/context:STATUS_CONTEXT/);
  assert.match(script,/state:'pending'/);
  assert.match(script,/state:'success'/);
  assert.match(script,/state:'failure'/);
  assert.match(script,/head_sha/);
  assert.match(script,/pull_requests/);
});

test('trusted identity is same-repository main and fail-closed for drafts or forks',()=>{
  const identity=validatePullRequestShape(pr(),'barman-systems/pilot');
  assert.equal(identity.number,755);
  assert.equal(identity.headSha,shaB);
  assert.equal(identity.baseSha,shaA);
  assert.equal(identity.headRef,'feature/test');
  assert.throws(()=>validatePullRequestShape(pr({draft:true}),'barman-systems/pilot'),/PREMERGE_DRAFT_BLOCKED/);
  assert.throws(()=>validatePullRequestShape(pr({base:{ref:'dev',sha:shaA,repo:{full_name:'barman-systems/pilot'}}}),'barman-systems/pilot'),/PREMERGE_BASE_NOT_MAIN/);
  assert.throws(()=>validatePullRequestShape(pr({head:{ref:'feature/test',sha:shaB,repo:{full_name:'someone/fork'}}}),'barman-systems/pilot'),/PREMERGE_FORK_DENIED/);
});

test('owner approval role is absent while trusted-base verification remains fail-closed',()=>{
  assert.doesNotMatch(script,/PREMERGE_TRUST_ROOT_CHANGE_REQUIRES_OWNER/);
  assert.doesNotMatch(script,/isProtectedTrustPath/);
  assert.match(script,/assertHeadContainsBase/);
  assert.match(script,/waitRequiredWorkflows/);
  assert.match(script,/PREMERGE_HEAD_CHANGED_DURING_VERIFY/);
  assert.match(script,/PREMERGE_BASE_CHANGED_DURING_VERIFY/);
});

test('gate binds current base, requires head to contain it, and invalidates receipts when main moves',()=>{
  assert.match(script,/\/compare\/\$\{baseSha\}\.\.\.\$\{headSha\}/);
  assert.match(script,/behind_by/);
  assert.match(script,/PREMERGE_HEAD_BEHIND_BASE/);
  assert.match(script,/PREMERGE_HEAD_CHANGED_DURING_VERIFY/);
  assert.match(script,/PREMERGE_BASE_CHANGED_DURING_VERIFY/);
  assert.match(script,/main changed; update branch and re-run independent gate/);
  assert.match(script,/BARMAN_PREMERGE_INVALIDATED_OPEN_PRS/);
});
