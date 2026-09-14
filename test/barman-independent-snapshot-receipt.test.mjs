import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const verifier=fs.readFileSync(new URL('../scripts/barman-independent-verifier.mjs',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../api/barman-independent-verifier.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260913182500_barman_independent_snapshot_receipt_v1.sql',import.meta.url),'utf8');

test('mutable snapshot totals are verified from immutable point-in-time receipt, not monotonic live counts',()=>{
  assert.match(verifier,/phase:'snapshot_receipt'/);
  assert.match(verifier,/SNAPSHOT_RECEIPT_REQUIRED/);
  assert.match(verifier,/SNAPSHOT_RECEIPT_EVIDENCE_MISMATCH/);
  assert.match(verifier,/SNAPSHOT_RECEIPT_VALUE_MISMATCH_/);
  assert.match(verifier,/IMMUTABLE_POSTGRES_SNAPSHOT_RECEIPT/);
  assert.doesNotMatch(verifier,/SNAPSHOT_METRIC_REGRESSED_/);
  assert.doesNotMatch(verifier,/now>=reported/);
});

test('broker exposes receipt only through existing GitHub OIDC verifier boundary',()=>{
  assert.match(broker,/phase==='snapshot_receipt'/);
  assert.match(broker,/SNAPSHOT_RECEIPT_ID_INVALID/);
  assert.match(broker,/barman_executive_read_snapshot_receipt_v1/);
  assert.match(broker,/verifyGithubOidc/);
  assert.match(broker,/EXPECTED_WORKFLOW/);
});

test('database captures and binds snapshot evidence before persistence',()=>{
  assert.match(migration,/create table if not exists dabbir_private\.executive_snapshot_receipts/i);
  assert.match(migration,/before insert on dabbir_private\.executive_evidence/i);
  assert.match(migration,/SNAPSHOT_EVIDENCE_CHANGED_BEFORE_PERSIST_/);
  assert.match(migration,/snapshot_receipt_id/);
  assert.match(migration,/evidence_id uuid not null unique/i);
  assert.match(migration,/revoke all on table dabbir_private\.executive_snapshot_receipts\s+from public, anon, authenticated, service_role/i);
  assert.match(migration,/revoke all on function dabbir_private\.barman_snapshot_metrics_v1\(\)\s+from public, anon, authenticated, service_role/i);
});

test('stale or legacy mismatch remains fail closed but cannot poison newer verifier work',()=>{
  assert.match(migration,/e\.created_at>=now\(\)-interval '30 minutes'/);
  assert.match(migration,/e\.details->>'snapshot_receipt_id'/);
  assert.match(migration,/c\.verification_status='INDEPENDENT_REQUIRED'/);
  assert.match(migration,/c\.orchestration_state='VERIFYING'/);
  assert.doesNotMatch(migration,/verification_status='VERIFIED'/i);
  assert.doesNotMatch(migration,/verification_status='FAILED'/i);
  assert.match(verifier,/INDEPENDENT_VERIFICATION_MISMATCH_UNPROMOTED/);
});
