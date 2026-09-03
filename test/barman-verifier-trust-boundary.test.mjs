import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260903204500_barman_true_ceo_verifier_trust_boundary_v6.sql',import.meta.url),'utf8');

test('executor evidence can never self-promote to independent verification',()=>{
  assert.match(migration,/EXECUTOR_EVIDENCE_IS_UNTRUSTED/);
  assert.match(migration,/executor_claimed_verified/);
  assert.match(migration,/trust_boundary',\s*'EXECUTOR_UNVERIFIED'/);
  assert.match(migration,/\n\s*false,\n\s*left\(coalesce\(nullif\(v_item#>>'\{details,produced_by\}'/);
  assert.match(migration,/when 'DONE' then 'INDEPENDENT_REQUIRED'/);
  assert.match(migration,/when 'DONE' then 'VERIFYING'/);
  assert.match(migration,/'trusted_evidence_count',0/);
  assert.doesNotMatch(migration,/v_verified\s*:=\s*coalesce\(\(v_item->>'verified'\)::boolean/);
  assert.doesNotMatch(migration,/v_method\s*:=\s*upper\(coalesce\(v_item#>>'\{details,verification_method\}'/);
});

test('only the dedicated verifier can promote a finished command',()=>{
  assert.match(migration,/COMMAND_NOT_AWAITING_VERIFICATION/);
  assert.match(migration,/EXECUTOR_CANNOT_VERIFY_OWN_COMMAND/);
  assert.match(migration,/EXECUTOR_EVIDENCE_REQUIRED_BEFORE_VERIFICATION/);
  assert.match(migration,/verification_status='VERIFIED',orchestration_state='COMPLETED'/);
  assert.match(migration,/trust_boundary','INDEPENDENT_VERIFIER'/);
});

test('privileged verifier RPCs remain server-only',()=>{
  for(const role of ['public','anon','authenticated']){
    assert.match(migration,new RegExp(`revoke all on function public\\.barman_executive_finalize_v1\\([^;]+from public, anon, authenticated`,'i'));
    assert.match(migration,new RegExp(`revoke all on function public\\.barman_executive_verify_command_v1\\([^;]+from public, anon, authenticated`,'i'));
    assert.ok(role);
  }
  assert.match(migration,/grant execute on function public\.barman_executive_finalize_v1[^;]+to service_role/i);
  assert.match(migration,/grant execute on function public\.barman_executive_verify_command_v1[^;]+to service_role/i);
});
