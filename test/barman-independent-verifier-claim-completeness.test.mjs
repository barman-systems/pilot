import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260913182600_barman_independent_snapshot_claim_completeness_v1.sql',import.meta.url),'utf8');

test('claim requires the complete unverified evidence set to be fresh and verifiable',()=>{
  assert.match(sql,/and not exists\s*\(\s*select 1\s*from dabbir_private\.executive_evidence e/si);
  assert.match(sql,/e\.created_at<now\(\)-interval '30 minutes'/);
  assert.match(sql,/e\.reference='barman-executive-snapshot-v1'/);
  assert.match(sql,/e\.details->>'snapshot_receipt_id'/);
  assert.match(sql,/complete_evidence_set',true/);
});

test('selected action returns every unverified evidence row instead of filtering a convenient subset',()=>{
  const aggregate=/from dabbir_private\.executive_evidence e\s*where e\.action_id=v_action_id\s*and e\.verified=false\s*;/si;
  assert.match(sql,aggregate);
  assert.doesNotMatch(sql,/where e\.action_id=v_action_id[\s\S]{0,240}snapshot_receipt_id/);
});

test('stale evidence remains independent-required and is never auto-promoted or failed',()=>{
  assert.match(sql,/c\.verification_status='INDEPENDENT_REQUIRED'/);
  assert.match(sql,/c\.orchestration_state='VERIFYING'/);
  assert.doesNotMatch(sql,/verification_status\s*=\s*'VERIFIED'/i);
  assert.doesNotMatch(sql,/verification_status\s*=\s*'FAILED'/i);
});
