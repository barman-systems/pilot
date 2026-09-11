import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mapPath=fileURLToPath(new URL('../docs/architecture/execution-writer-map-v1.json',import.meta.url));
const map=JSON.parse(readFileSync(mapPath,'utf8'));
const writers=new Map(map.writers.map(row=>[row.id,row]));

const byOperation=operation=>map.writers.filter(row=>String(row.operation).split('_').includes(operation)||row.operation===operation);

test('execution writer map is evidence only and preserves hard safety invariants',()=>{
  assert.equal(map.status,'PARTIALLY_VERIFIED');
  assert.equal(map.hard_invariants.llm_is_authority,false);
  assert.equal(map.hard_invariants.channel_is_business_logic_owner,false);
  assert.equal(map.hard_invariants.provider_sync_is_business_rule_owner,false);
  assert.equal(map.hard_invariants.hard_delete_booking_allowed,false);
  assert.equal(map.hard_invariants.unproven_writer_deletion_allowed,false);
  assert.equal(map.hard_invariants.rls_weakening_allowed,false);
  assert.equal(map.hard_invariants.confirmation_gate_weakening_allowed,false);
  assert.equal(map.hard_invariants.cas_or_idempotency_weakening_allowed,false);
});

test('new execution DDL remains fail-closed while live migration history is incomplete',()=>{
  assert.equal(map.database_lineage.state,'DEFINITION_PRESENT_HISTORY_MISSING');
  assert.equal(map.database_lineage.missing_history_version,'20260911184500');
  assert.equal(map.database_lineage.new_execution_ddl_authorized,false);
  assert.equal(map.hard_invariants.new_execution_ddl_before_lineage_reconciliation_allowed,false);
  assert.equal(map.database_lineage.live_definition_markers['public.barman_executive_claim_v1'].has_decision_gate,true);
  assert.equal(map.database_lineage.live_definition_markers['public.barman_executive_verify_command_v1'].has_independent_verifier_gate,true);
});

test('BOOK remains explicitly multi-writer instead of pretending consolidation already happened',()=>{
  assert.equal(map.operation_summary.BOOK,'MULTIPLE_ACTIVE_WRITERS');
  for(const id of [
    'api.branch_operations.create_appointment',
    'api.adaptive_appointment.create',
    'sql.owner_activity_booking_v1',
    'sql.whatsapp_ai_create_booking',
    'sql.salon_quick_book',
    'sql.salon_quick_book_idempotent',
  ]){
    assert.ok(writers.has(id),id);
    assert.equal(writers.get(id).classification,'AUTHORITY',id);
  }
  assert.equal(writers.get('sql.semantic_execute_v2').classification,'VALIDATOR');
  assert.match(writers.get('sql.semantic_execute_v2').consolidation_action,/NOT_DOMAIN_MUTATION_OWNER/);
});

test('reschedule and cancel maps preserve separate actor adapters around future canonical mutations',()=>{
  assert.equal(map.operation_summary.RESCHEDULE,'MULTIPLE_ACTIVE_WRITERS');
  assert.equal(map.operation_summary.CANCEL,'MULTIPLE_ACTIVE_WRITERS');
  for(const id of [
    'api.appointment_management.update',
    'sql.whatsapp_ai_reschedule_booking',
    'sql.salon_rebook',
    'api.calendar_sync.provider_reconcile',
  ])assert.ok(writers.has(id),id);
  for(const id of [
    'api.appointment_management.cancel',
    'sql.whatsapp_ai_cancel_booking',
    'sql.salon_transition_appointment',
    'api.calendar_sync.provider_reconcile',
  ])assert.ok(writers.has(id),id);
  assert.match(map.target_architecture.prohibited_shortcut,/SECURITY DEFINER God Function/);
});

test('handoff is modeled as a state machine with valid transitions, not collapsed into one function',()=>{
  assert.equal(map.operation_summary.HANDOFF,'STATE_MACHINE_WITH_MULTIPLE_VALID_TRANSITIONS');
  for(const id of [
    'sql.whatsapp_ai_handoff',
    'sql.create_handoff',
    'sql.claim_handoff',
    'sql.takeover_conversation',
    'sql.resolve_handoff',
    'sql.return_conversation_to_ai',
    'sql.return_handoff_to_ai',
    'sql.send_human_message',
  ])assert.ok(writers.has(id),id);
  assert.match(writers.get('sql.return_handoff_to_ai').consolidation_action,/REVIEW_OVERLAP/);
});

test('all live appointment triggers remain classified and no trigger-removal authority is implied',()=>{
  assert.equal(map.appointment_triggers.length,16);
  const names=new Set(map.appointment_triggers.map(row=>row.name));
  for(const required of [
    'dabbir_activity_booking_invariant_v1',
    'dabbir_appointment_calendar_conflict_guard',
    'dabbir_appointments_branch_guard',
    'dabbir_appointments_branch_resource_guard',
    'dabbir_external_booking_confirmation_gate',
    'zz_dabbir_appointment_calendar_outbox',
  ])assert.ok(names.has(required),required);
  assert.ok(map.appointment_triggers.some(row=>row.classification==='VALIDATOR'&&row.fail_closed===true));
  assert.ok(map.appointment_triggers.some(row=>row.classification==='SIDE_EFFECT'&&row.writes_other_state===true));
});

test('first surgical BOOK candidate is bounded to one direct adapter',()=>{
  assert.equal(map.next_single_slice.operation,'BOOK');
  assert.equal(map.next_single_slice.phase,'CONTRACT_DESIGN_AND_CALLER_MIGRATION_PLAN');
  assert.equal(map.next_single_slice.ddl,'BLOCKED_UNTIL_MIGRATION_HISTORY_RECONCILED');
  assert.equal(map.next_single_slice.first_candidate,'api.branch_operations.create_appointment');
  assert.match(map.next_single_slice.reason,/one caller/i);
});
