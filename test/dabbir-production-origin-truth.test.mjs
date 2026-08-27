import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const retiredHost = ['pilot', 'taupe.vercel.app'].join('-');
const guardedFiles = [
  '.github/workflows/dabbir-ai-customer-journey.yml',
  '.github/workflows/dabbir-auth-production.yml',
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

test('release workflows require an explicit canonical DABBIR origin', () => {
  for (const path of guardedFiles.slice(0, 2)) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /vars\.DABBIR_PRODUCTION_ORIGIN/);
    assert.match(source, /DABBIR_PRODUCTION_ORIGIN must be configured/);
  }
});

test('deployment contract records the protected no-public-domain state', () => {
  const contract = JSON.parse(fs.readFileSync('config/barman-integration-contract.json', 'utf8'));
  assert.equal(contract.deployment.project_name, 'dabbir');
  assert.equal(contract.deployment.project_id, 'prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq');
  assert.equal(contract.deployment.public_launch_domain, null);
  assert.equal(contract.deployment.domain_access, 'VERCEL_AUTH_PROTECTED');
  assert.equal(contract.deployment.project_live, false);
});
