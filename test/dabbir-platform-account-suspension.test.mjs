import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [migration, api, ui, authCore, session] = await Promise.all([
  read('supabase/migrations/20260827152800_dabbir_account_suspension_v1.sql'),
  read('api/platform-customers.js'),
  read('api/platform-customers-ui.js'),
  read('api/_auth-core.js'),
  read('api/auth/session.js'),
]);

test('platform suspension is DABBIR-only and does not mutate Supabase Auth bans', () => {
  assert.match(migration, /dabbir_private\.account_access_state/);
  assert.match(migration, /DABBIR_PLATFORM_ADMIN_IMMUTABLE/);
  assert.match(migration, /dabbir_private\.account_active\(\)/);
  assert.match(migration, /grant execute on function public\.dabbir_platform_set_account_access[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /update\s+auth\.users/i);
  assert.doesNotMatch(migration, /ban_duration/i);
});

test('suspended accounts are denied in central auth and session surfaces', () => {
  assert.match(authCore, /dabbir_account_access_self/);
  assert.match(authCore, /user\.dabbir_access === 'suspended'/);
  assert.match(session, /DABBIR_ACCOUNT_SUSPENDED/);
  assert.match(session, /423/);
  assert.match(session, /memberships:\s*\[\]/);
});

test('platform access mutation is same-origin, reason-gated and service-side', () => {
  assert.match(api, /requireSameOrigin\(req\)/);
  assert.match(api, /body\.action==='set_access'/);
  assert.match(api, /SUSPENSION_REASON_REQUIRED/);
  assert.match(api, /dabbir_platform_set_account_access/);
  assert.doesNotMatch(ui, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(ui, /SUSPEND /);
  assert.match(ui, /PLATFORM_ADMIN_IMMUTABLE/);
});

test('admin UI exposes DABBIR suspension and reactivation without removing recovery controls', () => {
  assert.match(ui, /Suspend account|تعليق الحساب/);
  assert.match(ui, /Reactivate account|إعادة تفعيل الحساب/);
  assert.match(ui, /recovery_preview/);
  assert.match(ui, /open_recovery/);
  assert.match(ui, /apply_recovery/);
  assert.match(ui, /x-dabbir-platform-customer-admin-ui','v2'/);
});
