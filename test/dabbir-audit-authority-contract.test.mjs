import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

const contract = read('docs/audits/AUDIT_AUTHORITY_CONTRACT.md');
const releaseAuthorityTest = read('test/dabbir-live-release-authority.test.mjs');
const advisorGate = read('scripts/dabbir-supabase-advisors-gate.mjs');

test('audit contract keeps live truth, historical snapshots, and baselines separate', () => {
  assert.match(contract, /LIVE_TRUTH != AUDIT_SNAPSHOT != BASELINE/);
  assert.match(contract, /Historical audit files are never a substitute for current Live Truth/);
  assert.match(contract, /baseline is intentionally mutable through reviewed change/i);
  assert.match(contract, /adds no new runtime authority/i);
});

test('historical deployment snapshots cannot replace live release authority', () => {
  assert.match(releaseAuthorityTest, /LIVE_RELEASE_EVIDENCE_ENDPOINT/);
  assert.match(releaseAuthorityTest, /historical_snapshot_fields/);
  assert.match(releaseAuthorityTest, /doesNotMatch\(workflow,\/verified_source_commit\//);
  assert.match(releaseAuthorityTest, /doesNotMatch\(workflow,\/verified_deployment_id\//);
});

test('Supabase baseline remains a comparison input to a live advisor read', () => {
  assert.match(advisorGate, /fetchAdvisor\('security'\)/);
  assert.match(advisorGate, /fetchAdvisor\('performance'\)/);
  assert.match(advisorGate, /SUPABASE_ADVISOR_BASELINE_MISSING/);
  assert.match(advisorGate, /new WARN\/ERROR findings/);
});
