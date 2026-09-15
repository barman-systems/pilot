import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('dependency and ownership automation are installed', () => {
  const dependabot = read('.github/dependabot.yml');
  const owners = read('.github/CODEOWNERS');
  assert.match(dependabot, /package-ecosystem:\s*"npm"/);
  assert.match(dependabot, /package-ecosystem:\s*"github-actions"/);
  assert.match(owners, /\/supabase\/migrations\/\s+@barmanai/);
  assert.match(owners, /\/\.github\/\s+@barmanai/);
});

test('Supabase advisor regression gate is part of the required PR check', () => {
  const ci = read('.github/workflows/ci.yml');
  const gate = read('scripts/dabbir-supabase-advisors-gate.mjs');
  const baseline = JSON.parse(read('config/supabase-advisor-baseline.json'));
  assert.match(ci, /Enforce Supabase advisor regression gate/);
  assert.match(ci, /dabbir-supabase-advisors-gate\.mjs/);
  assert.match(gate, /SUPABASE_MANAGEMENT_CREDENTIAL_REQUIRED_FOR_ADVISOR_GATE/);
  assert.match(gate, /new affected object\(s\)/);
  assert.equal(baseline.security.authenticated_security_definer_function_executable.count, 9);
  assert.equal(baseline.performance.unindexed_foreign_keys.count, 26);
});

test('daily advisor watch uses the same fail-closed gate', () => {
  const workflow = read('.github/workflows/dabbir-supabase-advisors.yml');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /DABBIR_FORCE_ADVISORS:\s*'1'/);
  assert.match(workflow, /dabbir-supabase-advisors-gate\.mjs/);
});
