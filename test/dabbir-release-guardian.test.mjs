import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const buildGate=fs.readFileSync(new URL('../scripts/vercel-build-gate.mjs',import.meta.url),'utf8');
const guardian=fs.readFileSync(new URL('../.github/workflows/dabbir-release-guardian.yml',import.meta.url),'utf8');
const lineage=fs.readFileSync(new URL('../.github/workflows/dabbir-main-lineage-guard.yml',import.meta.url),'utf8');

test('Vercel build gate fails closed on syntax, dependency audit, and full tests',()=>{
  assert.match(buildGate,/v4-fail-closed/);
  assert.match(buildGate,/runNpm\(\['run','check:syntax'\],'syntax'\)/);
  assert.match(buildGate,/runNpm\(\['run','audit:prod'\],'dependency-audit'\)/);
  assert.match(buildGate,/runNpm\(\['test'\],'test-suite'\)/);
  assert.match(buildGate,/process\.exit\(exitCode\)/);
});

test('release guardian creates a governed rollback PR without bypassing protected main',()=>{
  for(const workflow of [
    'DABBIR CI',
    'DABBIR Mobile CI',
    'DABBIR Protected Live Smoke',
    'DABBIR AI Full Customer Journey',
    'DABBIR Auth Production Guard',
    'DABBIR Main Lineage Guard',
  ]) assert.ok(guardian.includes(`- ${workflow}`));

  assert.match(guardian,/permissions:[\s\S]*contents: write[\s\S]*pull-requests: write/);
  assert.match(guardian,/current_sha=.*origin\/main/);
  assert.match(guardian,/current_sha.*FAILED_SHA/);
  assert.match(guardian,/revert\\\(guardian\\\):/);
  assert.match(guardian,/branch="guardian\/revert-\$\{short_sha\}"/);
  assert.match(guardian,/git ls-remote --exit-code --heads origin "\$branch"/);
  assert.match(guardian,/duplicate rollback suppressed/);
  assert.match(guardian,/git revert/);
  assert.match(guardian,/git push origin HEAD:"\$branch"/);
  assert.match(guardian,/gh pr create/);
  assert.match(guardian,/--base main/);
  assert.match(guardian,/--head "\$branch"/);
  assert.match(guardian,/Governed rollback PR created/);
  assert.match(guardian,/gh pr merge "\$pr_url" --auto --squash/);
  assert.match(guardian,/Auto-merge unavailable; rollback PR remains governed and open/);
  assert.doesNotMatch(guardian,/git push origin HEAD:main/);
});

test('main lineage guard requires a merged PR and only exempts Guardian rollback commits',()=>{
  assert.match(lineage,/name: DABBIR Main Lineage Guard/);
  assert.match(lineage,/push:[\s\S]*branches: \[main\]/);
  assert.match(lineage,/pull-requests: read/);
  assert.match(lineage,/commits\/\$\{HEAD_SHA\}\/pulls/);
  assert.match(lineage,/\.base\.ref == "main" and \.merged_at != null/);
  assert.match(lineage,/revert\\\(guardian\\\):/);
  assert.match(lineage,/Direct or ungoverned push to main detected/);
});
