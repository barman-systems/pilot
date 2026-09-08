import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const sourceScript = path.resolve('vercel-ignore-if-unaffected.sh');
const journeyWorkflow = fs.readFileSync(path.resolve('.github/workflows/dabbir-ai-customer-journey.yml'), 'utf8');

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

function runGuard(cwd, current, previousDeployment = '', ref = 'main') {
  return spawnSync('bash', ['vercel-ignore-if-unaffected.sh'], {
    cwd,
    env: {
      ...process.env,
      VERCEL_GIT_COMMIT_SHA: current,
      VERCEL_GIT_PREVIOUS_SHA: previousDeployment,
      VERCEL_GIT_COMMIT_REF: ref,
    },
    encoding: 'utf8',
  });
}

function commitPath(dir, relativePath, content = 'export {};\n') {
  const target = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', `change ${relativePath}`);
  return git(dir, 'rev-parse', 'HEAD');
}

test('all non-main branches run the full Vercel verification gate even for test-only commits', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'test', 'new.test.mjs'), 'export {};\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'test only');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(runGuard(dir, head, lastSuccessfulDeployment, 'fix/runtime-proof').status, 1);
});

test('test-only changes on main skip Vercel deployment when no runtime drift exists since last success', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'test', 'new.test.mjs'), 'export {};\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'test only');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(runGuard(dir, head, lastSuccessfulDeployment).status, 0);
});

test('native mobile and App Store preflight changes on main reuse the last verified web runtime', () => {
  const paths = [
    'mobile/src/SubscriptionCard.tsx',
    'mobile/app.json',
    'scripts/dabbir-app-store-preflight.mjs',
  ];
  for (const relativePath of paths) {
    const dir = setupRepo();
    const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
    const head = commitPath(dir, relativePath, 'native-only\n');
    const result = runGuard(dir, head, lastSuccessfulDeployment);
    assert.equal(result.status, 0, `${relativePath}: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Only explicitly non-runtime DABBIR paths changed/);
  }
});

test('unlisted scripts remain fail-safe and force a web deployment', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
  const head = commitPath(dir, 'scripts/unknown-release-hook.mjs', 'export {};\n');
  const result = runGuard(dir, head, lastSuccessfulDeployment);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Runtime or unknown path changed/);
});

test('customer journey tracks changes to the web-runtime classification contract', () => {
  assert.match(journeyWorkflow, /- 'vercel-ignore-if-unaffected\.sh'/);
});

test('protected Production smoke runner changes on main force exact-SHA Vercel deployment', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'test', 'dabbir-protected-live-smoke.mjs'), 'export const smoke = 1;\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'protected smoke contract');
  const head = git(dir, 'rev-parse', 'HEAD');
  const result = runGuard(dir, head, lastSuccessfulDeployment);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Exact-SHA Production verification contract changed; deploy exact SHA for truthful release evidence/);
});

test('protected Production smoke workflow changes on main force exact-SHA Vercel deployment', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'dabbir-protected-live-smoke.yml'), 'name: protected smoke\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'protected smoke workflow contract');
  const head = git(dir, 'rev-parse', 'HEAD');
  const result = runGuard(dir, head, lastSuccessfulDeployment);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Exact-SHA Production verification contract changed; deploy exact SHA for truthful release evidence/);
});

test('every ignored-path trigger of the canonical exact-SHA customer journey forces a Production deployment', () => {
  const contractPaths = [
    '.github/workflows/dabbir-ai-customer-journey.yml',
    'test/ai-full-customer-journey-v2.mjs',
    'test/dabbir-protected-full-journey-preload.mjs',
    'test/dabbir-protected-journey-access.test.mjs',
    'test/dabbir-authorized-journey-workflow.test.mjs',
    'test/support/dabbir-protected-journey-access.mjs',
    'test/dabbir-capacity-load.mjs',
    'test/dabbir-activity-regression.test.mjs',
  ];

  for (const relativePath of contractPaths) {
    const dir = setupRepo();
    const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
    const head = commitPath(dir, relativePath, relativePath.endsWith('.yml') ? 'name: journey\n' : 'export {};\n');
    const result = runGuard(dir, head, lastSuccessfulDeployment);
    assert.equal(result.status, 1, `${relativePath}: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Exact-SHA Production verification contract changed; deploy exact SHA for truthful release evidence/);
  }
});

test('Supabase migrations on main force Vercel deployment so production SHA cannot drift', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
  fs.mkdirSync(path.join(dir, 'supabase', 'migrations'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'supabase', 'migrations', '20260828000000_test.sql'), 'select 1;\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'database migration');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(runGuard(dir, head, lastSuccessfulDeployment).status, 1);
});

test('db paths on main are production-affecting and force Vercel deployment', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');
  fs.mkdirSync(path.join(dir, 'db'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'db', 'schema.sql'), 'select 1;\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'database schema');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(runGuard(dir, head, lastSuccessfulDeployment).status, 1);
});

test('failed or unverified runtime change on main cannot be hidden by a later test-only commit', () => {
  const dir = setupRepo();
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');

  fs.writeFileSync(path.join(dir, 'api', 'app.js'), 'export default 2;\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'runtime change not yet verified');

  fs.writeFileSync(path.join(dir, 'test', 'later.test.mjs'), 'export {};\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'test-only repair');
  const head = git(dir, 'rev-parse', 'HEAD');

  assert.equal(runGuard(dir, head, lastSuccessfulDeployment).status, 1);
});

test('test-only follow-up on main may skip after the runtime commit itself is the last successful deployment', () => {
  const dir = setupRepo();
  fs.writeFileSync(path.join(dir, 'api', 'app.js'), 'export default 2;\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'verified runtime');
  const lastSuccessfulDeployment = git(dir, 'rev-parse', 'HEAD');

  fs.writeFileSync(path.join(dir, 'test', 'later.test.mjs'), 'export {};\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'test-only follow-up');
  const head = git(dir, 'rev-parse', 'HEAD');

  assert.equal(runGuard(dir, head, lastSuccessfulDeployment).status, 0);
});

test('runtime API changes on main continue Vercel deployment', () => {
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
