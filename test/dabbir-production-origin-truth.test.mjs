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

test('all release workflows use the same strict canonical DABBIR origin gate', () => {
  for (const path of releaseWorkflows) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /vars\.DABBIR_PRODUCTION_ORIGIN/, path);
    assert.match(source, /scripts\/dabbir-production-origin-gate\.mjs/, path);
    assert.match(source, /launch-gate/, path);
  }
  const gate=fs.readFileSync('scripts/dabbir-production-origin-gate.mjs','utf8');
  assert.match(gate, /DABBIR_PRODUCTION_ORIGIN must be configured as the canonical public HTTPS origin/);
  assert.match(gate, /BLOCKED_PRELAUNCH/);
  assert.match(gate, /VERCEL_AUTH_PROTECTED/);
  assert.match(gate, /FAIL_CLOSED_PREVIEW_ONLY/);
});

test('production journeys and capacity cannot execute while the public launch gate is blocked', () => {
  const journey=fs.readFileSync('.github/workflows/dabbir-ai-customer-journey.yml','utf8');
  const away=fs.readFileSync('.github/workflows/dabbir-owner-away-production.yml','utf8');
  const auth=fs.readFileSync('.github/workflows/dabbir-auth-production.yml','utf8');
  assert.match(journey,/steps\.launch-gate\.outputs\.ready == 'true'/);
  assert.match(journey,/needs\.full-customer-journey\.outputs\.production_ready == 'true'/);
  assert.match(away,/steps\.launch-gate\.outputs\.ready == 'true'/);
  assert.match(auth,/steps\.credential\.outputs\.available == 'true' && steps\.launch-gate\.outputs\.ready == 'true'/);
});

test('deployment contract records the protected no-public-domain state', () => {
  const contract = JSON.parse(fs.readFileSync('config/barman-integration-contract.json', 'utf8'));
  assert.equal(contract.deployment.project_name, 'dabbir');
  assert.equal(contract.deployment.project_id, 'prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq');
  assert.equal(contract.deployment.public_launch_domain, null);
  assert.equal(contract.deployment.domain_access, 'VERCEL_AUTH_PROTECTED');
  assert.equal(contract.deployment.production_runtime_policy, 'FAIL_CLOSED_PREVIEW_ONLY');
  assert.equal(contract.deployment.project_live, false);
});
