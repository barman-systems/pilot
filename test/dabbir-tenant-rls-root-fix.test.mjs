import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const migration = await read('supabase/migrations/20260828043000_dabbir_active_membership_rls_root_fix_v1.sql');

test('canonical active-member helper fails closed for account and membership suspension/removal', () => {
  assert.match(migration, /create or replace function dabbir_private\.is_active_member/i);
  assert.match(migration, /dabbir_private\.account_active\(\)/i);
  assert.match(migration, /m\.status\s*=\s*'active'/i);
  assert.match(migration, /m\.suspended_at\s+is\s+null/i);
  assert.match(migration, /m\.removed_at\s+is\s+null/i);
});

test('tenant data policies route raw membership access through the canonical active-member gate', () => {
  const policies = [
    'dabbir_conversation_outcomes_member_select',
    'dabbir_customer_evidence_member_select',
    'dabbir_customer_identities_member_select',
    'dabbir_demo_events_member_all',
    'dabbir_event_inbox_member_select',
    'dabbir_inventory_member_all',
    'dabbir_message_batch_items_member_select',
    'dabbir_message_batches_member_select',
    'dabbir_orders_member_all',
    'dabbir_procedure_audit_member_select',
    'dabbir_procedure_runs_member_select',
    'dabbir_procedure_steps_member_select',
    'dabbir_products_member_all',
    'dabbir_quality_cases_member_select',
    'dabbir_quality_events_member_select',
    'dabbir_quality_regression_member_select',
    'dabbir_tasks_select',
  ];
  for (const policy of policies) {
    assert.match(migration, new RegExp(`alter policy ${policy}[\\s\\S]{0,220}is_active_member\\(business_id\\)`, 'i'), policy);
  }
});

test('owner/admin integration policies also inherit global account suspension semantics', () => {
  for (const policy of [
    'dabbir_billing_accounts_owner_select',
    'dabbir_cash_guardian_settings_owner_select',
    'dabbir_financial_coverage_owner_select',
    'dabbir_financial_evidence_owner_select',
    'dabbir_owner_modes_owner_update',
    'dabbir_owner_policy_versions_owner_select',
    'dabbir_whatsapp_connections_owner_select',
    'dabbir_whatsapp_connections_owner_update',
  ]) {
    assert.match(migration, new RegExp(`alter policy ${policy}[\\s\\S]{0,900}is_active_member\\(business_id\\)`, 'i'), policy);
  }
  assert.match(migration, /dabbir_platform_admins_select_self[\s\S]*account_active\(\)/i);
});
