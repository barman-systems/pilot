import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const retiredHost = ['pilot', 'taupe.vercel.app'].join('-');
const releaseWorkflows = [
  '.github/workflows/dabbir-ai-customer-journey.yml',
  '.github/workflows/dabbir-auth-production.yml',
  '.github/workflows/dabbir-owner-away-production.yml',
];
const guardedFiles = [
  ...releaseWorkflows,
  'scripts/dabbir-production-origin-gate.mjs',
  'config/barman-integration-contract.json',
  'test/ai-full-customer-journey.mjs',
  'test/ai-full-customer-journey-oidc.mjs',
  'test/ai-full-customer-journey-v2.mjs',
  'test/dabbir-ai-full-journey-oidc.mjs',
  'test/dabbir-capacity-load.mjs',
  'test/dabbir-capacity-safety.mjs',
  'test/dabbir-capacity-safety.test.mjs',
  'test/password-recovery-origin.test.mjs',
];

test('retired PILOT origin cannot return to DABBIR release controls', () => {
  for (const path of guardedFiles) {
    assert.doesNotMatch(fs.readFileSync(path, 'utf8'), new RegExp(retiredHost.replaceAll('.', '\\.'), 'i'), path);
  }
});

test('all release workflows use the same strict canonical DABBIR public-origin gate', () => {
  for (const path of releaseWorkflows) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /PRODUCTION_ORIGIN:/, path);
    assert.match(source, /scripts\/dabbir-production-origin-gate\.mjs/, path);
    assert.match(source, /launch-gate/, path);
  }

  // The auth guard is account-security critical, so it pins the currently
  // verified production origin rather than depending on an unset repository var.
  const auth = fs.readFileSync('.github/workflows/dabbir-auth-production.yml', 'utf8');
  assert.match(auth, /PRODUCTION_ORIGIN: https:\/\/dabbir\.bmalman\.com/);
  assert.match(auth, /PROJECT_REF: fphpoysqdsceniwduxjq/);

  const gate=fs.readFileSync('scripts/dabbir-production-origin-gate.mjs','utf8');
  assert.match(gate, /DABBIR_PRODUCTION_ORIGIN must be configured as the canonical public HTTPS origin/);
  assert.match(gate, /BLOCKED_PRELAUNCH/);
  assert.match(gate, /VERCEL_AUTH_PROTECTED/);
  assert.match(gate, /FAIL_CLOSED_PREVIEW_ONLY/);
});

test('protected prelaunch permits verification journey only while public launch and capacity stay blocked', () => {
  const journey=fs.readFileSync('.github/workflows/dabbir-ai-customer-journey.yml','utf8');
  const away=fs.readFileSync('.github/workflows/dabbir-owner-away-production.yml','utf8');
  const auth=fs.readFileSync('.github/workflows/dabbir-auth-production.yml','utf8');

  // The full customer journey may verify the protected canonical Production release.
  assert.match(journey,/steps\.journey-mode\.outputs\.ready == 'true'/);
  assert.match(journey,/JOURNEY_MODE_PROTECTED_PRELAUNCH/);
  assert.match(journey,/dabbir-protected-full-journey-preload\.mjs/);

  // Public launch readiness remains sourced only from the strict launch gate.
  assert.match(journey,/production_ready: \$\{\{ steps\.launch-gate\.outputs\.ready \}\}/);

  // High-load capacity stays impossible until the canonical public launch gate is truly ready.
  assert.match(journey,/needs\.full-customer-journey\.outputs\.production_ready == 'true'/);
  assert.match(journey,/production_capacity_ack == 'ALLOW_CAPACITY_LOAD_ON_PRODUCTION'/);

  // Other production-only journeys remain public-launch gated.
  assert.match(away,/steps\.launch-gate\.outputs\.ready == 'true'/);
  assert.match(auth,/steps\.credential\.outputs\.available == 'true' && steps\.launch-gate\.outputs\.ready == 'true'/);
});

test('deployment contract records the live Mumbai production state', () => {
  const contract = JSON.parse(fs.readFileSync('config/barman-integration-contract.json', 'utf8'));
  assert.equal(contract.status, 'ACTIVE_PRODUCTION');
  assert.equal(contract.deployment.project_name, 'dabbir');
  assert.equal(contract.deployment.project_id, 'prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq');
  assert.equal(contract.deployment.public_launch_domain, 'dabbir.bmalman.com');
  assert.equal(contract.deployment.domain_access, 'PUBLIC_PRODUCTION');
  assert.equal(contract.deployment.production_runtime_policy, 'ACTIVE_FAIL_CLOSED');
  assert.equal(contract.deployment.project_live, true);
  assert.equal(contract.deployment.production_region, 'bom1');
  assert.equal(contract.database.project_ref, 'fphpoysqdsceniwduxjq');
  assert.equal(contract.database.region, 'ap-south-1');
  assert.equal(contract.database.retired_runtime_source_ref, 'spohjzrsymsmzsseygtw');
  assert.equal(contract.database.retired_runtime_source_policy, 'NO_RUNTIME_FALLBACK');
  assert.equal(contract.rules.retired_supabase_runtime_fallback_allowed, false);
});
