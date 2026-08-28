import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/dabbir-protected-live-smoke.yml',import.meta.url),'utf8');
const runner=await readFile(new URL('./dabbir-protected-live-smoke.mjs',import.meta.url),'utf8');
const releaseEvidence=await readFile(new URL('../api/release-evidence.js',import.meta.url),'utf8');

test('protected smoke can use short-lived GitHub trusted OIDC without opening production',()=>{
  assert.match(workflow,/id-token:\s*write/);
  assert.match(workflow,/x-vercel-trusted-oidc-idp-token/);
  assert.match(workflow,/VERCEL_TRUSTED_OIDC_TOKEN/);
  assert.match(workflow,/BLOCKED_VERCEL_AUTOMATION_ACCESS_NOT_CONFIGURED/);
  assert.match(workflow,/steps\.bypass\.outputs\.generated == 'true'/);
});

test('blocked automation access is a real failing gate, never a green skipped journey',()=>{
  const blocked=workflow.match(/echo 'BLOCKED_VERCEL_AUTOMATION_ACCESS_NOT_CONFIGURED'[\s\S]{0,900}?exit 2/);
  assert.ok(blocked,'blocked protection access must terminate the job with exit 2');
  assert.match(workflow,/browser journey did not run/);
  assert.match(workflow,/BLOCKED_VERCEL_BYPASS_GENERATION_FAILED'[\s\S]{0,240}?exit 2/);
});

test('protected smoke is bound to the exact production release SHA',()=>{
  assert.match(workflow,/EXPECTED_PRODUCTION_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(runner,/EXPECTED_PRODUCTION_SHA/);
  assert.match(runner,/00_exact_production_sha/);
  assert.match(runner,/\/api\/release-evidence/);
  assert.match(runner,/observed === EXPECTED_SHA/);
  assert.match(runner,/EXACT_PRODUCTION_SHA_NOT_READY/);
  assert.match(runner,/verified_production_sha/);
});

test('every DABBIR runtime release can trigger the protected smoke',()=>{
  assert.match(workflow,/- 'api\/\*\*'/);
  assert.match(workflow,/- 'index\.html'/);
  assert.match(workflow,/- 'package\.json'/);
  assert.match(workflow,/- 'supabase\/migrations\/\*dabbir\*'/);
  assert.match(workflow,/- 'db\/dabbir\*\.sql'/);
});

test('release evidence exposes only safe deployment identity and fails closed without commit evidence',()=>{
  assert.match(releaseEvidence,/VERCEL_GIT_COMMIT_SHA/);
  assert.match(releaseEvidence,/VERCEL_DEPLOYMENT_ID/);
  assert.match(releaseEvidence,/VERCEL_TARGET_ENV/);
  assert.match(releaseEvidence,/RELEASE_COMMIT_EVIDENCE_UNAVAILABLE/);
  assert.match(releaseEvidence,/cache-control','no-store/);
  assert.doesNotMatch(releaseEvidence,/SERVICE_ROLE|SUPABASE_KEY|TOKEN|SECRET|PASSWORD/);
});

test('iPhone brand assertion is scoped to the visible auth gate, never the hidden mobile shell brand',()=>{
  assert.match(runner,/const authGate = page\.locator\('#authGate:not\(\.hidden\)'\)/);
  assert.match(runner,/authGate\.locator\('\.authCard \.brand \.logo'\)/);
  assert.match(runner,/AUTH_APPROVED_LOGO_COUNT_/);
  assert.match(runner,/AUTH_APPROVED_LOGO_NOT_RENDERED/);
  assert.doesNotMatch(runner,/page\.locator\('\.brand \.logo'\)\.first\(\)/);
});

test('failure evidence captures the iPhone screen before brand-specific assertions',()=>{
  const screenshotAt=runner.indexOf("page.screenshot({ path: 'dabbir-protected-live-smoke.png'");
  const logoAt=runner.indexOf("authGate.locator('.authCard .brand .logo')");
  assert.ok(screenshotAt>0&&logoAt>0&&screenshotAt<logoAt,'screenshot must be captured before brand assertion failures');
});

test('smoke runner supports either documented protection access method',()=>{
  assert.match(runner,/VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(runner,/VERCEL_TRUSTED_OIDC_TOKEN/);
  assert.match(runner,/x-vercel-protection-bypass/);
  assert.match(runner,/x-vercel-trusted-oidc-idp-token/);
  assert.match(runner,/VERCEL_PROTECTED_ACCESS_REQUIRED/);
});
