import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const sourceScript = path.resolve('vercel-ignore-if-unaffected.sh');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function setupRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dabbir-vercel-ignore-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'dabbir-ci@example.invalid');
  git(dir, 'config', 'user.name', 'DABBIR CI');
  fs.copyFileSync(sourceScript, path.join(dir, 'vercel-ignore-if-unaffected.sh'));
  fs.mkdirSync(path.join(dir, 'api'));
  fs.mkdirSync(path.join(dir, 'test'));
  fs.writeFileSync(path.join(dir, 'api', 'app.js'), 'export default 1;\n');
  fs.writeFileSync(path.join(dir, 'test', 'base.test.mjs'), 'export {};\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'base');
  return dir;
}

function runGuard(cwd, current, previousDeployment = '') {
  return spawnSync('bash', ['vercel-ignore-if-unaffected.sh'], {
    cwd,
    env: {
      ...process.env,
      VERCEL_GIT_COMMIT_SHA: current,
      VERCEL_GIT_PREVIOUS_SHA: previousDeployment,
    },
    encoding: 'utf8',
  });
}

test('test-only changes skip Vercel deployment when no runtime drift exists since last success', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'test', 'new.test.mjs'), 'export {};\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'test only');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(runGuard(dir, head, lastSuccessfulDeployment).status, 0);
});

test('failed or unverified runtime change cannot be hidden by a later test-only commit', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');

  fs.writeFileSync(path.join(dir, 'api', 'app.js'), 'export default 2;\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'runtime change not yet verified');

  fs.writeFileSync(path.join(dir, 'test', 'later.test.mjs'), 'export {};\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'test-only repair');
  const head = git(dir, 'rev-parse', 'HEAD');

  assert.equal(runGuard(dir, head, lastSuccessfulDeployment).status, 1);
});

test('test-only follow-up may skip after the runtime commit itself is the last successful deployment', () => {
  const dir = setupRepo();
  fs.writeFileSync(path.join(dir, 'api', 'app.js'), 'export default 2;\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'verified runtime');
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');

  fs.writeFileSync(path.join(dir, 'test', 'later.test.mjs'), 'export {};\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'test-only follow-up');
  const head = git(dir, 'rev-parse', 'HEAD');

  assert.equal(runGuard(dir, head, lastSuccessfulDeployment).status, 0);
});

test('runtime API changes continue Vercel deployment', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'api', 'app.js'), 'export default 2;\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'runtime');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(runGuard(dir, head, lastSuccessfulDeployment).status, 1);
});

test('unknown root paths fail safe and build', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'new-runtime-entry.js'), 'export default 1;\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'unknown root');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(runGuard(dir, head, lastSuccessfulDeployment).status, 1);
});

test('unavailable previous successful deployment fails safe and builds', () => {
  const dir = setupRepo();
  fs.writeFileSync(path.join(dir, 'test', 'new.test.mjs'), 'export {};\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'test only');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(runGuard(dir, head, '0000000000000000000000000000000000000001').status, 1);
});

test('commit without an available parent fails safe and builds', () => {
  const dir = setupRepo();
  const rootCommit = git(dir, 'rev-parse', 'HEAD');
  assert.equal(runGuard(dir, rootCommit).status, 1);
});
