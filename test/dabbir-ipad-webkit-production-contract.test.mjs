import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const runner=read('test/run-ai-full-customer-journey-ipad.mjs');
const bridge=read('test/run-ai-full-customer-journey-en.mjs');
const canonical=read('.github/workflows/dabbir-ai-customer-journey.yml');
const broker=read('supabase/functions/barman-qa-suite-runner/index.ts');
const deploymentClassifier=read('vercel-ignore-if-unaffected.sh');

test('iPad runner reuses the canonical full journey and changes only the touch viewport',()=>{
  assert.match(runner,/ai-full-customer-journey-v2\.mjs/);
  assert.match(runner,/viewport:\s*\{\s*width:\s*390,\s*height:\s*844\s*\}/);
  assert.match(runner,/viewport: \{ width: 820, height: 1180 \}/);
  assert.match(runner,/isMobile:\\s\*true/);
  assert.match(runner,/hasTouch:\\s\*true/);
  assert.match(runner,/dabbir-ai-customer-journey-report-ipad\.json/);
});

test('iPad executes inside the already-authorized canonical Production journey',()=>{
  assert.match(canonical,/name: DABBIR AI Full Customer Journey/);
  assert.match(canonical,/refs\/heads\/main/);
  assert.match(canonical,/id-token: write/);
  assert.match(canonical,/VERCEL_TRUSTED_OIDC_TOKEN/);
  assert.match(canonical,/\/api\/release-evidence/);
  assert.match(canonical,/run-ai-full-customer-journey-en\.mjs/);
  assert.match(bridge,/run-ai-full-customer-journey-ipad\.mjs/);
  assert.match(bridge,/IPAD_WEBKIT_JOURNEY_PASS/);
  assert.match(bridge,/25_mobile_webkit_owner_journey/);
  assert.match(bridge,/required_failures/);
  assert.match(bridge,/device_matrix/);
  assert.match(bridge,/viewport:\s*'820x1180'/);
  assert.doesNotMatch(canonical,/continue-on-error:\s*true/);
});

test('standalone iPad workflow is retired instead of widening Supabase QA authority',()=>{
  assert.equal(fs.existsSync(new URL('.github/workflows/dabbir-ipad-webkit-production.yml',root)),false);
  assert.match(broker,/dabbir-ai-customer-journey\.yml@refs\/heads\/main/);
  assert.doesNotMatch(broker,/dabbir-ipad-webkit-production\.yml@refs\/heads\/main/);
});

test('canonical and iPad QA contracts force truthful exact-SHA Production deployment',()=>{
  for(const path of [
    '.github/workflows/dabbir-ai-customer-journey.yml',
    'test/run-ai-full-customer-journey-ipad.mjs',
    'test/dabbir-ipad-webkit-production-contract.test.mjs',
  ]){
    assert.ok(deploymentClassifier.includes(path),`${path} must be classified as exact-SHA Production-affecting`);
  }
});
