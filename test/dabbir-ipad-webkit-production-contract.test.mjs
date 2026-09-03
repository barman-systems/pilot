import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const runner=read('test/run-ai-full-customer-journey-ipad.mjs');
const workflow=read('.github/workflows/dabbir-ipad-webkit-production.yml');

test('iPad runner reuses the canonical full journey and changes only the touch viewport',()=>{
  assert.match(runner,/ai-full-customer-journey-v2\.mjs/);
  assert.match(runner,/viewport:\s*\{\s*width:\s*390,\s*height:\s*844\s*\}/);
  assert.match(runner,/viewport: \{ width: 820, height: 1180 \}/);
  assert.match(runner,/isMobile:\\s\*true/);
  assert.match(runner,/hasTouch:\\s\*true/);
  assert.match(runner,/dabbir-ai-customer-journey-report-ipad\.json/);
});

test('iPad Production workflow is exact-SHA, OIDC protected, and fail closed on the real WebKit journey',()=>{
  assert.match(workflow,/name: DABBIR iPad WebKit Production/);
  assert.match(workflow,/refs\/heads\/main/);
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/VERCEL_TRUSTED_OIDC_TOKEN/);
  assert.match(workflow,/\/api\/release-evidence/);
  assert.match(workflow,/observed.*GITHUB_SHA/);
  assert.match(workflow,/run-ai-full-customer-journey-ipad\.mjs/);
  assert.match(workflow,/25_mobile_webkit_owner_journey/);
  assert.match(workflow,/IPAD_WEBKIT_FULL_JOURNEY_PASS/);
  assert.match(workflow,/STABLE_IPAD_PRODUCTION_SHA/);
  assert.doesNotMatch(workflow,/continue-on-error:\s*true/);
});

test('iPad exact-Production gate retriggers when Vercel release classification changes',()=>{
  assert.match(workflow,/- 'vercel-ignore-if-unaffected\.sh'/);
});
