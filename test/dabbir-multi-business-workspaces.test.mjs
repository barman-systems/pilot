import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

const api = read('api/business-portfolio.js');
const ui = read('api/business-workspaces-ui.js');
const migration = read('supabase/migrations/20260831190000_dabbir_multi_business_branches_v1.sql');
const bundles = JSON.parse(read('config/dabbir-ui-bundles.json'));
const ownership = JSON.parse(read('config/dabbir-architecture-ownership.json'));

test('multi-business UI stays inside the shell module ceiling and composes the retired slot', () => {
  const modules = [...bundles.critical, ...bundles.deferred];
  assert.ok(modules.includes('/api/business-workspaces-ui'));
  assert.equal(modules.includes('/api/dabbir-customer-number-ui'), false);
  assert.ok(modules.length <= ownership.shell.maximum_injected_api_modules);
  assert.equal(new Set(modules).size, modules.length);
  assert.match(ui, /import customerNumberHandler from '\.\/dabbir-customer-number-ui\.js'/);
});

test('business portfolio does not create a competing primary navigation destination', () => {
  assert.doesNotMatch(ui, /querySelector\(['"]\.side \.nav['"]\)/);
  assert.doesNotMatch(ui, /data-screen=["']business-portfolio/);
  assert.match(ui, /#screen-more \.moreGrid/);
  assert.match(ui, /id='dbwMoreCard'|id="dbwMoreCard"/);
});

test('workspace selector persists and restores an authorized active business', () => {
  assert.match(ui, /dabbir_active_business_id/);
  assert.match(ui, /localStorage\.setItem\(ACTIVE_KEY,id\)/);
  assert.match(ui, /await loadRuntime\(id\)/);
  assert.match(ui, /some\(function\(b\)\{return b\.id===saved\}\)/);
});

test('owners can create another business and manage branch lifecycle without another login', () => {
  assert.match(ui, /action:'create_business'/);
  assert.match(ui, /action=kind==='branch-edit'\?'update_branch':'create_branch'/);
  for (const action of ['create_branch','update_branch','delete_branch','update_business','delete_business']) {
    assert.match(api, new RegExp(`action==='${action}'`));
  }
  assert.match(api, /BUSINESS_ACCESS_DENIED/);
  assert.match(api, /BUSINESS_MANAGEMENT_REQUIRED/);
  assert.match(api, /membershipFor\(ctx\.memberships, businessId\)/);
  assert.match(api, /created_by: ctx\.user\.id/);
});

test('branch registry is tenant scoped with one primary branch per business', () => {
  assert.match(migration, /create table if not exists public\.dabbir_business_branches/i);
  assert.match(migration, /references public\.dabbir_businesses\(id\) on delete cascade/i);
  assert.match(migration, /alter table public\.dabbir_business_branches enable row level security/i);
  assert.match(migration, /dabbir_private\.is_active_member\(business_id\)/i);
  assert.match(migration, /dabbir_private\.has_permission\(business_id, 'manage_business'::text\)/i);
  assert.match(migration, /where is_primary = true/i);
  assert.match(migration, /insert into public\.dabbir_business_branches[\s\S]*v_id[\s\S]*v_name/i);
});

test('owner portfolio metrics remain RLS-aware and ignore simulated daily commerce', () => {
  assert.match(migration, /create or replace function public\.dabbir_owner_business_metrics\(\)/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /m\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /a\.simulated = false/i);
  assert.match(migration, /o\.simulated = false/i);
  assert.match(api, /supabaseRpc\('dabbir_owner_business_metrics'/);
});
