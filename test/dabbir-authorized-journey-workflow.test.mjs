import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const AUTHORIZED_WORKFLOW = '.github/workflows/dabbir-ai-customer-journey.yml';
const UNAUTHORIZED_DUPLICATE = '.github/workflows/dabbir-protected-full-customer-journey.yml';
const BROKER = 'supabase/functions/barman-qa-suite-runner/index.ts';
const ISOLATION_JOURNEY = 'test/dabbir-cross-tenant-isolation.mjs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('privileged DABBIR QA broker remains pinned to the canonical full-journey workflow on main', () => {
  const broker = read(BROKER);
  assert.match(
    broker,
    /workflowRef:'barman-systems\/pilot\/\.github\/workflows\/dabbir-ai-customer-journey\.yml@refs\/heads\/main'/,
  );
  assert.match(broker, /const GH_REF='refs\/heads\/main'/);
});

test('canonical authorized workflow owns protected-prelaunch full journey without widening broker policy', () => {
  const workflow = read(AUTHORIZED_WORKFLOW);
  assert.match(workflow, /JOURNEY_MODE_PROTECTED_PRELAUNCH/);
  assert.match(workflow, /dabbir-protected-full-journey-preload\.mjs/);
  assert.match(workflow, /x-vercel-trusted-oidc-idp-token/);
  assert.match(workflow, /FULL_JOURNEY_PASS/);
  assert.match(workflow, /Prove Production release did not move during journey/);
});

test('privileged journey is main-only and cannot accept a stale Production artifact', () => {
  const workflow = read(AUTHORIZED_WORKFLOW);
  assert.match(workflow, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(workflow, /test "\$GITHUB_WORKFLOW_REF" = 'barman-systems\/pilot\/\.github\/workflows\/dabbir-ai-customer-journey\.yml@refs\/heads\/main'/);
  assert.match(workflow, /\[ "\$sha" = "\$GITHUB_SHA" \]/);
  assert.match(workflow, /EXPECTED_VERCEL_PROJECT_ID: prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq/);
  assert.match(workflow, /EXPECTED_GIT_PROVIDER: github/);
  assert.match(workflow, /EXPECTED_GIT_REPOSITORY: barman-systems\/pilot/);
  assert.match(workflow, /\[ "\$project_id" = "\$EXPECTED_VERCEL_PROJECT_ID" \]/);
  assert.match(workflow, /\[ "\$repository" = "\$EXPECTED_GIT_REPOSITORY" \]/);
  assert.match(workflow, /test "\$sha" = "\$GITHUB_SHA"/);
  assert.match(workflow, /test "\$deployment" = "\$\{\{ steps\.release-before\.outputs\.deployment \}\}"/);
});

test('canonical release journey permanently gates tenant and WhatsApp cross-tenant isolation', () => {
  const workflow = read(AUTHORIZED_WORKFLOW);
  const isolation = read(ISOLATION_JOURNEY);
  assert.match(workflow, /Run cross-tenant and WhatsApp isolation attack/);
  assert.match(workflow, /dabbir-cross-tenant-isolation\.mjs/);
  assert.match(workflow, /CROSS_TENANT_ISOLATION_PASS/);
  assert.match(workflow, /dabbir-cross-tenant-isolation-report\.json/);
  assert.match(isolation, /05_owner_a_cannot_read_tenant_b_runtime/);
  assert.match(isolation, /06_owner_b_cannot_read_tenant_a_runtime/);
  assert.match(isolation, /08_owner_a_whatsapp_tenant_b_denied/);
  assert.match(isolation, /09_owner_b_whatsapp_tenant_a_denied/);
  assert.match(isolation, /NO_TENANT_SELECTED/);
  assert.match(isolation, /BUSINESS_ACCESS_REQUIRED/);
  assert.match(isolation, /dabbir_ai_qa_cleanup/);
});

test('duplicate privileged workflow is removed so it cannot request a broker-denied OIDC identity', () => {
  assert.equal(fs.existsSync(UNAUTHORIZED_DUPLICATE), false);
});
