import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const baselinePath=fileURLToPath(new URL('../docs/architecture/database-authority-baseline-v2.json',import.meta.url));
const baseline=JSON.parse(readFileSync(baselinePath,'utf8'));

test('database authority baseline is read-only evidence, never deletion authority',()=>{
  assert.equal(baseline.collection_mode,'READ_ONLY');
  assert.equal(baseline.production_schema_lineage.rollback_or_delete_authorized,false);
  assert.equal(baseline.booking_authority_candidates.deletion_authorized,false);
  assert.equal(baseline.hard_invariants.unproven_legacy_deletion_allowed,false);
  assert.equal(baseline.hard_invariants.mass_security_definer_conversion_allowed,false);
  assert.equal(baseline.hard_invariants.mass_trigger_removal_allowed,false);
  assert.equal(baseline.hard_invariants.rls_weakening_allowed,false);
});

test('database authority baseline preserves the verified tenant and security surface',()=>{
  assert.equal(baseline.live_metrics.public_tables,140);
  assert.equal(baseline.live_metrics.public_tables_rls_enabled,140);
  assert.equal(baseline.live_metrics.public_tables_force_rls,90);
  assert.equal(baseline.authenticated_security_definer_advisories.length,9);
  assert.equal(baseline.advisor_observation.all_nine_are_security_definer,true);
  assert.equal(baseline.advisor_observation.all_nine_have_authenticated_execute,true);
});

test('database authority baseline records live schema lineage drift instead of hiding it',()=>{
  assert.equal(baseline.production_schema_lineage.state,'AHEAD_OF_MERGED_MAIN');
  assert.equal(baseline.production_schema_lineage.tracking_issue,731);
  assert.equal(baseline.production_schema_lineage.applied_but_not_merged_migrations.length,3);
  assert.equal(baseline.live_metrics.dabbir_scoped_function_signatures,445);
  assert.equal(baseline.live_metrics.app_function_signatures,466);
});

test('authority classification cannot treat shared writes or unknown callers as deletion proof',()=>{
  const allowed=new Set(['AUTHORITY','VALIDATOR','HELPER','SIDE_EFFECT','LEGACY','UNKNOWN']);
  assert.deepEqual(new Set(baseline.authority_classification_contract.allowed),allowed);
  assert.equal(baseline.authority_classification_contract.legacy_requires_zero_callers_proof,true);
  assert.equal(baseline.authority_classification_contract.unknown_requires_investigation,true);
  assert.equal(baseline.authority_classification_contract.shared_table_write_does_not_prove_duplicate_authority,true);
  for(const required of ['dynamic SQL','unqualified SQL calls','remote Edge-function callers not represented by repository AST']){
    assert.ok(baseline.blind_spots.includes(required),required);
  }
});

test('booking map is explicit that canonical consolidation is incomplete',()=>{
  assert.equal(baseline.booking_authority_candidates.current_state,'MULTIPLE_OPERATION_SPECIFIC_WRITERS');
  assert.ok(baseline.booking_authority_candidates.confirmed_existing_entrypoints.includes('public.dabbir_owner_activity_booking_v1'));
  assert.ok(baseline.booking_authority_candidates.confirmed_existing_entrypoints.includes('public.dabbir_semantic_execute_v2'));
  assert.equal(baseline.hard_invariants.llm_is_authority,false);
  assert.equal(baseline.hard_invariants.channel_is_business_logic_owner,false);
});
