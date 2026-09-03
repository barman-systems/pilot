import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260903154000_dabbir_branch_scope_rls_completion_v1.sql','utf8');

test('conversations are forced into the branch contract',()=>{
  assert.match(migration,/update public\.dabbir_conversations[\s\S]*branch_id=dabbir_private\.primary_branch_for_business\(business_id\)[\s\S]*where branch_id is null/i);
  assert.match(migration,/alter table public\.dabbir_conversations alter column branch_id set not null/i);
  assert.match(migration,/create trigger dabbir_conversations_branch_guard/i);
  assert.match(migration,/execute function dabbir_private\.ensure_operational_branch\(\)/i);
});

test('conversations use restrictive branch access in addition to business permissions',()=>{
  assert.match(migration,/create policy dabbir_conversations_branch_restrict[\s\S]*as restrictive[\s\S]*for all[\s\S]*to authenticated/i);
  assert.match(migration,/using \(dabbir_private\.branch_access_allowed\(business_id,branch_id\)\)/i);
  assert.match(migration,/with check \(dabbir_private\.branch_access_allowed\(business_id,branch_id\)\)/i);
});

test('inventory movements use restrictive branch access in addition to business permissions',()=>{
  assert.match(migration,/create policy dabbir_inventory_movements_branch_restrict[\s\S]*as restrictive[\s\S]*for all[\s\S]*to authenticated/i);
  const branchChecks=migration.match(/dabbir_private\.branch_access_allowed\(business_id,branch_id\)/gi) || [];
  assert.ok(branchChecks.length>=4,'both restrictive policies must gate USING and WITH CHECK');
});

test('conversation backfill fails closed if any row remains without a branch',()=>{
  assert.match(migration,/DABBIR_CONVERSATION_BRANCH_BACKFILL_INCOMPLETE/);
});
