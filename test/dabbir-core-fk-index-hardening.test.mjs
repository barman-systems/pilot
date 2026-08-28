import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20260828052000_dabbir_core_fk_index_hardening_v1.sql';
const sql=fs.readFileSync(migrationPath,'utf8');

const required=[
  ['dabbir_private.recovery_restore_events','journal_event_id'],
  ['dabbir_private.recovery_runtime_context','recovery_case_id'],
  ['public.account_access_state','reinstated_by'],
  ['public.account_access_state','suspended_by'],
  ['public.dabbir_access_audit','actor_user_id'],
  ['public.dabbir_access_audit','invitation_id'],
  ['public.dabbir_access_audit','target_user_id'],
  ['public.dabbir_employee_invitations','accepted_by'],
  ['public.dabbir_employee_invitations','invited_by'],
  ['public.dabbir_memberships','invited_by'],
  ['public.dabbir_conversation_outcomes','conversation_id'],
  ['public.dabbir_conversation_outcomes','customer_id'],
  ['public.dabbir_customer_evidence','conversation_id'],
  ['public.dabbir_customer_evidence','customer_id'],
  ['public.dabbir_customer_evidence','message_id'],
  ['public.dabbir_event_inbox','customer_id'],
  ['public.dabbir_followups','conversation_id'],
  ['public.dabbir_handoffs','assigned_user_id'],
  ['public.dabbir_messages','sender_user_id'],
  ['public.dabbir_message_batch_items','message_id'],
  ['public.dabbir_message_batches','conversation_id'],
  ['public.dabbir_message_batches','customer_id'],
  ['public.dabbir_owner_decision_observations','owner_user_id'],
  ['public.dabbir_owner_policy_audit','actor_user_id'],
  ['public.dabbir_owner_policy_audit','policy_id'],
  ['public.dabbir_owner_policy_versions','owner_user_id'],
  ['public.dabbir_privacy_audit','privacy_request_id'],
  ['public.dabbir_procedure_audit','business_id'],
  ['public.dabbir_procedure_audit','step_id'],
  ['public.dabbir_procedure_definitions','created_by'],
  ['public.dabbir_procedure_runs','owner_approved_by'],
  ['public.dabbir_quality_events','conversation_id'],
  ['public.dabbir_quality_regression_cases','business_id'],
  ['public.dabbir_retention_policies','data_category'],
  ['public.dabbir_verification_challenges','customer_id'],
  ['public.dabbir_verification_challenges','identity_id'],
];

test('migration covers every currently confirmed DABBIR-only unindexed foreign key',()=>{
  const normalized=sql.replace(/\s+/g,' ');
  for(const [table,column] of required){
    const escapedTable=table.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const escapedColumn=column.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(normalized,new RegExp(`create index if not exists [a-z0-9_]+ on ${escapedTable}\\(${escapedColumn}\\)`));
  }
  assert.equal((sql.match(/create index if not exists/gi)||[]).length,required.length);
});

test('core FK hardening is additive and cannot change data or authorization',()=>{
  assert.doesNotMatch(sql,/\b(drop|delete|update|insert|truncate)\b/i);
  assert.doesNotMatch(sql,/\b(grant|revoke)\b/i);
  assert.doesNotMatch(sql,/\b(enable|disable|force)\s+row\s+level\s+security\b/i);
  assert.doesNotMatch(sql,/create\s+(or\s+replace\s+)?function/i);
});
