import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260903212500_barman_truth_repair_v8.sql',import.meta.url),'utf8');

test('legacy self-asserted evidence is preserved but demoted from trust',()=>{
  assert.match(sql,/LEGACY_SELF_ASSERTED_EVIDENCE_CANNOT_SUPPORT_VERIFIED_STATE/);
  assert.match(sql,/original_verified/);
  assert.match(sql,/verified=false/);
  assert.match(sql,/verified_by=null/);
  assert.match(sql,/verified_at=null/);
  assert.doesNotMatch(sql,/delete\s+from\s+dabbir_private\.executive_evidence/i);
});

test('legacy task states cannot remain done pending queued',()=>{
  assert.match(sql,/where status='DONE'\s+and verification_status='PENDING'/i);
  assert.match(sql,/status='BLOCKED'/);
  assert.match(sql,/orchestration_state='BLOCKED'/);
  assert.match(sql,/verification_status='FAILED'/);
  assert.match(sql,/LEGACY_PRE_HARDENING_RESULT_HAS_NO_INDEPENDENT_VERIFICATION/);
  assert.match(sql,/status='CANCELLED'/);
  assert.match(sql,/verification_status='NOT_APPLICABLE'/);
});

test('retired legacy Vercel runtime no longer counts as broken',()=>{
  assert.match(sql,/'RETIRED'::text/);
  assert.match(sql,/integration_key='vercel_barman_live_ceo'/);
  assert.match(sql,/REPLACED_BY_DABBIR_CANONICAL_RUNTIME/);
  assert.match(sql,/replacement_vercel_project_id/);
  assert.match(sql,/replacement_supabase_project_ref/);
});

test('health cannot report healthy while partial integrations or weak truth remain',()=>{
  assert.match(sql,/v_partial>0/);
  assert.match(sql,/v_weak>0/);
  assert.match(sql,/v_pending_verify>0/);
  assert.match(sql,/legacy_untrusted_evidence/);
  assert.match(sql,/retired_integrations/);
  assert.match(sql,/revoke all on function public\.barman_executive_self_diagnostic_v1\(\) from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.barman_executive_self_diagnostic_v1\(\) to service_role/i);
});
