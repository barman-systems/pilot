import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const buildGate=fs.readFileSync(new URL('../scripts/vercel-build-gate.mjs',import.meta.url),'utf8');
const guardian=fs.readFileSync(new URL('../.github/workflows/dabbir-release-guardian.yml',import.meta.url),'utf8');

test('Vercel build gate fails closed on syntax, dependency audit, and full tests',()=>{
  assert.match(buildGate,/v4-fail-closed/);
  assert.match(buildGate,/runNpm\(\['run','check:syntax'\],'syntax'\)/);
  assert.match(buildGate,/runNpm\(\['run','audit:prod'\],'dependency-audit'\)/);
  assert.match(buildGate,/runNpm\(\['test'\],'test-suite'\)/);
  assert.match(buildGate,/process\.exit\(exitCode\)/);
});

test('release guardian auto-reverts failed main heads without stale rollback or loops',()=>{
  for(const workflow of [
    'DABBIR CI',
    'DABBIR Mobile CI',
    'DABBIR Protected Live Smoke',
    'DABBIR AI Full Customer Journey',
    'DABBIR Auth Production Guard',
  ]) assert.ok(guardian.includes(`- ${workflow}`));

  assert.match(guardian,/permissions:[\s\S]*contents: write/);
  assert.match(guardian,/current_sha=.*origin\/main/);
  assert.match(guardian,/current_sha.*FAILED_SHA/);
  assert.match(guardian,/revert\\\(guardian\\\):/);
  assert.match(guardian,/git revert/);
  assert.match(guardian,/git push origin HEAD:main/);
});
