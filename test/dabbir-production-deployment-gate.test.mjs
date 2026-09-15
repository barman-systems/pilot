import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const ignore = fs.readFileSync(new URL('../vercel-ignore-if-unaffected.sh', import.meta.url), 'utf8');
const gatePath = 'scripts/vercel-build-gate.mjs';
const gate = fs.readFileSync(new URL(`../${gatePath}`, import.meta.url), 'utf8');
const ci = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('Vercel uses one explicit non-recursive DABBIR build command', () => {
  assert.equal(vercel.buildCommand, 'npm run dabbir:build');
  assert.equal(pkg.scripts?.['dabbir:build'], 'node scripts/build-dabbir-ui-bundles.mjs && node scripts/vercel-build-gate.mjs');
  assert.equal(pkg.scripts?.['vercel-build'], undefined, 'reserved vercel-build hook must not coexist with explicit buildCommand');
  assert.equal(pkg.scripts?.test, 'node --test test/*.test.mjs');
  const parse = spawnSync(process.execPath, ['--check', gatePath], { encoding: 'utf8' });
  assert.equal(parse.status, 0, parse.stderr || parse.stdout);
});

test('GitHub CI owns syntax, dependency audit, and full logical tests', () => {
  assert.match(ci, /run: npm run check:syntax/);
  assert.match(ci, /run: npm run audit:prod/);
  assert.match(ci, /run: npm test/);
});

test('Vercel gate verifies build environment without duplicating executable logical-suite commands', () => {
  assert.match(gate, /v5-vercel-build-only/);
  assert.match(gate, /runNpm\(\['run', 'check:syntax'\], 'vercel-build-syntax'\)/);
  assert.doesNotMatch(gate, /runNpm\(\['run',\s*'audit:prod'\]/);
  assert.doesNotMatch(gate, /runNpm\(\['test'\]/);
  assert.match(gate, /DABBIR_BUILD_GATE_/);
});

test('PR validation is latest-head-wins while main runs are never canceled', () => {
  assert.match(ci, /concurrency:/);
  assert.match(ci, /github\.event\.pull_request\.number \|\| github\.ref/);
  assert.match(ci, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(ci, /migration-deploy:[\s\S]*github\.event_name == 'push'[\s\S]*refs\/heads\/main/);
});

test('runtime and package changes cannot be skipped by the Vercel ignore gate', () => {
  assert.match(ignore, /Runtime or unknown path changed/);
  assert.doesNotMatch(ignore, /package\.json\|/);
  assert.doesNotMatch(ignore, /package-lock\.json\|/);
});
