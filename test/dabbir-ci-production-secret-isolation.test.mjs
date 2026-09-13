import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const recovery = fs.readFileSync('.github/workflows/dabbir-recovery-proof.yml', 'utf8');
const dependabot = fs.readFileSync('.github/dependabot.yml', 'utf8');

test('pull request CI never invokes the live Supabase advisor step', () => {
  const block = ci.match(/- name: Enforce Supabase advisor regression gate[\s\S]*?(?=\n\s+- name:)/)?.[0] || '';
  assert.match(block, /if: github\.event_name != 'pull_request'/);
  assert.match(block, /SUPABASE_(ACCESS|MANAGEMENT)_TOKEN/);
});

test('recovery proof is manual, production-protected, and main-only', () => {
  assert.doesNotMatch(recovery, /\n\s*pull_request:/);
  assert.match(recovery, /workflow_dispatch:/);
  assert.match(recovery, /options: \[READ_ONLY_PRODUCTION_BACKUP\]/);
  assert.match(recovery, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(recovery, /environment: production/);
});

test('retired Vercel cutover cleanup workflow cannot run again', () => {
  assert.equal(fs.existsSync('.github/workflows/dabbir-vercel-cleanup.yml'), false);
});

test('Dependabot covers every npm manifest tree', () => {
  for (const directory of ['/', '/mobile', '/integrations/trigger']) {
    assert.ok(dependabot.includes(`directory: "${directory}"`), directory);
  }
});
