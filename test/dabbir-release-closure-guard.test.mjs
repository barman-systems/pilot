import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateReleaseClosure,validateReleaseClosureConfig} from '../.github/scripts/dabbir-release-closure-guard.mjs';

const config=validateReleaseClosureConfig({
  version:1,
  active:true,
  closure_issue:878,
  control_head_ref:'release-closure/control-878',
  control_title_prefix:'governance(release-closure):',
  control_allowed_paths:[
    '.github/dabbir-release-closure.json',
    '.github/scripts/dabbir-release-closure-guard.mjs',
    '.github/workflows/barman-independent-premerge-gate.yml',
    'test/dabbir-release-closure-guard.test.mjs',
  ],
  allowed_head_refs:['fix/ai-provider-cost-registry-v1','security/p0a-secret-history-audit'],
  allowed_head_prefixes:['guardian/revert-'],
  guardian_title_prefix:'revert(guardian):',
});

const pr=(headRef,{title='candidate',headRepo='barman-systems/pilot',baseRepo='barman-systems/pilot',baseRef='main'}={})=>({
  number:123,
  title,
  base:{ref:baseRef,repo:{full_name:baseRepo}},
  head:{ref:headRef,repo:{full_name:headRepo}},
});

test('release closure allows only the two canonical implementation lanes',()=>{
  assert.equal(evaluateReleaseClosure({config,pr:pr('fix/ai-provider-cost-registry-v1')}).allowed,true);
  assert.equal(evaluateReleaseClosure({config,pr:pr('security/p0a-secret-history-audit')}).allowed,true);
  const denied=evaluateReleaseClosure({config,pr:pr('feat/v3-baseline-instrumentation-v2')});
  assert.equal(denied.allowed,false);
  assert.equal(denied.reason,'RELEASE_CLOSURE_HEAD_REF_DENIED');
});

test('release closure blocks forks and non-main bases even when branch name looks allowed',()=>{
  assert.equal(evaluateReleaseClosure({config,pr:pr('fix/ai-provider-cost-registry-v1',{headRepo:'other/fork'})}).reason,'RELEASE_CLOSURE_FORK_DENIED');
  assert.equal(evaluateReleaseClosure({config,pr:pr('fix/ai-provider-cost-registry-v1',{baseRef:'develop'})}).reason,'RELEASE_CLOSURE_BASE_NOT_MAIN');
});

test('guardian rollback prefix is allowed only with the governed revert title',()=>{
  const good=evaluateReleaseClosure({config,pr:pr('guardian/revert-deadbeef',{title:'revert(guardian): DABBIR CI regression'})});
  assert.equal(good.allowed,true);
  const bad=evaluateReleaseClosure({config,pr:pr('guardian/revert-deadbeef',{title:'feature hiding behind guardian prefix'})});
  assert.equal(bad.allowed,false);
  assert.equal(bad.reason,'RELEASE_CLOSURE_GUARDIAN_TITLE_DENIED');
});

test('release control branch can change only closure trust-root files',()=>{
  const good=evaluateReleaseClosure({
    config,
    pr:pr('release-closure/control-878',{title:'governance(release-closure): enforce finish line'}),
    files:['.github/dabbir-release-closure.json','.github/scripts/dabbir-release-closure-guard.mjs'],
  });
  assert.equal(good.allowed,true);

  const bad=evaluateReleaseClosure({
    config,
    pr:pr('release-closure/control-878',{title:'governance(release-closure): sneak product change'}),
    files:['.github/dabbir-release-closure.json','api/dabbir-ai.js'],
  });
  assert.equal(bad.allowed,false);
  assert.equal(bad.reason,'RELEASE_CLOSURE_CONTROL_PATH_DENIED');
  assert.deepEqual(bad.deniedPaths,['api/dabbir-ai.js']);
});

test('control branch requires exact governance title and an explicit changed-file set',()=>{
  assert.equal(evaluateReleaseClosure({config,pr:pr('release-closure/control-878',{title:'ordinary change'}),files:['.github/dabbir-release-closure.json']}).reason,'RELEASE_CLOSURE_CONTROL_TITLE_DENIED');
  assert.equal(evaluateReleaseClosure({config,pr:pr('release-closure/control-878',{title:'governance(release-closure): empty'})}).reason,'RELEASE_CLOSURE_CONTROL_FILES_REQUIRED');
});

test('inactive closure stops restricting pull requests',()=>{
  const inactive={...config,active:false};
  const result=evaluateReleaseClosure({config:inactive,pr:pr('anything/goes')});
  assert.equal(result.allowed,true);
  assert.equal(result.reason,'RELEASE_CLOSURE_INACTIVE');
});
