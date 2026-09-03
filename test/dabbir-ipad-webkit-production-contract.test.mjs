import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const pathUrl=path=>new URL(path,root);
const read=path=>fs.readFileSync(pathUrl(path),'utf8');
const wrapper=read('test/run-ai-full-customer-journey-en.mjs');
const canonicalWorkflow=read('.github/workflows/dabbir-ai-customer-journey.yml');
const broker=read('supabase/functions/barman-qa-suite-runner/index.ts');
const deploymentClassifier=read('vercel-ignore-if-unaffected.sh');

test('iPad WebKit journey runs inside the already-authorized canonical customer journey identity',()=>{
  assert.equal(fs.existsSync(pathUrl('.github/workflows/dabbir-ipad-webkit-production.yml')),false,'standalone privileged iPad workflow must be retired');
  assert.equal(fs.existsSync(pathUrl('test/run-ai-full-customer-journey-ipad.mjs')),false,'standalone iPad runner must be retired');
  assert.match(canonicalWorkflow,/run-ai-full-customer-journey-en\.mjs/);
  assert.match(canonicalWorkflow,/GITHUB_WORKFLOW_REF.*dabbir-ai-customer-journey\.yml@refs\/heads\/main/);
  assert.match(wrapper,/viewport: \{ width: 820, height: 1180 \}/);
  assert.match(wrapper,/isMobile:\\s\*true/);
  assert.match(wrapper,/hasTouch:\\s\*true/);
  assert.match(wrapper,/dabbir-ai-customer-journey-report-ipad\.json/);
  assert.match(wrapper,/25_mobile_webkit_owner_journey/);
  assert.match(wrapper,/label: 'IPAD_WEBKIT'/);
  assert.match(wrapper,/IPAD_WEBKIT_JOURNEY_PASS/);
});

test('canonical iPad journey remains fail closed and persists its PASS summary into uploaded canonical evidence',()=>{
  assert.match(wrapper,/\$\{label\}_REPORT_MISSING/);
  assert.match(wrapper,/\$\{label\}_JOURNEY_NOT_PASS/);
  assert.match(wrapper,/report\.verdict !== 'PASS'/);
  assert.match(wrapper,/mobileStep\?\.status !== 'PASS'/);
  assert.match(wrapper,/english\.report\.ipad_webkit/);
  assert.match(wrapper,/mobile_step_status: ipad\.mobileStep\.status/);
  assert.match(wrapper,/report_path: ipadReportPath/);
  assert.doesNotMatch(canonicalWorkflow,/continue-on-error:\s*true/);
});

test('Supabase QA broker authority is not widened for iPad',()=>{
  assert.match(
    broker,
    /workflowRefs:new Set\(\['barman-systems\/pilot\/\.github\/workflows\/dabbir-ai-customer-journey\.yml@refs\/heads\/main','barman-systems\/pilot\/\.github\/workflows\/dabbir-owner-away-production\.yml@refs\/heads\/main'\]\)/,
  );
  assert.doesNotMatch(broker,/dabbir-ipad-webkit-production\.yml@refs\/heads\/main/);
  assert.match(broker,/workflowRefs\.has\(String\(payload\.workflow_ref\|\|''\)\)/);
});

test('canonical iPad-bearing wrapper and its contract force an exact-SHA Production deployment',()=>{
  for(const path of [
    'test/run-ai-full-customer-journey-en.mjs',
    'test/dabbir-ipad-webkit-production-contract.test.mjs',
  ]){
    assert.ok(deploymentClassifier.includes(path),`${path} must be classified as exact-SHA Production-affecting`);
  }
  assert.doesNotMatch(deploymentClassifier,/\.github\/workflows\/dabbir-ipad-webkit-production\.yml/);
  assert.doesNotMatch(deploymentClassifier,/test\/run-ai-full-customer-journey-ipad\.mjs/);
});
