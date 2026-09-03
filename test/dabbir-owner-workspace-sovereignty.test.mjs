import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const migration=read('supabase/migrations/20260903203000_dabbir_owner_workspace_sovereignty_v1.sql');
const portfolio=read('api/business-portfolio.js');
const workspaceUi=read('api/business-workspaces-ui.js');
const services=read('api/service-catalog.js');
const servicesUi=read('api/service-operations-ui.js');
const productManagement=read('api/owner-product-management.js');
const productUi=read('api/owner-operations-ui.js');

test('active owner authority cannot be narrowed by explicit membership permissions',()=>{
  assert.match(migration,/where role='owner' and cardinality\(coalesce\(permissions,'\{\}'::text\[\]\)\)>0/);
  assert.match(migration,/if new\.role='owner' then\s+new\.permissions='\{\}'::text\[\]/);
  assert.match(migration,/m\.role='owner'\s+or\s+\(cardinality\(m\.permissions\)>0/);
  assert.match(migration,/create trigger dabbir_owner_unrestricted_membership/);
});

test('workspace owner can manage business and branch lifecycle with billing-safe business deletion',()=>{
  for(const action of ['create_branch','update_branch','delete_branch','update_business','delete_business'])assert.match(portfolio,new RegExp(`action==='${action}'`));
  assert.match(portfolio,/requireOwner\(ctx,businessId\)/);
  assert.match(portfolio,/CANCEL_SUBSCRIPTION_BEFORE_BUSINESS_DELETE/);
  assert.match(portfolio,/BILLING_DELETE_BLOCKERS/);
  assert.match(migration,/create policy dabbir_businesses_owner_delete/);
  assert.match(workspaceUi,/data-dbw-edit-business/);
  assert.match(workspaceUi,/data-dbw-delete-business/);
  assert.match(workspaceUi,/data-dbw-edit-branch/);
  assert.match(workspaceUi,/data-dbw-delete-branch/);
});

test('owner has create edit and delete controls for services while historical rows are preserved',()=>{
  assert.match(services,/action==='create_service'/);
  assert.match(services,/action==='update_service'/);
  assert.match(services,/action==='delete_service'/);
  assert.match(services,/delete_mode:'owner_soft_delete'/);
  assert.match(services,/preserved_history:true/);
  assert.match(servicesUi,/data-svc-edit/);
  assert.match(servicesUi,/data-svc-delete/);
});

test('owner product lifecycle remains create edit and delete capable with history-safe deletion',()=>{
  assert.match(productManagement,/action==='update_product'/);
  assert.match(productManagement,/action==='delete_product'/);
  assert.match(productManagement,/active:false/);
  assert.match(productUi,/data-ops-edit/);
  assert.match(productUi,/data-ops-delete/);
});
