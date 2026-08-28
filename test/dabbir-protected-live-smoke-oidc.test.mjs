import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/dabbir-protected-live-smoke.yml',import.meta.url),'utf8');
const runner=await readFile(new URL('./dabbir-protected-live-smoke.mjs',import.meta.url),'utf8');

test('protected smoke can use short-lived GitHub trusted OIDC without opening production and fall back safely',()=>{
  assert.match(workflow,/id-token:\s*write/);
  assert.match(workflow,/x-vercel-trusted-oidc-idp-token/);
  assert.match(workflow,/VERCEL_TRUSTED_OIDC_TOKEN/);
  assert.match(workflow,/DIRECT_VERCEL_AUTOMATION_ACCESS_UNAVAILABLE_USING_ONE_TIME_BROWSER_BRIDGE/);
  assert.match(workflow,/method=one_time_vault_browser_bridge/);
  assert.match(workflow,/bridge_required=true/);
  assert.match(workflow,/steps\.bypass\.outputs\.generated == 'true'/);
});

test('smoke runner supports either documented direct Vercel protection access method',()=>{
  assert.match(runner,/VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(runner,/VERCEL_TRUSTED_OIDC_TOKEN/);
  assert.match(runner,/x-vercel-protection-bypass/);
  assert.match(runner,/x-vercel-trusted-oidc-idp-token/);
  assert.match(runner,/VERCEL_PROTECTED_ACCESS_REQUIRED/);
});
