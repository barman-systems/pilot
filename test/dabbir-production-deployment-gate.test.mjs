import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ignore = fs.readFileSync(new URL('../vercel-ignore-if-unaffected.sh', import.meta.url), 'utf8');
const gatePath = 'scripts/vercel-build-gate.mjs';
const gate = fs.readFileSync(new URL(`../${gatePath}`, import.meta.url), 'utf8');

test('Vercel uses the fail-closed DABBIR build gate without changing the Functions deployment contract', () => {
  assert.equal(pkg.scripts?.['vercel-build'], 'node scripts/build-dabbir-ui-bundles.mjs && node scripts/vercel-build-gate.mjs');
  assert.equal(pkg.scripts?.test, 'node --test test/*.test.mjs');
  const parse = spawnSync(process.execPath, ['--check', gatePath], { encoding: 'utf8' });
  assert.equal(parse.status, 0, parse.stderr || parse.stdout);
});

test('cached build evidence is scoped to deployment plus commit and written only after every fail-closed verification succeeds', () => {
  assert.match(gate, /VERCEL_DEPLOYMENT_ID/);
  assert.match(gate, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(gate, /const evidenceKey = `\$\{safeDeploymentId\}-\$\{safeSha\}`/);
  assert.match(gate, /dabbir-vercel-tests-passed-/);
  assert.match(gate, /runNpm\(\['run','check:syntax'\],'syntax'\)/);
  assert.match(gate, /runNpm\(\['run','audit:prod'\],'dependency-audit'\)/);
  assert.match(gate, /runNpm\(\['test'\],'test-suite'\)/);
  const testRun = gate.indexOf("runNpm(['test'],'test-suite')");
  const markerWrite = gate.indexOf('writeFileSync(marker');
  assert.ok(testRun >= 0 && markerWrite > testRun, 'success evidence must be written only after the final verification process');
  assert.match(gate, /DABBIR_BUILD_GATE_/);
});

test('failure cleanup cannot leave a stale success path', () => {
  assert.match(gate, /finally \{[\s\S]*closeSync\(lockFd\)[\s\S]*unlinkSync\(lock\)/);
  assert.match(gate, /process\.exit\(exitCode\)/);
  assert.doesNotMatch(gate, /if \(result\.status !== 0\) process\.exit/);
});

test('concurrent duplicate invocations fail closed without fabricating success evidence', () => {
  assert.match(gate, /openSync\(lock, 'wx'/);
  assert.match(gate, /verification lock disappeared without success evidence/);
  assert.match(gate, /timed out waiting for verified test evidence/);
  assert.match(gate, /if \(existsSync\(marker\)\)/);
});

test('runtime and package changes cannot be skipped by the Vercel ignore gate', () => {
  assert.match(ignore, /Runtime or unknown path changed/);
  assert.doesNotMatch(ignore, /package\.json\|/);
  assert.doesNotMatch(ignore, /package-lock\.json\|/);
});
