import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const contract=JSON.parse(fs.readFileSync('config/barman-integration-contract.json','utf8'));
const workflow=fs.readFileSync('.github/workflows/dabbir-bar12-readiness.yml','utf8');

test('integration contract declares the live release endpoint as runtime authority',()=>{
  const authority=contract.deployment.release_authority;
  assert.equal(authority?.kind,'LIVE_RELEASE_EVIDENCE_ENDPOINT');
  assert.equal(authority?.endpoint,'https://dabbir.bmalman.com/api/release-evidence');
  assert.equal(authority?.runtime_identity_must_be_read_live,true);
  assert.deepEqual(authority?.historical_snapshot_fields,[
    'verified_deployment_id','verified_deployment_state','verified_source_commit','verified_at'
  ]);
});

test('BAR-12 reads live release evidence instead of trusting historical verified snapshot fields',()=>{
  assert.match(workflow,/\/api\/release-evidence\?t=/);
  assert.match(workflow,/initial_sha="\$\(jq -r '\.commit_sha'/);
  assert.doesNotMatch(workflow,/verified_source_commit/);
  assert.doesNotMatch(workflow,/verified_deployment_id/);
});
