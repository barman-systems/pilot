import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/dabbir-ai-customer-journey.yml','utf8');
const readiness=fs.readFileSync('.github/workflows/dabbir-bar12-readiness.yml','utf8');
const runner=fs.readFileSync('supabase/functions/dabbir-qa-suite-runner/index.ts','utf8');

const MUMBAI='fphpoysqdsceniwduxjq';
const LEGACY='spohjzrsymsmzsseygtw';

test('production customer journey creates disposable QA identities in the Mumbai production project',()=>{
  assert.match(workflow,new RegExp(`SUPABASE_PROJECT_REF: ${MUMBAI}`));
  assert.doesNotMatch(workflow,new RegExp(LEGACY));
});

test('every executable release and QA route is pinned away from retired Sydney',()=>{
  const executionSources=[
    readiness,
    ...[
      'test/dabbir-capacity-load.mjs',
      'test/ai-full-customer-journey.mjs',
      'test/dabbir-owner-away-production-journey.mjs',
      'test/dabbir-ai-full-journey-oidc.mjs',
      'test/ai-full-customer-journey-v2.mjs',
      'test/ai-full-customer-journey-oidc.mjs',
      'test/dabbir-cross-tenant-isolation.mjs'
    ].map(path=>fs.readFileSync(path,'utf8'))
  ];
  for(const source of executionSources){
    assert.match(source,new RegExp(MUMBAI));
    assert.doesNotMatch(source,new RegExp(LEGACY));
  }
});

test('Mumbai QA runner is narrowly scoped and main-only',()=>{
  assert.match(runner,/GH_REF='refs\/heads\/main'/);
  assert.match(runner,/dabbir-ai-customer-journey\.yml@refs\/heads\/main/);
  assert.match(runner,/GH_AUDIENCE='dabbir-ai-qa'/);
  assert.match(runner,/dabbir_ai_qa_bootstrap/);
  assert.match(runner,/dabbir_ai_qa_seed_order/);
  assert.match(runner,/dabbir_ai_qa_cleanup/);
  assert.doesNotMatch(runner,/x-barman-worker-secret/);
  assert.doesNotMatch(runner,/barman_create_qa_suite_v2/);
});

test('journey keeps exact-release and cross-tenant gates while using Mumbai QA',()=>{
  assert.match(workflow,/EXACT_PRODUCTION_RELEASE_UNVERIFIED/);
  assert.match(workflow,/EXACT_PRODUCTION_RELEASE_DRIFT_OR_UNAVAILABLE/);
  assert.match(workflow,/CROSS_TENANT_ISOLATION_PASS/);
  assert.match(workflow,/FULL_JOURNEY_PASS/);
});
