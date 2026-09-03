import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const runner=read('test/run-ai-full-customer-journey-ipad.mjs');
const workflow=read('.github/workflows/dabbir-ai-customer-journey.yml');
const deploymentClassifier=read('vercel-ignore-if-unaffected.sh');
const standaloneWorkflow=new URL('.github/workflows/dabbir-ipad-webkit-production.yml',root);

test('iPad runner reuses the canonical full journey and changes only the touch viewport',()=>{
  assert.match(runner,/ai-full-customer-journey-v2\.mjs/);
  assert.match(runner,/viewport:\s*\{\s*width:\s*390,\s*height:\s*844\s*\}/);
  assert.match(runner,/viewport: \{ width: 820, height: 1180 \}/);
  assert.match(runner,/isMobile:\\s\*true/);
  assert.match(runner,/hasTouch:\\s\*true/);
  assert.match(runner,/dabbir-ai-customer-journey-report-ipad\.json/);
});

test('canonical Production workflow runs iPad under the already-authorized exact-SHA OIDC identity',()=>{
  assert.match(workflow,/name: DABBIR AI Full Customer Journey/);
  assert.match(workflow,/test "\$GITHUB_WORKFLOW_REF" = 'barman-systems\/pilot\/\.github\/workflows\/dabbir-ai-customer-journey\.yml@refs\/heads\/main'/);
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/Lock exact Production release before journey/);
  assert.match(workflow,/Run iPad WebKit owner journey against exact Production/);
  assert.match(workflow,/run-ai-full-customer-journey-ipad\.mjs/);
  assert.match(workflow,/25_mobile_webkit_owner_journey/);
  assert.match(workflow,/IPAD_WEBKIT_FULL_JOURNEY_PASS/);
  assert.match(workflow,/dabbir-ai-customer-journey-report-ipad\.json/);
  assert.match(workflow,/Prove Production release did not move during journey/);
  assert.doesNotMatch(workflow,/continue-on-error:\s*true/);
  assert.equal(fs.existsSync(standaloneWorkflow),false,'iPad must not own a third privileged OIDC workflow');
});

test('all canonical iPad exact-SHA QA contract files force a truthful Production deployment',()=>{
  for(const path of [
    '.github/workflows/dabbir-ai-customer-journey.yml',
    'test/run-ai-full-customer-journey-ipad.mjs',
    'test/dabbir-ipad-webkit-production-contract.test.mjs',
  ]){
    assert.ok(deploymentClassifier.includes(path),`${path} must be classified as exact-SHA Production-affecting`);
  }
  assert.ok(!deploymentClassifier.includes('.github/workflows/dabbir-ipad-webkit-production.yml'),'removed standalone iPad workflow must not remain a release authority');
});
