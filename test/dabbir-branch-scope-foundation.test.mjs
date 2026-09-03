import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260903152500_dabbir_branch_scope_foundation_v1.sql','utf8');
const broker=fs.readFileSync('supabase/functions/dabbir-owner-broker/index.ts','utf8');

test('branch scope is explicit and fail-closed for non owner/admin memberships',()=>{
  assert.match(migration,/create table if not exists public\.dabbir_membership_branches/i);
  assert.match(migration,/m\.role in \('owner','admin'\)/i);
  assert.match(migration,/dabbir_appointments_branch_restrict[\s\S]*as restrictive/i);
  assert.match(migration,/dabbir_orders_branch_restrict[\s\S]*as restrictive/i);
  assert.match(migration,/DABBIR_ACTIVE_BRANCH_REQUIRED/);
});

test('branch resources are modeled without duplicating business-level catalog/customer identity',()=>{
  assert.match(migration,/create table if not exists public\.dabbir_branch_services/i);
  assert.match(migration,/create table if not exists public\.dabbir_branch_products/i);
  assert.match(migration,/create table if not exists public\.dabbir_worker_branches/i);
  assert.match(migration,/create table if not exists public\.dabbir_branch_inventory/i);
  assert.doesNotMatch(migration,/alter table public\.dabbir_customers add column[^;]*branch_id/i);
  assert.match(migration,/DABBIR_SERVICE_NOT_AVAILABLE_IN_BRANCH/);
  assert.match(migration,/DABBIR_WORKER_NOT_ASSIGNED_TO_BRANCH/);
  assert.match(migration,/DABBIR_PRODUCT_NOT_AVAILABLE_IN_BRANCH/);
});

test('owner broker OTP actor is pinned to active root owner, not arbitrary active admin',()=>{
  assert.match(broker,/role=eq\.ROOT_OWNER/);
  assert.match(broker,/revoked_at=is\.null/);
  assert.match(broker,/suspended_at=is\.null/);
  assert.doesNotMatch(broker,/dabbir_platform_admins\?active=eq\.true&select=user_id/);
});
