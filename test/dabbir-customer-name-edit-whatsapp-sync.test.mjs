import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260908105600_dabbir_customer_name_owner_override_v1.sql',import.meta.url),'utf8');
const boundary=fs.readFileSync(new URL('../supabase/migrations/20260908112000_dabbir_customer_name_rpc_service_boundary_v2.sql',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../api/customer-profile.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../api/customer-name-ui.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../api/car-wash-loader-ui.js',import.meta.url),'utf8');
const bundles=JSON.parse(fs.readFileSync(new URL('../config/dabbir-ui-bundles.json',import.meta.url),'utf8'));
const webhook=fs.readFileSync(new URL('../api/dabbir-whatsapp-webhook.js',import.meta.url),'utf8');
const coexistence=fs.readFileSync(new URL('../api/_whatsapp-coexistence.js',import.meta.url),'utf8');

function compact(value){return value.replace(/\s+/g,' ')}

test('customer model keeps WhatsApp provider name separate from owner canonical name',()=>{
  assert.match(migration,/add column if not exists whatsapp_display_name text/);
  assert.match(migration,/display_name_source text not null default 'system'/);
  assert.match(migration,/owner_display_name_updated_at timestamptz/);
  assert.match(migration,/old\.display_name_source='owner'/);
  assert.match(migration,/new\.display_name:=old\.display_name/);
  assert.match(migration,/coalesce\(auth\.role\(\),'\'\)='service_role'/);
});

test('customer name write is service-only and independently rechecks the exact owner/admin actor',()=>{
  const source=compact(boundary);
  assert.match(source,/drop function if exists public\.dabbir_customer_update_display_name\(uuid,uuid,text\)/);
  assert.match(source,/coalesce\(\(select auth\.role\(\)\),'\'\)<>'service_role'/);
  assert.match(source,/m\.user_id=p_actor_user_id/);
  assert.match(source,/m\.role in \('owner','admin'\)/);
  assert.match(source,/revoke all on function public\.dabbir_customer_update_display_name\(uuid,uuid,uuid,text\) from public,anon,authenticated/);
  assert.match(source,/grant execute on function public\.dabbir_customer_update_display_name\(uuid,uuid,uuid,text\) to service_role/);
  assert.match(api,/serviceRpc\('dabbir_customer_update_display_name'/);
  assert.match(api,/p_actor_user_id:actorUserId/);
  assert.match(api,/canEdit\(member\)/);
  assert.match(api,/CUSTOMER_NAME_UPDATE_UNVERIFIED/);
});

test('owner UI exposes customer name edit without growing the frozen shell bundle',()=>{
  assert.equal(bundles.critical.length+bundles.deferred.length,26);
  assert.ok(!bundles.deferred.includes('/api/customer-name-ui'));
  assert.match(loader,/src:'\/api\/customer-name-ui\?v=20260908-1'/);
  assert.match(loader,/ready:'__dabbirCustomerNameEditor'/);
  assert.match(ui,/button\.dataset\.customerNameEdit=customer\.id/);
  assert.match(ui,/button\.id='dabbirChatCustomerEdit'/);
  assert.match(ui,/\/api\/customer-profile/);
  assert.match(ui,/display_name:name/);
});

test('WhatsApp names already arrive through message profile sync and Coexistence contact sync',()=>{
  assert.match(webhook,/contact\?\.profile\?\.name/);
  assert.match(webhook,/contactNames/);
  assert.match(coexistence,/type:'coexistence_contact'/);
  assert.match(coexistence,/p_display_name:clean\(event\.contactName/);
});
