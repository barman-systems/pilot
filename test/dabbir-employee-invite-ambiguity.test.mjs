import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260903233500_dabbir_employee_primary_branch_scope_v2.sql', import.meta.url),
  'utf8',
);

test('employee invitation acceptance resolves PL/pgSQL business_id ambiguity through the concrete PK constraint', () => {
  assert.match(
    migration,
    /on conflict on constraint dabbir_membership_branches_pkey do nothing/i,
  );
  assert.doesNotMatch(
    migration,
    /on conflict\s*\(business_id\s*,\s*user_id\s*,\s*branch_id\s*\)\s*do nothing/i,
  );
});

test('ambiguity repair preserves the bounded primary-branch grant and public RPC contract', () => {
  assert.match(migration, /v_primary_branch\s*:=\s*dabbir_private\.primary_branch_for_business\(v_inv\.business_id\)/i);
  assert.match(migration, /insert into public\.dabbir_membership_branches[\s\S]*?v_inv\.business_id\s*,\s*v_user\s*,\s*v_primary_branch\s*,\s*v_inv\.invited_by/i);
  assert.match(migration, /create or replace function public\.dabbir_accept_employee_invitation\(p_token text\)/i);
  assert.match(migration, /security invoker/i);
});

test('ambiguity repair does not weaken branch security', () => {
  assert.doesNotMatch(migration, /disable row level security/i);
  assert.doesNotMatch(migration, /drop policy/i);
  assert.doesNotMatch(migration, /role\s*=\s*'owner'/i);
  assert.doesNotMatch(migration, /role\s*=\s*'admin'/i);
});
