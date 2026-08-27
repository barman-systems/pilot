import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const workflowPath = '.github/workflows/dabbir-autonomous-source-control.yml';
const runnerPath = 'scripts/dabbir-autonomous-source-control.mjs';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const runner = fs.readFileSync(runnerPath, 'utf8');

test('autonomous source-control runner parses on Node 24', () => {
  const result = spawnSync(process.execPath, ['--check', runnerPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('workflow runs every five minutes with OIDC and PR write permissions', () => {
  assert.match(workflow, /cron:\s*['"]\*\/5 \* \* \* \*['"]/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /pull-requests:\s*write/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /audience=barman-dabbir-source-control/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test('runner is branch-and-PR only and protects its own control files', () => {
  assert.match(runner, /barman\/dabbir-auto-/);
  assert.match(runner, /\/pulls/);
  assert.match(runner, /merge_method:\s*'squash'/);
  assert.match(runner, /path === workflowPath \|\| path === controlScript/);
  assert.doesNotMatch(runner, /push[^\n]*HEAD:main/);
});

test('runner enforces local tests and bounded CI repair', () => {
  assert.match(runner, /\['npm', \['ci'\]\]/);
  assert.match(runner, /\['npm', \['test'\]\]/);
  assert.match(runner, /audit.*--audit-level=high/);
  assert.match(runner, /repair_attempts \|\| 0\) >= 3/);
  assert.match(runner, /localAttempt < 2/);
});

test('autonomy fails closed unless main is actually protected', () => {
  assert.match(runner, /async function requireProtectedMain\(\)/);
  assert.match(runner, /github\('\/branches\/main'\)/);
  assert.match(runner, /branch\.body\?\.protected !== true/);
  assert.match(runner, /main_branch_not_protected/);
  assert.match(runner, /const protection = await requireProtectedMain\(\);/);
  assert.match(runner, /branch_protection_verified:\s*true/);
});

test('auto-merge requires exact required DABBIR checks to succeed', () => {
  assert.match(runner, /DABBIR_REQUIRED_CHECKS \|\| 'test'/);
  assert.match(runner, /run\.name === name/);
  assert.match(runner, /check\.conclusion === 'success'/);
  assert.match(runner, /required_missing/);
  assert.match(runner, /merge_truth_gate_not_satisfied/);
  assert.doesNotMatch(runner, /\['success', 'neutral', 'skipped'\]/);
});

test('draft PRs can never be auto-merged', () => {
  assert.match(runner, /pr\.body\?\.draft === true/);
  assert.match(runner, /draft_pr_not_mergeable_by_autonomy/);
});
