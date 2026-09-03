import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260903232000_dabbir_employee_primary_branch_scope_v1.sql', import.meta.url),
  'utf8',
);
const branchScope = fs.readFileSync(
  new URL('../supabase/migrations/20260903210000_dabbir_branch_scope_source_reconciliation_v1.sql', import.meta.url),
  'utf8',
);

test('employee invitation acceptance grants only the active primary branch by default', () => {
  assert.match(migration, /v_primary_branch\s*:=\s*dabbir_private\.primary_branch_for_business\(v_inv\.business_id\)/i);
  assert.match(migration, /if v_primary_branch is null then raise exception 'DABBIR_ACTIVE_BRANCH_REQUIRED'/i);
  assert.match(migration, /insert into public\.dabbir_membership_branches[\s\S]*?v_inv\.business_id\s*,\s*v_user\s*,\s*v_primary_branch\s*,\s*v_inv\.invited_by/i);
  assert.match(migration, /on conflict \(business_id,user_id,branch_id\) do nothing/i);
  assert.doesNotMatch(migration, /insert into public\.dabbir_membership_branches[\s\S]*?select[\s\S]*?from public\.dabbir_business_branches[\s\S]*?where[\s\S]*?business_id=v_inv\.business_id/i);
});

test('legacy active employees with no explicit branch get one primary branch and existing scopes are preserved', () => {
  assert.match(migration, /m\.status='active'/i);
  assert.match(migration, /m\.role not in \('owner','admin'\)/i);
  assert.match(migration, /not exists\([\s\S]*?from public\.dabbir_membership_branches mb[\s\S]*?mb\.business_id=m\.business_id[\s\S]*?mb\.user_id=m\.user_id/i);
  assert.match(migration, /primary_branch_for_business\(m\.business_id\)/i);
});

test('branch RLS remains fail-closed and membership-branch based', () => {
  assert.match(branchScope, /create or replace function dabbir_private\.branch_access_allowed/i);
  assert.match(branchScope, /m\.role in \('owner','admin'\)[\s\S]*?or exists\([\s\S]*?from public\.dabbir_membership_branches mb/i);
  assert.match(branchScope, /p_branch_id is not null/i);
  assert.doesNotMatch(migration, /drop policy if exists dabbir_conversations_branch_restrict/i);
  assert.doesNotMatch(migration, /alter table public\.dabbir_conversations disable row level security/i);
});

test('invitation audit records the bounded branch grant', () => {
  assert.match(migration, /'branch_id',v_primary_branch/i);
  assert.match(migration, /'branch_scope','primary_default'/i);
});
