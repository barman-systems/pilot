import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const AUTHORIZED_WORKFLOW = '.github/workflows/dabbir-ai-customer-journey.yml';
const UNAUTHORIZED_DUPLICATE = '.github/workflows/dabbir-protected-full-customer-journey.yml';
const BROKER = 'supabase/functions/barman-qa-suite-runner/index.ts';

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

test('duplicate privileged workflow is removed so it cannot request a broker-denied OIDC identity', () => {
  assert.equal(fs.existsSync(UNAUTHORIZED_DUPLICATE), false);
});
