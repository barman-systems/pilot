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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dabbir-ipad-vercel-ignore-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'dabbir-ci@example.invalid');
  git(dir, 'config', 'user.name', 'DABBIR CI');
  fs.copyFileSync(sourceScript, path.join(dir, 'vercel-ignore-if-unaffected.sh'));
  fs.writeFileSync(path.join(dir, 'README.md'), 'base\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'base');
  return dir;
}

function commitPath(dir, relativePath, content) {
  const target = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', `change ${relativePath}`);
  return git(dir, 'rev-parse', 'HEAD');
}

function runGuard(dir, head, baseline) {
  return spawnSync('bash', ['vercel-ignore-if-unaffected.sh'], {
    cwd: dir,
    env: {
      ...process.env,
      VERCEL_GIT_COMMIT_SHA: head,
      VERCEL_GIT_PREVIOUS_SHA: baseline,
      VERCEL_GIT_COMMIT_REF: 'main',
    },
    encoding: 'utf8',
  });
}

test('every iPad exact-Production QA contract path forces Vercel deployment on main', () => {
  const contractPaths = [
    '.github/workflows/dabbir-ipad-webkit-production.yml',
    'test/run-ai-full-customer-journey-ipad.mjs',
    'test/dabbir-ipad-webkit-production-contract.test.mjs',
  ];

  for (const relativePath of contractPaths) {
    const dir = setupRepo();
    const baseline = git(dir, 'rev-parse', 'HEAD');
    const content = relativePath.endsWith('.yml') ? 'name: ipad exact production\n' : 'export {};\n';
    const head = commitPath(dir, relativePath, content);
    const result = runGuard(dir, head, baseline);
    assert.equal(result.status, 1, `${relativePath}: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Exact-SHA Production verification contract changed; deploy exact SHA for truthful release evidence/);
  }
});
