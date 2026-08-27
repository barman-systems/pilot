import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [migration, api, ui] = await Promise.all([
  read('supabase/migrations/20260827172122_dabbir_recovery_center_safety_v2.sql'),
  read('api/platform-customers.js'),
  read('api/platform-customers-ui.js'),
]);

test('recovery is fail-closed by default and only explicit safe tables auto-restore', () => {
  assert.match(migration, /restore_mode text not null default 'reconcile_only'/i);
  assert.match(migration, /restore_mode in \('auto_restore','reconcile_only'\)/i);
  assert.match(migration, /dabbir_inventory/);
  assert.match(migration, /dabbir_products/);
  assert.match(migration, /dabbir_customer_memory/);
});

test('financial, communication, workflow and privacy state require reconciliation', () => {
  assert.match(migration, /table_name ~ '\(payment\|offer\)'/i);
  assert.match(migration, /table_name ~ '\(message\|whatsapp\|followup\|channel\)'/i);
  assert.match(migration, /table_name ~ '\(privacy\|consent\|retention\)'/i);
  assert.match(migration, /table_name ~ '\(procedure\|task\|handoff\|invitation\|verification\)'/i);
  assert.match(migration, /DABBIR_RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED/);
});

test('preview exposes automatic versus reconciliation impact', () => {
  assert.match(migration, /auto_restore_events/);
  assert.match(migration, /reconciliation_events/);
  assert.match(migration, /auto_restore_ready/);
  assert.match(migration, /reconciliation_tables/);
});

test('row mutation helpers refuse reconcile-only tables', () => {
  assert.match(migration, /recovery_upsert_row[\s\S]*restore_mode<>'auto_restore'[\s\S]*DABBIR_RECOVERY_RECONCILE_ONLY_TABLE/i);
  assert.match(migration, /recovery_delete_row[\s\S]*restore_mode<>'auto_restore'[\s\S]*DABBIR_RECOVERY_RECONCILE_ONLY_TABLE/i);
  assert.match(migration, /recovery_apply_case[\s\S]*v_blocked>0[\s\S]*DABBIR_RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED/i);
});

test('recovery case creation and apply require a suspended DABBIR account', () => {
  assert.match(migration, /platform_assert_recovery_frozen/);
  assert.match(migration, /DABBIR_RECOVERY_ACCOUNT_MUST_BE_SUSPENDED/);
  assert.match(migration, /dabbir_platform_recovery_open[\s\S]*platform_assert_recovery_frozen/i);
  assert.match(migration, /dabbir_platform_recovery_apply[\s\S]*platform_assert_recovery_frozen/i);
});

test('recovery RPCs remain service-role-only', () => {
  for (const fn of ['dabbir_platform_recovery_preview','dabbir_platform_recovery_open','dabbir_platform_recovery_apply']) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*from public,anon,authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*to service_role`, 'i'));
  }
});

test('API maps safety blocks explicitly for the admin UI', () => {
  assert.match(api, /RECOVERY_ACCOUNT_MUST_BE_SUSPENDED/);
  assert.match(api, /RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED/);
  assert.match(api, /requireSameOrigin\(req\)/);
});

test('Customer 360 UI hides apply path until preview is safe and account is frozen', () => {
  assert.match(ui, /auto_restore_ready/);
  assert.match(ui, /reconciliation_events/);
  assert.match(ui, /RECOVERY_ACCOUNT_MUST_BE_SUSPENDED/);
  assert.match(ui, /RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED/);
  assert.match(ui, /const canPrepare=preview && !blocked && accountSuspended/);
  assert.match(ui, /x-dabbir-platform-customer-admin-ui','v3'/);
});
