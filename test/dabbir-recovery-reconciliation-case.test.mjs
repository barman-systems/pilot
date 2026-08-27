import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [caseMigration, latestMigration, supportApi, reconcileUi, shell] = await Promise.all([
  read('supabase/migrations/20260827173750_dabbir_recovery_reconciliation_case_v1.sql'),
  read('supabase/migrations/20260827175203_dabbir_recovery_reconciliation_latest_preview_v2.sql'),
  read('api/platform-customer-support.js'),
  read('api/platform-recovery-reconciliation-ui.js'),
  read('api/app-recovery.js'),
]);

test('reconciliation support case is idempotent and service-role only', () => {
  assert.match(caseMigration, /source_key text/i);
  assert.match(caseMigration, /unique index[\s\S]*source_key/i);
  assert.match(caseMigration, /on conflict \(source_key\)[\s\S]*do nothing/i);
  assert.match(caseMigration, /DABBIR_RECOVERY_RECONCILIATION_NOT_REQUIRED/);
  assert.match(caseMigration, /No external provider action or partial recovery was executed/);
  assert.match(caseMigration, /revoke all on function public\.dabbir_platform_support_ensure_recovery_reconciliation[\s\S]*public,anon,authenticated/i);
  assert.match(caseMigration, /grant execute on function public\.dabbir_platform_support_ensure_recovery_reconciliation[\s\S]*service_role/i);
});

test('reconciliation is bound to the latest verified preview for the same admin customer and business', () => {
  assert.match(latestMigration, /a\.actor_user_id=p_actor_user_id/);
  assert.match(latestMigration, /a\.target_user_id=v_target/);
  assert.match(latestMigration, /a\.target_business_id=p_business_id/);
  assert.match(latestMigration, /a\.action='recovery_preview'/);
  assert.match(latestMigration, /interval '30 minutes'/);
  assert.match(latestMigration, /DABBIR_RECOVERY_PREVIEW_REQUIRED/);
  assert.match(latestMigration, /dabbir_platform_support_ensure_recovery_reconciliation/);
  assert.match(latestMigration, /set search_path = ''/i);
  assert.match(latestMigration, /revoke all on function public\.dabbir_platform_support_ensure_latest_recovery_reconciliation[\s\S]*public,anon,authenticated/i);
});

test('support API never trusts recovery target time from the browser', () => {
  assert.match(supportApi, /body\.action==='ensure_recovery_reconciliation'/);
  assert.match(supportApi, /dabbir_platform_support_ensure_latest_recovery_reconciliation/);
  const block = supportApi.match(/if\(body\.action==='ensure_recovery_reconciliation'\)[\s\S]*?\n    \}/)?.[0] || '';
  assert.doesNotMatch(block, /body\.target_at/);
  assert.doesNotMatch(block, /p_target_at/);
  assert.match(supportApi, /RECOVERY_PREVIEW_REQUIRED/);
});

test('blocked recovery UI opens reconciliation case without carrying target_at or applying recovery', () => {
  assert.match(reconcileUi, /pcRecoveryBlocked/);
  assert.match(reconcileUi, /ensure_recovery_reconciliation/);
  assert.match(reconcileUi, /customer_no:no,business_id:businessId/);
  assert.doesNotMatch(reconcileUi, /target_at/);
  assert.doesNotMatch(reconcileUi, /apply_recovery/);
  assert.doesNotMatch(reconcileUi, /stripe|whatsapp/i);
  assert.match(reconcileUi, /reconciliation\?\.created\?t\.created:t\.existing/);
  assert.match(reconcileUi, /pcSupport360/);
});

test('authoritative shell mounts reconciliation UI after customer support UI', () => {
  const support = shell.indexOf('/api/platform-customer-support-ui');
  const reconcile = shell.indexOf('/api/platform-recovery-reconciliation-ui');
  assert.ok(support >= 0);
  assert.ok(reconcile > support);
});
