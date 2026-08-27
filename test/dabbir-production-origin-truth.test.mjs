import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DABBIR_PUBLIC_RUNTIME } from '../config/dabbir-public-runtime.js';

const retiredPilotHost = ['pilot', 'taupe.vercel.app'].join('-');
const guardedFiles = [
  '.github/workflows/dabbir-ai-customer-journey.yml',
  '.github/workflows/dabbir-auth-production.yml',
  'config/barman-integration-contract.json',
  'config/dabbir-public-runtime.js',
  'test/dabbir-public-origin-preflight.mjs',
  'test/dabbir-ai-full-journey-oidc.mjs',
  'test/dabbir-capacity-load.mjs',
  'test/dabbir-capacity-safety.mjs',
  'test/dabbir-capacity-safety.test.mjs',
  'test/password-recovery-origin.test.mjs',
];

test('retired PILOT origin cannot return to DABBIR release controls', () => {
  for (const path of guardedFiles) {
    assert.doesNotMatch(fs.readFileSync(path, 'utf8'), new RegExp(retiredPilotHost.replaceAll('.', '\\.'), 'i'), path);
  }
});

test('canonical production identity is committed once and is not a mutable workflow variable', () => {
  assert.equal(DABBIR_PUBLIC_RUNTIME.productionOrigin, 'https://dabbir-nd56cm4j5v-3619s-projects.vercel.app');
  assert.equal(DABBIR_PUBLIC_RUNTIME.productionHost, 'dabbir-nd56cm4j5v-3619s-projects.vercel.app');
  assert.equal(DABBIR_PUBLIC_RUNTIME.vercelProjectId, 'prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq');
  for (const path of guardedFiles.slice(0, 2)) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /dabbir-public-runtime\.js/);
    assert.doesNotMatch(source, /vars\.DABBIR_PRODUCTION_ORIGIN/);
  }
});

test('deployment governance treats Vercel Authentication as a launch blocker', () => {
  const contract = JSON.parse(fs.readFileSync('config/barman-integration-contract.json', 'utf8'));
  assert.equal(contract.deployment.project_name, 'dabbir');
  assert.equal(contract.deployment.project_id, DABBIR_PUBLIC_RUNTIME.vercelProjectId);
  assert.equal(contract.deployment.canonical_origin, DABBIR_PUBLIC_RUNTIME.productionOrigin);
  assert.equal(contract.deployment.public_launch_domain, DABBIR_PUBLIC_RUNTIME.productionHost);
  assert.equal(contract.deployment.expected_domain_access, 'PUBLIC_HTTPS');
  assert.equal(contract.deployment.observed_domain_access, 'VERCEL_AUTH_PROTECTED');
  assert.equal(contract.deployment.project_live, false);
  assert.equal(contract.deployment.ready_deployment_is_launch_evidence, false);
  assert.ok(contract.deployment.release_blockers.includes('VERCEL_AUTH_PROTECTION'));
});

test('a Vercel READY deployment is never sufficient launch evidence', () => {
  const contract = JSON.parse(fs.readFileSync('config/barman-integration-contract.json', 'utf8'));
  assert.equal(contract.rules.vercel_ready_never_implies_public_ready, true);
  assert.equal(contract.rules.public_entrypoint_required_for_customer_and_provider_callbacks, true);
  assert.equal(contract.deployment.launch_gate, 'CANONICAL_ORIGIN_HTTP_200_WITHOUT_EXTERNAL_AUTH_REDIRECT');
});
