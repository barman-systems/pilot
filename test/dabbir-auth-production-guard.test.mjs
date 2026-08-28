import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/dabbir-auth-production.yml', 'utf8');

test('auth production guard attempts native Supabase HIBP only with management credential', () => {
  assert.match(workflow, /Enforce native Supabase leaked password protection/);
  assert.match(workflow, /if: steps\.credential\.outputs\.available == 'true'/);
  assert.match(workflow, /password_hibp_enabled/);
  assert.match(workflow, /password_hibp_enabled !== true/);
});

test('missing management credential verifies the DABBIR compensating control instead of claiming native success', () => {
  assert.match(workflow, /Verify DABBIR compensating leaked-password guard/);
  assert.match(workflow, /if: steps\.credential\.outputs\.available != 'true'/);
  assert.match(workflow, /node --test test\/dabbir-password-breach-check\.test\.mjs/);
  assert.match(workflow, /native leaked-password protection was not modified/);
  assert.match(workflow, /application-layer HIBP k-anonymity guard is verified/);
  assert.doesNotMatch(workflow, /Block when management credential is unavailable/);
});

test('auth workflow reruns when the compensating control changes', () => {
  assert.match(workflow, /api\/_password-breach-check\.js/);
  assert.match(workflow, /test\/dabbir-password-breach-check\.test\.mjs/);
  assert.match(workflow, /api\/auth\/\*\*/);
});

test('hosted Auth URL mutation remains credential-gated', () => {
  assert.match(workflow, /Enforce hosted Supabase Auth URLs/);
  assert.match(workflow, /steps\.credential\.outputs\.available == 'true' && steps\.launch-gate\.outputs\.ready == 'true'/);
});
