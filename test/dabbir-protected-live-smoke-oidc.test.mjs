import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/dabbir-protected-live-smoke.yml',import.meta.url),'utf8');
const runner=await readFile(new URL('./dabbir-protected-live-smoke.mjs',import.meta.url),'utf8');

test('protected smoke can use short-lived GitHub trusted OIDC without opening production',()=>{
  assert.match(workflow,/id-token:\s*write/);
  assert.match(workflow,/x-vercel-trusted-oidc-idp-token/);
  assert.match(workflow,/VERCEL_TRUSTED_OIDC_TOKEN/);
  assert.match(workflow,/BLOCKED_VERCEL_AUTOMATION_ACCESS_NOT_CONFIGURED/);
  assert.match(workflow,/steps\.bypass\.outputs\.generated == 'true'/);
});

test('blocked direct Vercel access falls back to a real browser gate and can never become a green skip',()=>{
  assert.match(workflow,/BLOCKED_VERCEL_AUTOMATION_ACCESS_NOT_CONFIGURED_FALLING_BACK_TO_ONE_TIME_BROWSER_BRIDGE/);
  assert.match(workflow,/bridge_required=true/);
  assert.match(workflow,/Run one-time protected browser bridge/);
  assert.match(workflow,/jq -e '\.ok == true and \.pass == true'[\s\S]{0,120}?exit 2/);
  assert.match(workflow,/BLOCKED_VERCEL_BYPASS_GENERATION_FAILED'[\s\S]{0,260}?exit 2/);
});

test('smoke runner supports either documented direct Vercel protection access method',()=>{
  assert.match(runner,/VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(runner,/VERCEL_TRUSTED_OIDC_TOKEN/);
  assert.match(runner,/x-vercel-protection-bypass/);
  assert.match(runner,/x-vercel-trusted-oidc-idp-token/);
  assert.match(runner,/VERCEL_PROTECTED_ACCESS_REQUIRED/);
});
